import { autorun, intercept, observe, reaction } from "mobx";
import { RejectionCode, createContainer } from "../..";
import { Write, asAccepted, asDiscarded, persist, settle } from "./helpers";

type Model = { hp: number; name: string };

/**
 * What a step looked like to its reactions.
 */
type Seen = { hp: number; name: string; stepId: number; mutations: string[] };

/**
 * A hero whose every step is written to a database. The write is awaited, so
 * the container keeps what is presented meanwhile waiting.
 */
function createFraktar(writes: Write[], steps: Seen[] = []) {
  const Fraktar = createContainer<Model>()
    .addAcceptor("addHP", {
      condition: (data, hp: number) => data.hp + hp >= 0,
      mutator: (data, hp: number) => {
        data.hp += hp;
      },
    })
    .addAcceptor("setName", {
      mutator: (data, name: string) => {
        data.name = name;
      },
    })
    .addActions({
      heal: (hp: number) => [{ type: "addHP", payload: hp }],
      hit: (hp: number) => [{ type: "addHP", payload: -hp }],
      rename: "setName",
    })
    .addStepReaction({
      runOnInit: false,
      do: ({ data, delta }) => {
        steps.push({
          hp: data.hp,
          name: data.name,
          stepId: Fraktar.stepId,
          mutations: delta.acceptedMutations.map(({ type }) => type),
        });
      },
    })
    .addStepReaction(persist(writes))
    .create({ hp: 10, name: "Fraktar" });

  return Fraktar;
}

beforeEach(function () {
  jest.spyOn(console, "info").mockImplementation(() => {});
  jest.spyOn(console, "warn").mockImplementation(() => {});
  jest.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(function () {
  jest.restoreAllMocks();
});

describe("actions called during a write", function () {
  it("should wait for the write to end", async function () {
    const writes: Write[] = [];
    const Fraktar = createFraktar(writes);

    Fraktar.actions.heal(1);
    Fraktar.actions.heal(2);

    // The first step is being written, the second action waits.
    expect(Fraktar.stepId).toBe(1);
    expect(Fraktar.representationRef.current.hp).toBe(11);

    writes[0].done();
    await settle();

    expect(Fraktar.stepId).toBe(2);
    expect(Fraktar.representationRef.current.hp).toBe(13);
  });

  it("should each be given their own step", async function () {
    const writes: Write[] = [];
    const steps: Seen[] = [];
    const Fraktar = createFraktar(writes, steps);

    Fraktar.actions.heal(1);
    // Two actions wait behind the first write. They used to be merged in one
    // step holding two mutations.
    Fraktar.actions.heal(2);
    Fraktar.actions.heal(3);

    writes[0].done();
    await settle();
    writes[1].done();
    await settle();

    expect(steps).toEqual([
      { hp: 11, name: "Fraktar", stepId: 1, mutations: ["addHP"] },
      { hp: 13, name: "Fraktar", stepId: 2, mutations: ["addHP"] },
      { hp: 16, name: "Fraktar", stepId: 3, mutations: ["addHP"] },
    ]);
  });

  it("should be presented in the order they arrived", async function () {
    const writes: Write[] = [];
    const steps: Seen[] = [];
    const Fraktar = createFraktar(writes, steps);

    Fraktar.actions.heal(1);
    Fraktar.actions.rename("Elwing");
    Fraktar.actions.rename("Dreadbond");
    Fraktar.actions.rename("Thrall");

    for (let write = 0; write < 3; write++) {
      writes[write].done();
      await settle();
    }

    expect(steps.map(({ name }) => name)).toEqual([
      "Fraktar",
      "Elwing",
      "Dreadbond",
      "Thrall",
    ]);
  });

  it("should not have their write started before the one ahead ended", async function () {
    const writes: Write[] = [];
    const Fraktar = createFraktar(writes);

    Fraktar.actions.heal(1);
    Fraktar.actions.heal(2);
    await settle();

    expect(writes.length).toBe(1);

    writes[0].done();
    await settle();

    expect(writes.length).toBe(2);
  });

  it("should be reported one by one on the last attempt", async function () {
    const writes: Write[] = [];
    const Fraktar = createFraktar(writes);
    const attempts: Array<number | undefined> = [];
    const dispose = autorun(() =>
      attempts.push(Fraktar.lastAttempt?.attemptedAt)
    );

    Fraktar.actions.heal(1);
    Fraktar.actions.heal(2);
    // Nothing is known of the second action until it is presented.
    expect(attempts).toEqual([undefined, 0]);

    writes[0].done();
    await settle();

    expect(attempts).toEqual([undefined, 0, 1]);
    dispose();
  });
});

describe("a waiting action which the model refuses", function () {
  it("should not hold the ones behind it", async function () {
    const writes: Write[] = [];
    const Fraktar = createFraktar(writes);

    Fraktar.actions.heal(1);
    // Refused by the acceptor when its turn comes: no step, no write.
    Fraktar.actions.hit(100);
    Fraktar.actions.rename("Elwing");

    writes[0].done();
    await settle();

    expect(writes.length).toBe(2);
    expect(Fraktar.stepId).toBe(2);
    expect(Fraktar.representationRef.current).toEqual({
      hp: 11,
      name: "Elwing",
    });
  });
});

describe("a waiting action which is not allowed anymore", function () {
  it("should be discarded when its turn comes", async function () {
    const writes: Write[] = [];
    const Fraktar = createContainer<{ potions: number; hp: number }>()
      .addAcceptor("addHP", {
        mutator: (data, hp: number) => {
          data.hp += hp;
        },
      })
      .addAcceptor("usePotion", {
        mutator: (data) => {
          data.potions--;
          data.hp += 5;
        },
      })
      .addControlStatePredicate("HAS_POTION", ({ data }) => data.potions > 0)
      .addActions({
        rest: () => [{ type: "addHP", payload: 1 }],
        drink: {
          isAllowed: ({ controlStates }) =>
            controlStates.includes("HAS_POTION"),
          action: () => [{ type: "usePotion", payload: undefined }],
        },
      })
      .addStepReaction(persist(writes))
      .create({ potions: 1, hp: 1 });

    Fraktar.actions.rest();
    // Both are allowed when they are called: the only potion is still there.
    Fraktar.actions.drink();
    Fraktar.actions.drink();
    writes[0].done();
    await settle();
    writes[1].done();
    await settle();

    // The second one was presented in a state where there is no potion left.
    const attempt = asDiscarded(Fraktar.lastAttempt);
    expect(attempt.reason.code).toBe(RejectionCode.unauthorized);
    expect(attempt.reason.meta).toEqual({ action: "drink", controlStates: [] });
    expect(Fraktar.representationRef.current).toEqual({ potions: 0, hp: 7 });
  });
});

describe("the step id of a waiting action", function () {
  it("should be the one of the step it is presented against", async function () {
    const writes: Write[] = [];
    const tags: Array<number | undefined> = [];
    const Fraktar = createContainer<Model>()
      .addAcceptor("addHP", {
        mutator: (data, hp: number) => {
          data.hp += hp;
        },
      })
      .addActions({ heal: (hp: number) => [{ type: "addHP", payload: hp }] })
      .addStepReaction({
        runOnInit: false,
        do: ({ delta }) => tags.push(delta.proposal.stepId),
      })
      .addStepReaction(persist(writes))
      .create({ hp: 10, name: "Fraktar" });

    Fraktar.actions.heal(1);
    // Both are called at the step 1. Waiting is the container's doing: it does
    // not make them stale.
    Fraktar.actions.heal(2);
    Fraktar.actions.heal(3);

    writes[0].done();
    await settle();
    writes[1].done();
    await settle();

    // A rollback places a step from this tag.
    expect(tags).toEqual([0, 1, 2]);
    expect(Fraktar.stepId).toBe(3);
    expect(asAccepted(Fraktar.lastAttempt).attemptedAt).toBe(2);
  });
});

describe("a cancelable action", function () {
  /**
   * The potion takes a while to act: the test decides when.
   */
  function createDrinker(writes: Write[]) {
    let swallow!: () => void;
    const potion = new Promise<void>((resolve) => {
      swallow = resolve;
    });
    const Fraktar = createContainer<Model>()
      .addAcceptor("addHP", {
        mutator: (data, hp: number) => {
          data.hp += hp;
        },
      })
      .addActions({
        heal: (hp: number) => [{ type: "addHP", payload: hp }],
        drink: {
          isAsync: true,
          isCancelable: true,
          action: async (hp: number) => {
            await potion;
            return [{ type: "addHP", payload: hp }];
          },
        },
      })
      .addStepReaction(persist(writes))
      .create({ hp: 10, name: "Fraktar" });

    return { Fraktar, swallow };
  }

  it("should be presented when it only had to wait for a write", async function () {
    const writes: Write[] = [];
    const { Fraktar, swallow } = createDrinker(writes);

    Fraktar.actions.heal(1);
    // Called and resolved at the step 1, while its write is running.
    Fraktar.actions.drink(5);
    swallow();
    await settle();

    writes[0].done();
    await settle();

    // No step was taken in between: nothing canceled it.
    expect(Fraktar.representationRef.current.hp).toBe(16);
    expect(Fraktar.stepId).toBe(2);
  });

  it("should be dropped when a step was taken before its turn", async function () {
    const writes: Write[] = [];
    const { Fraktar, swallow } = createDrinker(writes);

    Fraktar.actions.heal(1);
    // The potion is drunk first, but it resolves behind another action.
    const pending = Fraktar.actions.drink(5);
    Fraktar.actions.heal(2);
    swallow();
    await pending;

    writes[0].done();
    await settle();
    writes[1].done();
    await settle();

    // The one which presents first wins, in the queue as outside of it.
    const attempt = asDiscarded(Fraktar.lastAttempt);
    expect(attempt.reason.code).toBe(RejectionCode.staleProposal);
    expect(attempt.reason.meta).toEqual({ proposalStepId: 1 });
    expect(attempt.attemptedAt).toBe(2);
    expect(Fraktar.representationRef.current.hp).toBe(13);
  });

  it("should be dropped at once when it comes back stale during a write", async function () {
    const writes: Write[] = [];
    const { Fraktar, swallow } = createDrinker(writes);

    // The potion is drunk at the step 0, then a step is taken.
    const pending = Fraktar.actions.drink(5);
    Fraktar.actions.heal(1);
    swallow();
    await pending;

    // It does not wait for the write to be told so.
    expect(writes.length).toBe(1);
    expect(asDiscarded(Fraktar.lastAttempt).reason.code).toBe(
      RejectionCode.staleProposal
    );
  });

  it("should be dropped when a rollback gave the step id it was called at back", async function () {
    const writes: Write[] = [];
    const { Fraktar, swallow } = createDrinker(writes);
    Fraktar.actions.heal(1);
    writes[0].done();
    await settle();

    // Drunk at the step 1...
    const pending = Fraktar.actions.drink(5);
    // ... and the container is at the step 1 again, of another story.
    Fraktar.rollback({
      data: { hp: 3, name: "Fraktar" },
      delta: {
        acceptedMutations: [],
        proposal: Object.assign([], { stepId: 0 }),
        controlStates: [],
        previousControlStates: [],
      },
    });
    writes[1].done();
    await settle();
    swallow();
    await pending;

    expect(asDiscarded(Fraktar.lastAttempt).reason.code).toBe(
      RejectionCode.staleProposal
    );
    expect(Fraktar.representationRef.current.hp).toBe(3);
  });

  it("should be dropped when a reset happened since, at the very same step", async function () {
    const writes: Write[] = [];
    const { Fraktar, swallow } = createDrinker(writes);

    // Drunk at the creation step...
    const pending = Fraktar.actions.drink(5);
    // ... which is given again, to another hero.
    Fraktar.reset({ hp: 3, name: "Elwing" });
    swallow();
    await pending;

    expect(asDiscarded(Fraktar.lastAttempt).reason.code).toBe(
      RejectionCode.staleProposal
    );
    expect(Fraktar.representationRef.current.hp).toBe(3);
  });

  it("should be discarded as not allowed when it is not anymore, although nothing canceled it", async function () {
    const writes: Write[] = [];
    let isOpen = true;
    const Fraktar = createContainer<Model>()
      .addAcceptor("addHP", {
        mutator: (data, hp: number) => {
          data.hp += hp;
        },
      })
      .addActions({
        heal: (hp: number) => [{ type: "addHP", payload: hp }],
        drink: {
          isAsync: true,
          isCancelable: true,
          // The tavern serves as long as it is open.
          isAllowed: () => isOpen,
          action: async (hp: number) => [{ type: "addHP", payload: hp }],
        },
      })
      .addStepReaction(persist(writes))
      .create({ hp: 10, name: "Fraktar" });

    Fraktar.actions.heal(1);
    Fraktar.actions.drink(5);
    await settle();
    isOpen = false;
    writes[0].done();
    await settle();

    expect(asDiscarded(Fraktar.lastAttempt).reason.code).toBe(
      RejectionCode.unauthorized
    );
    expect(Fraktar.representationRef.current.hp).toBe(11);
  });
});

describe("what the reactions propose", function () {
  /**
   * A hero who blesses himself after each hit. The blessing is proposed by a
   * reaction, either at once or after it waited for the priest.
   */
  function createBlessed(
    writes: Write[],
    steps: string[][],
    priest?: Promise<void>
  ) {
    return createContainer<Model>()
      .addAcceptor("addHP", {
        mutator: (data, hp: number) => {
          data.hp += hp;
        },
      })
      .addAcceptor("setName", {
        mutator: (data, name: string) => {
          data.name = name;
        },
      })
      .addActions({
        hit: (hp: number) => [{ type: "addHP", payload: -hp }],
        heal: (hp: number) => [{ type: "addHP", payload: hp }],
        rename: "setName",
      })
      .addStepReaction({
        runOnInit: false,
        do: ({ delta }) =>
          steps.push(delta.acceptedMutations.map(({ type }) => type)),
      })
      .addStepReaction({
        debugName: "bless",
        awaitAsync: priest !== undefined,
        runOnInit: false,
        when: ({ delta }) =>
          delta.acceptedMutations.some(({ payload }) => payload < 0),
        do: ({ actions, compose }) => {
          if (priest === undefined) {
            actions.heal(1);
            compose(({ rename }) => [rename("Fraktar the blessed")]);
            return;
          }
          return priest.then(() => {
            actions.heal(1);
            compose(({ rename }) => [rename("Fraktar the blessed")]);
          });
        },
      })
      .addStepReaction(persist(writes))
      .create({ hp: 10, name: "Fraktar" });
  }

  it("should still be composed in one step", async function () {
    const writes: Write[] = [];
    const steps: string[][] = [];
    const Fraktar = createBlessed(writes, steps);

    Fraktar.actions.hit(3);
    writes[0].done();
    await settle();

    expect(steps).toEqual([["addHP"], ["addHP", "setName"]]);
    expect(Fraktar.stepId).toBe(2);
  });

  it("should be presented before the actions which wait", async function () {
    const writes: Write[] = [];
    const steps: string[][] = [];
    const Fraktar = createBlessed(writes, steps);

    Fraktar.actions.hit(3);
    Fraktar.actions.rename("Elwing");

    writes[0].done();
    await settle();
    writes[1].done();
    await settle();

    // The blessing renamed the hero first, then the waiting action did.
    expect(steps).toEqual([["addHP"], ["addHP", "setName"], ["setName"]]);
    expect(Fraktar.representationRef.current).toEqual({
      hp: 8,
      name: "Elwing",
    });
  });

  it("should stay theirs when they propose after having waited", async function () {
    let answer!: () => void;
    const priest = new Promise<void>((resolve) => {
      answer = resolve;
    });
    const writes: Write[] = [];
    const steps: string[][] = [];
    const Fraktar = createBlessed(writes, steps, priest);

    Fraktar.actions.hit(3);
    // Arrives while the reaction waits for the priest, so before the blessing.
    Fraktar.actions.rename("Elwing");
    answer();
    await settle();

    writes[0].done();
    await settle();
    writes[1].done();
    await settle();

    expect(steps).toEqual([["addHP"], ["addHP", "setName"], ["setName"]]);
    expect(Fraktar.representationRef.current).toEqual({
      hp: 8,
      name: "Elwing",
    });
  });

  it("should be composed whatever the reaction calls to propose", function () {
    const steps: string[][] = [];
    const Fraktar = createContainer<Model>()
      .addAcceptor("addHP", {
        mutator: (data, hp: number) => {
          data.hp += hp;
        },
      })
      .addAcceptor("setName", {
        mutator: (data, name: string) => {
          data.name = name;
        },
      })
      .addActions({
        hit: (hp: number) => [{ type: "addHP", payload: -hp }],
        heal: (hp: number) => [{ type: "addHP", payload: hp }],
        rename: "setName",
      })
      .addStepReaction({
        runOnInit: false,
        do: ({ delta }) =>
          steps.push(delta.acceptedMutations.map(({ type }) => type)),
      })
      .addStepReaction({
        runOnInit: false,
        when: ({ delta }) =>
          delta.acceptedMutations.some(({ payload }) => payload < 0),
        // The container itself, not what the reaction is given.
        do: () => {
          Fraktar.actions.heal(1);
          Fraktar.compose(({ rename }) => [rename("Fraktar the blessed")]);
        },
      })
      .create({ hp: 10, name: "Fraktar" });

    Fraktar.actions.hit(3);

    expect(steps).toEqual([["addHP"], ["addHP", "setName"]]);
  });

  it("should leave their turn to the actions which wait when the model refuses it", async function () {
    const writes: Write[] = [];
    const Fraktar = createContainer<Model>()
      .addAcceptor("addHP", {
        condition: (data, hp: number) => data.hp + hp >= 0,
        mutator: (data, hp: number) => {
          data.hp += hp;
        },
      })
      .addAcceptor("setName", {
        mutator: (data, name: string) => {
          data.name = name;
        },
      })
      .addActions({
        hit: (hp: number) => [{ type: "addHP", payload: -hp }],
        rename: "setName",
      })
      // A blow too many, which the model refuses.
      .addStepReaction({
        runOnInit: false,
        when: ({ data }) => data.hp === 5,
        do: ({ actions }) => actions.hit(50),
      })
      .addStepReaction(persist(writes))
      .create({ hp: 10, name: "Fraktar" });

    Fraktar.actions.hit(5);
    Fraktar.actions.rename("Fraktar the wounded");
    writes[0].done();
    await settle();

    expect(Fraktar.representationRef.current).toEqual({
      hp: 5,
      name: "Fraktar the wounded",
    });
    expect(Fraktar.stepId).toBe(2);
  });
});

describe("a reaction which proposes once its step is over", function () {
  /**
   * The blessing is not awaited: it comes later, once the priest answers,
   * when the step of the hit is long over.
   */
  function createLateBlessed(
    writes: Write[],
    steps: string[][],
    priest: Promise<void>
  ) {
    return createContainer<Model>()
      .addAcceptor("addHP", {
        mutator: (data, hp: number) => {
          data.hp += hp;
        },
      })
      .addAcceptor("setName", {
        mutator: (data, name: string) => {
          data.name = name;
        },
      })
      .addActions({
        hit: (hp: number) => [{ type: "addHP", payload: -hp }],
        heal: (hp: number) => [{ type: "addHP", payload: hp }],
        rename: "setName",
      })
      .addStepReaction({
        runOnInit: false,
        do: ({ delta }) =>
          steps.push(
            delta.acceptedMutations.map(
              ({ type, payload }) => `${type} ${payload}`
            )
          ),
      })
      .addStepReaction({
        runOnInit: false,
        when: ({ delta }) =>
          delta.acceptedMutations.some(({ payload }) => payload < 0),
        do: ({ actions }) => {
          priest.then(() => actions.heal(1));
        },
      })
      .addStepReaction({
        debugName: "title",
        runOnInit: false,
        when: ({ delta }) =>
          delta.acceptedMutations.some(({ payload }) => payload === "Elwing"),
        do: ({ actions }) => actions.rename("Elwing the renamed"),
      })
      .addStepReaction(persist(writes))
      .create({ hp: 10, name: "Fraktar" });
  }

  it("should start a step of its own", async function () {
    let answer!: () => void;
    const priest = new Promise<void>((resolve) => {
      answer = resolve;
    });
    const writes: Write[] = [];
    const steps: string[][] = [];
    const Fraktar = createLateBlessed(writes, steps, priest);

    Fraktar.actions.hit(3);
    writes[0].done();
    await settle();
    expect(Fraktar.stepId).toBe(1);

    answer();
    await settle();

    expect(steps).toEqual([["addHP -3"], ["addHP 1"]]);
  });

  it("should not be composed with what the reactions of another step propose", async function () {
    let answer!: () => void;
    const priest = new Promise<void>((resolve) => {
      answer = resolve;
    });
    const writes: Write[] = [];
    const steps: string[][] = [];
    const Fraktar = createLateBlessed(writes, steps, priest);

    Fraktar.actions.hit(3);
    writes[0].done();
    await settle();
    Fraktar.actions.rename("Elwing");
    Fraktar.actions.heal(5);
    // The reaction of the hit proposes now, during the write of the rename.
    answer();
    await settle();
    for (let write = 1; write < 5; write++) {
      writes[write].done();
      await settle();
    }

    // The title is the next action of the rename. The blessing is none of
    // its business: it waits its turn, behind the heal which arrived first.
    expect(steps).toEqual([
      ["addHP -3"],
      ["setName Elwing"],
      ["setName Elwing the renamed"],
      ["addHP 5"],
      ["addHP 1"],
    ]);
  });
});

describe("a step started by a reaction", function () {
  it("should keep the others waiting during its write too", async function () {
    const writes: Write[] = [];
    const Fraktar = createContainer<Model>()
      .addAcceptor("addHP", {
        mutator: (data, hp: number) => {
          data.hp += hp;
        },
      })
      .addActions({
        hit: (hp: number) => [{ type: "addHP", payload: -hp }],
        heal: (hp: number) => [{ type: "addHP", payload: hp }],
      })
      .addStepReaction({
        debugName: "auto heal",
        runOnInit: false,
        when: ({ data }) => data.hp < 10,
        do: ({ actions }) => actions.heal(1),
      })
      .addStepReaction({
        ...persist(writes),
        // The hit is not written, the healing it triggers is.
        when: ({ delta }) =>
          delta.acceptedMutations.some(({ payload }) => payload > 0),
      })
      .create({ hp: 10, name: "Fraktar" });

    Fraktar.actions.hit(1);
    expect(Fraktar.stepId).toBe(2);
    expect(writes.length).toBe(1);

    // Used to go through: the guard was dropped for a step the reactions started.
    Fraktar.actions.heal(5);
    expect(Fraktar.stepId).toBe(2);

    writes[0].done();
    await settle();

    expect(Fraktar.stepId).toBe(3);
    expect(Fraktar.representationRef.current.hp).toBe(15);
  });
});

describe("many waiting actions", function () {
  /**
   * Only the first step is written: the ones behind it end at once.
   */
  function createPatient(writes: Write[]) {
    return (
      createContainer<Model>()
        .addAcceptor("addHP", {
          mutator: (data, hp: number) => {
            data.hp += hp;
          },
        })
        .addAcceptor("setName", {
          mutator: (data, name: string) => {
            data.name = name;
          },
        })
        .addActions({
          heal: (hp: number) => [{ type: "addHP", payload: hp }],
          rename: "setName",
        })
        .addStepReaction({
          ...persist(writes),
          when: ({ data, delta }) =>
            data.hp === 11 &&
            delta.acceptedMutations.some(({ type }) => type === "addHP"),
        })
        // No acceptor ever refuses it: past a thousand, this one is a runaway.
        .addStepReaction({
          runOnInit: false,
          when: ({ data, delta }) =>
            data.hp >= 1000 &&
            delta.acceptedMutations.some(({ type }) => type === "addHP"),
          do: ({ actions }) => actions.heal(1),
        })
        .create({ hp: 10, name: "Fraktar" })
    );
  }

  it("should not be taken for a runaway cascade", async function () {
    const writes: Write[] = [];
    const Fraktar = createPatient(writes);

    Fraktar.actions.heal(1);
    // One more than the reactions may start in a row.
    for (let action = 0; action < 51; action++) {
      Fraktar.actions.heal(1);
    }

    writes[0].done();
    await settle();

    expect(Fraktar.stepId).toBe(52);
    expect(Fraktar.representationRef.current.hp).toBe(62);
    expect(asAccepted(Fraktar.lastAttempt).settled).toBe(true);
  });

  it("should not eat the stack", async function () {
    const writes: Write[] = [];
    const Fraktar = createPatient(writes);

    Fraktar.actions.heal(1);
    for (let action = 0; action < 20000; action++) {
      Fraktar.actions.rename(`Fraktar ${action}`);
    }

    writes[0].done();
    await settle();

    expect(Fraktar.stepId).toBe(20001);
  });

  it("should leave the cascade guard to the reactions", async function () {
    const writes: Write[] = [];
    const Fraktar = createPatient(writes);

    Fraktar.actions.heal(1);
    Fraktar.actions.heal(1000);
    Fraktar.actions.rename("Elwing");

    writes[0].done();
    await settle();

    // The runaway was cut after fifty steps, then the last action had its turn.
    expect(Fraktar.representationRef.current).toEqual({
      hp: 1011 + 50,
      name: "Elwing",
    });
  });
});

describe("a rollback or a reset while actions wait", function () {
  it("should be refused as during any write, and leave them their turn", async function () {
    const writes: Write[] = [];
    const Fraktar = createFraktar(writes);

    Fraktar.actions.heal(1);
    Fraktar.actions.heal(2);

    Fraktar.reset({ hp: 10, name: "Fraktar" });
    Fraktar.rollback({
      data: { hp: 10, name: "Fraktar" },
      delta: {
        acceptedMutations: [],
        proposal: Object.assign([], { stepId: 4 }),
        controlStates: [],
        previousControlStates: [],
      },
    });

    // Neither moved the model under the write.
    expect(Fraktar.stepId).toBe(1);
    expect(Fraktar.representationRef.current.hp).toBe(11);

    writes[0].done();
    await settle();

    expect(Fraktar.stepId).toBe(2);
    expect(Fraktar.representationRef.current.hp).toBe(13);
  });
});

describe("a reaction which throws while actions wait", function () {
  it("should leave them their turn: the step stands", async function () {
    const writes: Write[] = [];
    const Fraktar = createContainer<Model>()
      .addAcceptor("addHP", {
        mutator: (data, hp: number) => {
          data.hp += hp;
        },
      })
      .addActions({ heal: (hp: number) => [{ type: "addHP", payload: hp }] })
      .addStepReaction(persist(writes))
      // Not awaited: the write of the step was done when it throws.
      .addStepReaction({
        runOnInit: false,
        when: ({ data }) => data.hp === 11,
        do: () => {
          throw new Error("boom");
        },
      })
      .create({ hp: 10, name: "Fraktar" });

    Fraktar.actions.heal(1);
    Fraktar.actions.heal(2);

    writes[0].done();
    await settle();

    // The waiting action is presented against the step which stands.
    expect(Fraktar.stepId).toBe(2);
    expect(Fraktar.representationRef.current.hp).toBe(13);
  });
});

describe("a waiting action which breaks the model", function () {
  it("should not hold the ones behind it", async function () {
    const writes: Write[] = [];
    const Fraktar = createContainer<Model>()
      .addAcceptor("addHP", {
        mutator: (data, hp: number) => {
          data.hp += hp;
        },
      })
      .addAcceptor("curse", {
        mutator: () => {
          throw new Error("the acceptor is cursed");
        },
      })
      .addActions({
        heal: (hp: number) => [{ type: "addHP", payload: hp }],
        curse: "curse",
      })
      .addStepReaction(persist(writes))
      .create({ hp: 10, name: "Fraktar" });

    Fraktar.actions.heal(1);
    // Nobody is there to catch it when its turn comes.
    Fraktar.actions.curse();
    Fraktar.actions.heal(2);

    writes[0].done();
    await settle();

    expect(Fraktar.stepId).toBe(2);
    expect(Fraktar.representationRef.current.hp).toBe(13);
  });
});

describe("a reaction of the creation which fails while a step is written", function () {
  it("should not be reported on the attempt of that step", async function () {
    const writes: Write[] = [];
    const Fraktar = createContainer<Model>()
      .addAcceptor("addHP", {
        mutator: (data, hp: number) => {
          data.hp += hp;
        },
      })
      .addActions({ heal: (hp: number) => [{ type: "addHP", payload: hp }] })
      // Runs at creation too: the container is open meanwhile.
      .addStepReaction({ ...persist(writes), runOnInit: true })
      .create({ hp: 10, name: "Fraktar" });

    Fraktar.actions.heal(1);
    writes[0].fail(new Error("the first write failed"));
    await settle();

    // The step has a write of its own, which is still running.
    expect(asAccepted(Fraktar.lastAttempt).settled).toBe(true);
  });
});

describe("a custom representation", function () {
  it("should show a step once its write is done, and the steps it started", async function () {
    const writes: Write[] = [];
    const Fraktar = createContainer<Model>()
      .addAcceptor("addHP", {
        mutator: (data, hp: number) => {
          data.hp += hp;
        },
      })
      .addActions({
        hit: (hp: number) => [{ type: "addHP", payload: -hp }],
        heal: (hp: number) => [{ type: "addHP", payload: hp }],
      })
      .addStepReaction({
        debugName: "auto heal",
        runOnInit: false,
        when: ({ delta }) =>
          delta.acceptedMutations.some(({ payload }) => payload < 0),
        do: ({ actions }) => actions.heal(1),
      })
      .addStepReaction(persist(writes))
      .addTransformation(({ data }) => ({ health: data.hp }))
      .create({ hp: 10, name: "Fraktar" });
    const shown: number[] = [];
    const dispose = autorun(() =>
      shown.push(Fraktar.representationRef.current.health)
    );

    Fraktar.actions.hit(3);
    Fraktar.actions.hit(1);
    writes[0].done();
    await settle();

    // The hit is written. The healing it started is being written: neither
    // is shown, the healing could still fail.
    expect(Fraktar.stepId).toBe(2);
    expect(shown).toEqual([10]);

    writes[1].done();
    await settle();

    // Both at once, and the next hit is being written.
    expect(shown).toEqual([10, 8]);
    dispose();
  });

  it("should leave what the reactions of a step propose to that step", async function () {
    const writes: Write[] = [];
    const Fraktar = createContainer<Model>()
      .addAcceptor("addHP", {
        mutator: (data, hp: number) => {
          data.hp += hp;
        },
      })
      .addActions({
        hit: (hp: number) => [{ type: "addHP", payload: -hp }],
        heal: (hp: number) => [{ type: "addHP", payload: hp }],
      })
      .addStepReaction({
        debugName: "auto heal",
        runOnInit: false,
        when: ({ delta }) =>
          delta.acceptedMutations.some(({ payload }) => payload < 0),
        do: ({ actions }) => actions.heal(1),
      })
      // Runs at creation too: the container is open meanwhile.
      .addStepReaction({ ...persist(writes), runOnInit: true })
      .create({ hp: 10, name: "Fraktar" });

    Fraktar.actions.hit(3);
    // The write of the creation ends. The healing waits for the write of the
    // hit: it is not for the pass of the creation to present it.
    writes[0].done();
    await settle();
    expect(Fraktar.stepId).toBe(1);

    writes[1].done();
    await settle();
    expect(Fraktar.stepId).toBe(2);
    expect(Fraktar.representationRef.current.hp).toBe(8);
  });

  it("should not show a step being written when a reaction of the creation ends", async function () {
    const writes: Write[] = [];
    const Fraktar = createContainer<Model>()
      .addAcceptor("addHP", {
        mutator: (data, hp: number) => {
          data.hp += hp;
        },
      })
      .addActions({ hit: (hp: number) => [{ type: "addHP", payload: -hp }] })
      // Runs at creation too: the container is open meanwhile.
      .addStepReaction({ ...persist(writes), runOnInit: true })
      .addTransformation(({ data }) => ({ health: data.hp }))
      .create({ hp: 10, name: "Fraktar" });

    Fraktar.actions.hit(3);
    // The write of the creation ends, the one of the hit is still running.
    writes[0].done();
    await settle();

    expect(Fraktar.representationRef.current.health).toBe(10);

    writes[1].done();
    await settle();

    expect(Fraktar.representationRef.current.health).toBe(7);
  });
});

describe("an observer which acts on what it sees", function () {
  it("should wait for the reactions of the step it saw", function () {
    const seenByReactions: string[] = [];
    const Fraktar = createContainer<Model>()
      .addAcceptor("addHP", {
        mutator: (data, hp: number) => {
          data.hp += hp;
        },
      })
      .addAcceptor("setName", {
        mutator: (data, name: string) => {
          data.name = name;
        },
      })
      .addActions({
        hit: (hp: number) => [{ type: "addHP", payload: -hp }],
        rename: "setName",
      })
      .addStepReaction({
        runOnInit: false,
        do: ({ data, delta }) =>
          seenByReactions.push(
            `${delta.acceptedMutations[0].type}: ${data.name}`
          ),
      })
      .create({ hp: 10, name: "Fraktar" });

    // Notified in the middle of the step, before its reactions ran.
    const dispose = reaction(
      () => Fraktar.representationRef.current.hp < 10,
      (isWounded) => isWounded && Fraktar.actions.rename("Fraktar the wounded")
    );

    Fraktar.actions.hit(1);

    // Nothing interleaved with the step: its reactions saw the hero it left.
    expect(seenByReactions).toEqual([
      "addHP: Fraktar",
      "setName: Fraktar the wounded",
    ]);
    expect(Fraktar.stepId).toBe(2);
    dispose();
  });

  it("should go behind the actions which already wait", async function () {
    const writes: Write[] = [];
    const steps: Seen[] = [];
    const Fraktar = createFraktar(writes, steps);
    // Notified while the waiting actions are given their turn.
    const dispose = reaction(
      () => Fraktar.lastAttempt?.status === "rejected",
      (isRefused) => isRefused && Fraktar.actions.rename("Fraktar the stubborn")
    );

    Fraktar.actions.heal(1);
    Fraktar.actions.hit(100);
    Fraktar.actions.rename("Elwing");

    writes[0].done();
    await settle();
    writes[1].done();
    await settle();

    expect(steps.map(({ name }) => name)).toEqual([
      "Fraktar",
      "Elwing",
      "Fraktar the stubborn",
    ]);
    dispose();
  });

  it("should not be let reset the container while actions wait their turn", async function () {
    const writes: Write[] = [];
    const Fraktar = createFraktar(writes);
    const dispose = reaction(
      () => Fraktar.lastAttempt?.status === "rejected",
      (isRefused) => {
        if (isRefused) {
          Fraktar.reset({ hp: 10, name: "Fraktar" });
          Fraktar.rollback({
            data: { hp: 10, name: "Fraktar" },
            delta: {
              acceptedMutations: [],
              proposal: Object.assign([], { stepId: 4 }),
              controlStates: [],
              previousControlStates: [],
            },
          });
        }
      }
    );

    Fraktar.actions.heal(1);
    Fraktar.actions.hit(100);
    Fraktar.actions.rename("Elwing");

    writes[0].done();
    await settle();

    // The abandoned timeline would have leaked in the new one.
    expect(Fraktar.stepId).toBe(2);
    expect(Fraktar.representationRef.current).toEqual({
      hp: 11,
      name: "Elwing",
    });
    dispose();
  });
});

describe("a reaction which calls an action it is not allowed to", function () {
  it("should be reported as anybody is", function () {
    const Fraktar = createContainer<Model>()
      .addAcceptor("addHP", {
        mutator: (data, hp: number) => {
          data.hp += hp;
        },
      })
      .addControlStatePredicate("IS_ALIVE", ({ data }) => data.hp > 0)
      .addActions({
        hit: (hp: number) => [{ type: "addHP", payload: -hp }],
        heal: {
          isAllowed: ({ controlStates }) => controlStates.includes("IS_ALIVE"),
          action: (hp: number) => [{ type: "addHP", payload: hp }],
        },
      })
      .addStepReaction({
        debugName: "auto heal",
        runOnInit: false,
        when: ({ data }) => data.hp < 3,
        do: ({ actions }) => actions.heal(1),
      })
      .create({ hp: 10, name: "Fraktar" });

    Fraktar.actions.hit(10);

    const attempt = asDiscarded(Fraktar.lastAttempt);
    expect(attempt.reason.code).toBe(RejectionCode.unauthorized);
    expect(attempt.reason.meta).toEqual({ action: "heal", controlStates: [] });
    expect(Fraktar.representationRef.current.hp).toBe(0);
  });
});

describe("a chain of steps a reaction of the creation starts later", function () {
  it("should be allowed as many steps as any other", function () {
    let later: { heal(hp: number): void } | undefined;
    const Fraktar = createContainer<Model>()
      .addAcceptor("addHP", {
        mutator: (data, hp: number) => {
          data.hp += hp;
        },
      })
      .addActions({ heal: (hp: number) => [{ type: "addHP", payload: hp }] })
      // Runs at creation, and keeps the actions it is given.
      .addStepReaction({
        once: true,
        do: ({ actions }) => {
          later = actions;
        },
      })
      // Keeps a chain going for fifty steps, the most a chain is allowed.
      .addStepReaction({
        runOnInit: false,
        when: ({ data }) => data.hp < 61,
        do: ({ actions }) => actions.heal(1),
      })
      .create({ hp: 10, name: "Fraktar" });

    // The creation is over: this is the first step of a chain, not one more.
    later?.heal(1);

    expect(Fraktar.representationRef.current.hp).toBe(61);
    expect(asAccepted(Fraktar.lastAttempt).settled).toBe(true);
  });
});

describe("a chain of steps which ends on a throw", function () {
  it("should not count against the next one", function () {
    let curses = 1;
    const Fraktar = createContainer<Model>()
      .addAcceptor("setHP", {
        mutator: (data, hp: number) => {
          data.hp = hp;
        },
      })
      .addAcceptor("incHP", {
        mutator: (data) => {
          data.hp = data.hp + 1;
        },
      })
      .addActions({ setHP: "setHP", incHP: "incHP" })
      .addStepReaction({
        debugName: "auto heal",
        runOnInit: false,
        when: ({ data }) => data.hp < 50,
        do: ({ actions }) => actions.incHP(),
      })
      .addStepReaction({
        runOnInit: false,
        when: ({ data }) => data.hp === 50 && curses > 0,
        do: () => {
          curses--;
          throw new Error("boom");
        },
      })
      .create({ hp: 50, name: "Fraktar" });

    // Fifty steps in a row, as many as the reactions may start, then the last
    // one throws.
    Fraktar.actions.setHP(0);
    expect(Fraktar.representationRef.current.hp).toBe(50);

    // Fifty more: a hundred in all, but never more than fifty in one chain.
    Fraktar.actions.setHP(0);
    expect(Fraktar.representationRef.current.hp).toBe(50);
    expect(asAccepted(Fraktar.lastAttempt).settled).toBe(true);
  });
});

describe("a step which fails twice", function () {
  it("should keep the first reason", function () {
    const Fraktar = createContainer<Model>()
      .addAcceptor("setHP", {
        mutator: (data, hp: number) => {
          data.hp = hp;
        },
      })
      .addActions({ setHP: "setHP" })
      .addStepReaction({
        runOnInit: false,
        do: () => {
          throw new Error("boom");
        },
      })
      .addTransformation(({ data }) => {
        if (data.hp < 0) {
          throw new Error("no health bar below zero");
        }
        return { health: data.hp };
      })
      .create({ hp: 10, name: "Fraktar" });

    Fraktar.actions.setHP(-1);

    // The reaction threw, then the representation could not be made.
    expect(asAccepted(Fraktar.lastAttempt).reason?.message).toBe("boom");
  });
});

describe("a reaction which proposes after a timer", function () {
  /**
   * A countdown: each tick asks for the next one, later, through what the
   * reaction is given or through the container itself. And each tick rings
   * the bell at once, a step of its own.
   */
  function createCountdown(way: "actions" | "compose" | "container") {
    const Fraktar = createContainer<{ ticks: number; rings: number }>()
      .addAcceptor("tick", {
        mutator: (data) => {
          data.ticks++;
        },
      })
      .addAcceptor("ring", {
        mutator: (data) => {
          data.rings++;
        },
      })
      .addActions({ tick: "tick", ring: "ring" })
      .addStepReaction({
        runOnInit: false,
        when: ({ data, delta }) =>
          delta.acceptedMutations[0].type === "tick" && data.ticks < 120,
        do: ({ actions, compose }) => {
          setTimeout(() => {
            if (way === "actions") {
              actions.tick();
            } else if (way === "compose") {
              compose(({ tick }) => [tick()]);
            } else {
              Fraktar.actions.tick();
            }
          }, 0);
        },
      })
      .addStepReaction({
        runOnInit: false,
        when: ({ delta }) => delta.acceptedMutations[0].type === "tick",
        do: ({ actions }) => actions.ring(),
      })
      .create({ ticks: 0, rings: 0 });
    return Fraktar;
  }

  (["actions", "compose", "container"] as const).forEach(function (way) {
    it(`should not be cut as a runaway, by its ${way}`, async function () {
      const Fraktar = createCountdown(way);

      Fraktar.actions.tick();
      for (let wait = 0; wait < 400 && Fraktar.stepId < 240; wait++) {
        await settle();
      }

      // The tick and its ring are over when the next tick is asked for: one
      // hundred and twenty chains of two steps, not one chain of them all.
      expect(Fraktar.representationRef.current).toEqual({
        ticks: 120,
        rings: 120,
      });
      expect(asAccepted(Fraktar.lastAttempt).settled).toBe(true);
    });
  });
});

describe("an autorun which calls an action", function () {
  type Hero = { hp: number; potions: number; log: string[] };

  /**
   * A hero somebody watches. `steps` is what the reactions saw.
   */
  function createWatched(steps: string[] = []) {
    return createContainer<Hero>()
      .addAcceptor("addHP", {
        mutator: (data, hp: number) => {
          data.hp += hp;
        },
      })
      .addAcceptor("note", {
        mutator: (data, line: string) => {
          data.log.push(line);
        },
      })
      .addAcceptor("drink", {
        mutator: (data) => {
          data.potions--;
        },
      })
      .addControlStatePredicate("HAS_POTION", ({ data }) => data.potions > 0)
      .addActions({
        hit: (hp: number) => [{ type: "addHP", payload: -hp }],
        note: "note",
        drink: {
          isAllowed: ({ controlStates }) =>
            controlStates.includes("HAS_POTION"),
          action: () => [{ type: "drink", payload: undefined }],
        },
      })
      .addStepReaction({
        runOnInit: false,
        do: ({ delta }) => {
          steps.push(delta.acceptedMutations.map(({ type }) => type).join());
        },
      })
      .create({ hp: 10, potions: 1, log: [] });
  }

  it("should run again for what it reads itself, not for what the action reads", function () {
    const steps: string[] = [];
    const Fraktar = createWatched(steps);
    let runs = 0;
    // Notes the health of the hero each time it changes. It gives up by
    // itself far beyond what it should ever run.
    const dispose = autorun(() => {
      const { hp } = Fraktar.representationRef.current;
      if (++runs > 1 && runs < 60) {
        Fraktar.actions.note(`hp ${hp}`);
      }
    });

    Fraktar.actions.hit(1);

    // Calling an action tags its proposal with the step id. Read by the
    // autorun, each step would have run it again, and each run noted again.
    expect(runs).toBe(2);
    expect(steps).toEqual(["addHP", "note"]);
    expect(Fraktar.stepId).toBe(2);
    dispose();
  });

  it("should not run again when the control states its action is allowed by change", function () {
    const Fraktar = createWatched();
    let runs = 0;
    const dispose = autorun(() => {
      if (++runs < 60) {
        Fraktar.actions.drink();
      }
    });

    Fraktar.actions.hit(1);

    // Once, when it was posted: the last potion is drunk, HAS_POTION is
    // gone, and nothing it read itself has changed.
    expect(runs).toBe(1);
    expect(Fraktar.representationRef.current.potions).toBe(0);
    dispose();
  });

  it("should not run again for what a composed proposal reads either", function () {
    const Fraktar = createWatched();
    let runs = 0;
    const dispose = autorun(() => {
      if (++runs < 60) {
        Fraktar.compose(({ note }) => [note("posted")]);
      }
    });

    Fraktar.actions.hit(1);

    expect(runs).toBe(1);
    expect(Fraktar.representationRef.current.log).toEqual(["posted"]);
    dispose();
  });

  it("should not run again for what a reaction's own compose reads", function () {
    type Composer = (
      compose: (actions: { note(line: string): unknown }) => any[]
    ) => void;
    let compose: Composer | undefined;
    const Fraktar = createContainer<Hero>()
      .addAcceptor("addHP", {
        mutator: (data, hp: number) => {
          data.hp += hp;
        },
      })
      .addAcceptor("note", {
        mutator: (data, line: string) => {
          data.log.push(line);
        },
      })
      .addActions({
        hit: (hp: number) => [{ type: "addHP", payload: -hp }],
        note: "note",
      })
      // Keeps what it is given to propose with, for the view to use later.
      .addStepReaction({
        once: true,
        do: (handles) => {
          compose = handles.compose;
        },
      })
      .create({ hp: 10, potions: 1, log: [] });
    let runs = 0;
    const dispose = autorun(() => {
      if (++runs < 60 && compose !== undefined) {
        compose(({ note }) => [note("posted")]);
      }
    });

    Fraktar.actions.hit(1);

    expect(runs).toBe(1);
    expect(Fraktar.representationRef.current.log).toEqual(["posted"]);
    dispose();
  });
});

describe("an autorun which puts the container on another state", function () {
  type Hero = { hp: number; potions: number; log: string[] };

  (["reset", "rollback"] as const).forEach(function (jump) {
    it(`should not run again for what the reactions which replay its ${jump} read`, function () {
      const Fraktar = createContainer<Hero>()
        .addAcceptor("addHP", {
          mutator: (data, hp: number) => {
            data.hp += hp;
          },
        })
        .addActions({ hit: (hp: number) => [{ type: "addHP", payload: -hp }] })
        // A reaction which reads the model, at the creation as at each step.
        .addStepReaction({
          do: ({ data }) => {
            data.hp;
            data.log.length;
          },
        })
        .create({ hp: 10, potions: 1, log: [] });
      let runs = 0;
      // Puts the hero back on his feet once, as the view is shown. It gives up
      // by itself far beyond what it should ever run.
      const dispose = autorun(() => {
        if (++runs > 60) {
          return;
        }
        if (jump === "reset") {
          Fraktar.reset({ hp: 10, potions: 1, log: [] });
        } else {
          Fraktar.rollback({
            data: { hp: 10, potions: 1, log: [] },
            delta: {
              acceptedMutations: [],
              proposal: Object.assign([], { stepId: 0 }),
              controlStates: [],
              previousControlStates: [],
            },
          });
        }
      });

      Fraktar.actions.hit(1);

      // Read by the autorun, the health would have run it again, and put the
      // hero back on his feet at each blow.
      expect(runs).toBe(1);
      expect(Fraktar.representationRef.current.hp).toBe(9);
      dispose();
    });
  });
});

describe("what the view sends when it sees a step, and what a reaction of that step proposes", function () {
  [false, true].forEach(function (awaitAsync) {
    it(`should be presented in that order: the reaction first${
      awaitAsync ? ", awaited or not" : ""
    }`, async function () {
      const steps: string[] = [];
      const Fraktar = createContainer<{ hp: number; log: string[] }>()
        .addAcceptor("addHP", {
          mutator: (data, hp: number) => {
            data.hp += hp;
          },
        })
        .addAcceptor("note", {
          mutator: (data, line: string) => {
            data.log.push(line);
          },
        })
        .addActions({
          hit: (hp: number) => [{ type: "addHP", payload: -hp }],
          drink: () => [{ type: "addHP", payload: 10 }],
          note: "note",
        })
        .addStepReaction({
          runOnInit: false,
          do: ({ delta, data }) => {
            steps.push(`${delta.acceptedMutations[0].type} at hp ${data.hp}`);
          },
        })
        // The next action: a hero who is hurt drinks.
        .addStepReaction({
          runOnInit: false,
          awaitAsync,
          when: ({ data }) => data.hp < 5,
          do: async ({ actions }) => {
            if (awaitAsync) {
              await settle();
            }
            actions.drink();
          },
        })
        .create({ hp: 10, log: [] });
      // The view: it notes the health of the hero as soon as it sees it.
      let isWatching = false;
      const dispose = autorun(() => {
        const { hp } = Fraktar.representationRef.current;
        if (isWatching) {
          isWatching = false;
          Fraktar.actions.note(`hp ${hp}`);
        }
      });

      isWatching = true;
      Fraktar.actions.hit(8);
      await settle();
      await settle();

      // In 1.7 the note was taken first, before the reactions of the blow,
      // and an awaited reaction had its potion drunk twice.
      expect(steps).toEqual([
        "addHP at hp 2",
        "addHP at hp 12",
        "note at hp 12",
      ]);
      dispose();
    });
  });
});

describe("an observer which acts on a refusal", function () {
  it("should have its action taken", function () {
    const Fraktar = createContainer<Model>()
      .addAcceptor("addHP", {
        condition: (data, hp: number) => data.hp + hp >= 0,
        mutator: (data, hp: number) => {
          data.hp += hp;
        },
      })
      .addAcceptor("setName", {
        mutator: (data, name: string) => {
          data.name = name;
        },
      })
      .addActions({
        hit: (hp: number) => [{ type: "addHP", payload: -hp }],
        rename: "setName",
      })
      // The model is listened to as soon as there is a reaction.
      .addStepReaction({ runOnInit: false, do: () => {} })
      .create({ hp: 10, name: "Fraktar" });
    const dispose = reaction(
      () => Fraktar.lastAttempt?.status === "rejected",
      (isRejected) => isRejected && Fraktar.actions.rename("Fraktar the lucky")
    );

    Fraktar.actions.hit(50);

    expect(Fraktar.representationRef.current.name).toBe("Fraktar the lucky");
    expect(Fraktar.stepId).toBe(1);
    dispose();
  });

  it("should have its action taken when it acts on a reaction which threw", async function () {
    const Fraktar = createContainer<Model>()
      .addAcceptor("addHP", {
        mutator: (data, hp: number) => {
          data.hp += hp;
        },
      })
      .addActions({ heal: (hp: number) => [{ type: "addHP", payload: hp }] })
      .addStepReaction({
        runOnInit: false,
        when: ({ data }) => data.hp === 15,
        do: () => {
          throw new Error("the healer is away");
        },
      })
      .create({ hp: 10, name: "Fraktar" });
    const dispose = reaction(
      () => Fraktar.lastAttempt,
      (attempt) => {
        if (attempt?.status === "accepted" && !attempt.settled) {
          Fraktar.actions.heal(2);
        }
      }
    );

    Fraktar.actions.heal(5);
    await settle();

    expect(Fraktar.representationRef.current.hp).toBe(17);
    expect(Fraktar.stepId).toBe(2);
    dispose();
  });
});

describe("an observer which acts when it sees a jump", function () {
  function createWatched(writes: Write[]) {
    const Fraktar = createContainer<Model>()
      .addAcceptor("addHP", {
        mutator: (data, hp: number) => {
          data.hp += hp;
        },
      })
      .addActions({ heal: (hp: number) => [{ type: "addHP", payload: hp }] })
      // Replayed by a rollback, and by a reset as it runs at creation.
      .addStepReaction({ ...persist(writes), runOnInit: true })
      .create({ hp: 10, name: "Fraktar" });
    // Heals the hero as soon as it sees him wounded.
    const dispose = reaction(
      () => Fraktar.representationRef.current.hp,
      (hp) => hp < 5 && Fraktar.actions.heal(5)
    );
    return { Fraktar, dispose };
  }

  it("should wait for the reactions which replay a rollback", async function () {
    const writes: Write[] = [];
    const { Fraktar, dispose } = createWatched(writes);
    writes[0].done();
    await settle();

    Fraktar.rollback({
      data: { hp: 3, name: "Fraktar" },
      delta: {
        acceptedMutations: [],
        proposal: Object.assign([], { stepId: 6 }),
        controlStates: [],
        previousControlStates: [],
      },
    });

    // One write at a time: the one of the arrival, then the one of the heal.
    expect(writes.length).toBe(2);
    expect(Fraktar.stepId).toBe(7);
    writes[1].done();
    await settle();
    expect(writes.length).toBe(3);
    expect(Fraktar.stepId).toBe(8);
    expect(Fraktar.representationRef.current.hp).toBe(8);
    dispose();
  });

  it("should wait for the reactions which replay a reset", async function () {
    const writes: Write[] = [];
    const { Fraktar, dispose } = createWatched(writes);
    writes[0].done();
    await settle();

    Fraktar.reset({ hp: 3, name: "Fraktar" });

    expect(writes.length).toBe(2);
    expect(Fraktar.stepId).toBe(0);
    writes[1].done();
    await settle();
    expect(Fraktar.stepId).toBe(1);
    expect(Fraktar.representationRef.current.hp).toBe(8);
    dispose();
  });
});

describe("an action sent while a rollback or a reset puts its state in the model", function () {
  type Hero = { hp: number; potions: number; log: string[] };

  /**
   * A hero who is put on another state, and somebody who sends an action in
   * the middle of it. `steps` is what the reactions saw.
   */
  function createDrinker(steps: string[] = []) {
    const interrupt: { predicate?: () => void } = {};
    const Fraktar = createContainer<Hero>()
      .addAcceptor("addHP", {
        mutator: (data, hp: number) => {
          data.hp += hp;
        },
      })
      .addAcceptor("drink", {
        mutator: (data) => {
          data.potions--;
          data.log.push("potion");
        },
      })
      .addControlStatePredicate("IS_WEAK", ({ data }) => {
        if (interrupt.predicate !== undefined) {
          interrupt.predicate();
        }
        return data.hp < 5;
      })
      .addActions({
        hit: (hp: number) => [{ type: "addHP", payload: -hp }],
        drink: "drink",
        sip: {
          isAsync: true,
          action: async () => [{ type: "drink", payload: undefined }],
        },
        gulp: {
          isAsync: true,
          isCancelable: true,
          action: async () => [{ type: "drink", payload: undefined }],
        },
      })
      .addStepReaction({
        runOnInit: false,
        do: ({ delta, data }) => {
          steps.push(
            `${delta.acceptedMutations.map(({ type }) => type).join()} at hp ${
              data.hp
            }`
          );
        },
      })
      .create({ hp: 10, potions: 3, log: [] });
    return { Fraktar, interrupt };
  }

  const wounded = {
    data: { hp: 3, potions: 3, log: [] },
    delta: {
      acceptedMutations: [],
      proposal: Object.assign([], { stepId: 6 }),
      controlStates: [],
      previousControlStates: [],
    },
  };

  it("should not be presented when who listens to the model sends it during a rollback", function () {
    const steps: string[] = [];
    const { Fraktar } = createDrinker(steps);
    const dispose = observe(Fraktar.representationRef.current, "hp", () => {
      Fraktar.actions.drink();
    });

    Fraktar.rollback(wounded);

    // The state which was asked for, and the arrival replayed once.
    expect(Fraktar.representationRef.current).toEqual(wounded.data);
    expect(Fraktar.stepId).toBe(7);
    expect(steps).toEqual([" at hp 3"]);
    dispose();
  });

  it("should not be presented when who is asked before a write sends it during a reset", function () {
    const steps: string[] = [];
    const { Fraktar } = createDrinker(steps);
    Fraktar.actions.hit(7);
    const dispose = intercept(
      Fraktar.representationRef.current,
      "hp",
      (change) => {
        Fraktar.compose(({ drink }) => [drink()]);
        return change;
      }
    );

    Fraktar.reset({ hp: 10, potions: 3, log: [] });

    expect(Fraktar.representationRef.current.potions).toBe(3);
    expect(Fraktar.stepId).toBe(0);
    expect(steps).toEqual(["addHP at hp 3"]);
    dispose();
  });

  it("should not be presented when a control state predicate sends it during a reset", function () {
    const { Fraktar, interrupt } = createDrinker();
    interrupt.predicate = () => Fraktar.actions.drink();

    Fraktar.reset({ hp: 10, potions: 3, log: [] });
    interrupt.predicate = undefined;

    expect(Fraktar.representationRef.current.potions).toBe(3);
    expect(Fraktar.stepId).toBe(0);
  });

  it("should not be presented later either when it takes a while, cancelable or not", async function () {
    const { Fraktar } = createDrinker();
    const dispose = observe(Fraktar.representationRef.current, "hp", () => {
      Fraktar.actions.sip();
      Fraktar.actions.gulp();
    });

    Fraktar.rollback(wounded);
    dispose();
    await settle();

    // Refused when they were called: neither slips in around the jump.
    expect(Fraktar.representationRef.current.potions).toBe(3);
    expect(Fraktar.stepId).toBe(7);
    expect(Fraktar.lastAttempt).toBeUndefined();
  });

  it("should not keep the hero from being put on another state again: a jump from inside a jump is refused as during a step", function () {
    const { Fraktar } = createDrinker();
    const dispose = observe(Fraktar.representationRef.current, "hp", () => {
      Fraktar.reset({ hp: 1, potions: 0, log: [] });
    });

    Fraktar.rollback(wounded);
    dispose();

    expect(Fraktar.representationRef.current).toEqual(wounded.data);
    expect(Fraktar.stepId).toBe(7);
  });
});

describe("the reactions which replay a rollback, and what the view sends when it sees it", function () {
  it("should propose as they do, and go first", function () {
    const steps: string[] = [];
    const Fraktar = createContainer<{ hp: number; log: string[] }>()
      .addAcceptor("addHP", {
        mutator: (data, hp: number) => {
          data.hp += hp;
        },
      })
      .addAcceptor("note", {
        mutator: (data, line: string) => {
          data.log.push(line);
        },
      })
      .addActions({
        drink: () => [{ type: "addHP", payload: 10 }],
        note: "note",
      })
      .addStepReaction({
        runOnInit: false,
        do: ({ delta, data }) => {
          steps.push(
            `${delta.acceptedMutations.map(({ type }) => type).join()} at hp ${
              data.hp
            }`
          );
        },
      })
      // The next action: a hero who is hurt drinks.
      .addStepReaction({
        runOnInit: false,
        when: ({ data }) => data.hp < 5,
        do: ({ actions }) => actions.drink(),
      })
      .create({ hp: 10, log: [] });
    // The view: it notes the health of the hero as soon as it sees it.
    let isWatching = false;
    const dispose = autorun(() => {
      const { hp } = Fraktar.representationRef.current;
      if (isWatching) {
        isWatching = false;
        Fraktar.actions.note(`hp ${hp}`);
      }
    });

    isWatching = true;
    Fraktar.rollback({
      data: { hp: 3, log: [] },
      delta: {
        acceptedMutations: [],
        proposal: Object.assign([], { stepId: 6 }),
        controlStates: [],
        previousControlStates: [],
      },
    });

    // The arrival, what a reaction proposes on it, then what the view sent.
    expect(steps).toEqual([" at hp 3", "addHP at hp 13", "note at hp 13"]);
    dispose();
  });
});

describe("a rollback the model refuses", function () {
  it("should leave the container open, and present nothing of what was sent meanwhile", function () {
    const Fraktar = createContainer<Model>()
      .addAcceptor("addHP", {
        mutator: (data, hp: number) => {
          data.hp += hp;
        },
      })
      .addActions({ heal: (hp: number) => [{ type: "addHP", payload: hp }] })
      .create({ hp: 10, name: "Fraktar" });
    // Somebody heals the hero when he is renamed, and nobody may wound him.
    const disposers = [
      observe(Fraktar.representationRef.current, "name", () => {
        Fraktar.actions.heal(1);
      }),
      intercept(Fraktar.representationRef.current, "hp", (change) => {
        if (change.newValue < 10) {
          throw new Error("The hero is under a spell.");
        }
        return change;
      }),
    ];

    expect(() =>
      Fraktar.rollback({
        data: { name: "Fraktar the cursed", hp: 3 },
        delta: {
          acceptedMutations: [],
          proposal: Object.assign([], { stepId: 6 }),
          controlStates: [],
          previousControlStates: [],
        },
      })
    ).toThrow("The hero is under a spell.");
    disposers.forEach((dispose) => dispose());

    // The heal sent in the middle of the rollback was refused.
    expect(Fraktar.representationRef.current.hp).toBe(10);
    Fraktar.actions.heal(1);
    expect(Fraktar.representationRef.current.hp).toBe(11);
  });

  it("should not have its arrival replayed", function () {
    let replays = 0;
    const Fraktar = createContainer<Model>()
      .addAcceptor("addHP", {
        mutator: (data, hp: number) => {
          data.hp += hp;
        },
      })
      .addActions({ heal: (hp: number) => [{ type: "addHP", payload: hp }] })
      .addStepReaction({ runOnInit: false, do: () => replays++ })
      .create({ hp: 10, name: "Fraktar" });
    const dispose = intercept(Fraktar.representationRef.current, () => {
      throw new Error("The sheet is sealed.");
    });

    expect(() =>
      Fraktar.rollback({
        data: { hp: 1, name: "Fraktar" },
        delta: {
          acceptedMutations: [],
          proposal: Object.assign([], { stepId: 0 }),
          controlStates: [],
          previousControlStates: [],
        },
      })
    ).toThrow("The sheet is sealed.");

    expect(replays).toBe(0);
    dispose();
  });
});

describe("a reset the model refuses", function () {
  it("should not have the creation replayed", function () {
    let replays = 0;
    const Fraktar = createContainer<Model>()
      .addAcceptor("addHP", {
        mutator: (data, hp: number) => {
          data.hp += hp;
        },
      })
      .addControlStatePredicate("IS_ALIVE", ({ data }) => {
        if (data.hp === 666) {
          throw new Error("The hero is cursed.");
        }
        return data.hp > 0;
      })
      .addActions({ heal: (hp: number) => [{ type: "addHP", payload: hp }] })
      .addStepReaction({ do: () => replays++ })
      .create({ hp: 10, name: "Fraktar" });

    expect(() => Fraktar.reset({ hp: 666, name: "Fraktar" })).toThrow(
      "The hero is cursed."
    );

    // Once, at creation.
    expect(replays).toBe(1);
  });
});

describe("an asynchronous action which waited for its turn", function () {
  it("should be checked again as any other", async function () {
    const writes: Write[] = [];
    const Fraktar = createContainer<{ potions: number; hp: number }>()
      .addAcceptor("addHP", {
        mutator: (data, hp: number) => {
          data.hp += hp;
        },
      })
      .addAcceptor("usePotion", {
        mutator: (data) => {
          data.potions--;
          data.hp += 5;
        },
      })
      .addControlStatePredicate("HAS_POTION", ({ data }) => data.potions > 0)
      .addActions({
        rest: () => [{ type: "addHP", payload: 1 }],
        drink: {
          isAsync: true,
          isAllowed: ({ controlStates }) =>
            controlStates.includes("HAS_POTION"),
          action: async () => [{ type: "usePotion", payload: undefined }],
        },
      })
      .addStepReaction(persist(writes))
      .create({ potions: 1, hp: 1 });
    jest.spyOn(console, "warn").mockImplementation(() => {});

    Fraktar.actions.rest();
    // Both resolve while the rest is written, the only potion still there.
    Fraktar.actions.drink();
    Fraktar.actions.drink();
    await settle();
    writes[0].done();
    await settle();
    writes[1].done();
    await settle();

    expect(Fraktar.representationRef.current).toEqual({ potions: 0, hp: 7 });
    expect(asDiscarded(Fraktar.lastAttempt).reason.code).toBe(
      RejectionCode.unauthorized
    );
  });
});

describe("an action called while a proposal is presented", function () {
  type Hero = { hp: number; potions: number; log: string[] };

  /**
   * A hero who is hit, and somebody who makes him drink a potion in the
   * middle of the blow. Who calls the action, and from where in the
   * presentation, is up to the test. `steps` is what the reactions saw.
   */
  function createDrinker(
    drinkers: { [from: string]: () => void } = {},
    steps: string[][] = []
  ) {
    const from = (place: string) => drinkers[place] && drinkers[place]();
    return createContainer<Hero>()
      .addAcceptor("addHP", {
        condition: (data, hp: number) => {
          from("condition");
          return data.hp + hp >= 0;
        },
        mutator: (data, hp: number) => {
          data.hp += hp;
          from("mutator");
          data.log.push(`hp ${data.hp}`);
        },
      })
      .addAcceptor("drink", {
        mutator: (data) => {
          data.potions--;
          data.hp += 10;
          data.log.push("potion");
        },
      })
      .addControlStatePredicate("IS_WEAK", ({ data }) => {
        from("predicate");
        return data.hp < 5;
      })
      .addActions({
        hit: (hp: number) => [{ type: "addHP", payload: -hp }],
        drink: "drink",
        sip: {
          isAsync: true,
          action: async () => [{ type: "drink", payload: undefined }],
        },
        gulp: {
          isAsync: true,
          isCancelable: true,
          action: async () => [{ type: "drink", payload: undefined }],
        },
      })
      .addStepReaction({
        runOnInit: false,
        do: ({ delta }) => {
          steps.push(delta.acceptedMutations.map(({ type }) => type));
        },
      })
      .create({ hp: 10, potions: 3, log: [] });
  }

  ["condition", "mutator", "predicate"].forEach(function (place) {
    it(`should not be presented when the ${place} of the proposal calls it`, function () {
      const steps: string[][] = [];
      let isHit = false;
      const Fraktar = createDrinker(
        { [place]: () => isHit && Fraktar.actions.drink() },
        steps
      );

      isHit = true;
      Fraktar.actions.hit(8);

      // The blow is whole, and no potion was drunk in the middle of it.
      expect(Fraktar.representationRef.current).toEqual({
        hp: 2,
        potions: 3,
        log: ["hp 2"],
      });
      expect(Fraktar.stepId).toBe(1);
      expect(steps).toEqual([["addHP"]]);
    });
  });

  it("should not be presented when who listens to a write calls it", function () {
    const steps: string[][] = [];
    const Fraktar = createDrinker({}, steps);
    const dispose = observe(Fraktar.representationRef.current, "hp", () => {
      Fraktar.actions.drink();
    });

    Fraktar.actions.hit(8);

    expect(Fraktar.representationRef.current.log).toEqual(["hp 2"]);
    expect(Fraktar.stepId).toBe(1);
    expect(steps).toEqual([["addHP"]]);
    dispose();
  });

  it("should not be presented when who is asked before a write calls it", function () {
    const steps: string[][] = [];
    const Fraktar = createDrinker({}, steps);
    const dispose = intercept(
      Fraktar.representationRef.current,
      "hp",
      (change) => {
        Fraktar.actions.drink();
        return change;
      }
    );

    Fraktar.actions.hit(8);

    expect(Fraktar.representationRef.current.log).toEqual(["hp 2"]);
    expect(Fraktar.stepId).toBe(1);
    expect(steps).toEqual([["addHP"]]);
    dispose();
  });

  it("should not be presented when it is composed", function () {
    const steps: string[][] = [];
    const Fraktar = createDrinker(
      { mutator: () => Fraktar.compose(({ drink }) => [drink(), drink()]) },
      steps
    );

    Fraktar.actions.hit(8);

    expect(Fraktar.representationRef.current.potions).toBe(3);
    expect(Fraktar.stepId).toBe(1);
    expect(steps).toEqual([["addHP"]]);
  });

  it("should be said discarded, the container being locked, when nothing is said after it", function () {
    const Fraktar = createDrinker({
      mutator: () => {
        Fraktar.actions.drink();
        throw new Error("The hero slipped.");
      },
    });

    expect(() => Fraktar.actions.hit(8)).toThrow("The hero slipped.");

    // No step: the last thing which was attempted is the potion.
    const attempt = asDiscarded(Fraktar.lastAttempt);
    expect(attempt.reason).toEqual({
      code: RejectionCode.stepLocked,
      message: "A proposal is already being presented.",
    });
    expect(Fraktar.representationRef.current.potions).toBe(3);
  });

  it("should leave the last attempt to the proposal which is presented", function () {
    const Fraktar = createDrinker({ mutator: () => Fraktar.actions.drink() });

    Fraktar.actions.hit(8);

    expect(asAccepted(Fraktar.lastAttempt).attemptedAt).toBe(0);
  });

  it("should leave the last attempt to the proposal which is presented, when a control state predicate calls it", function () {
    let isHit = false;
    const Fraktar = createDrinker({
      predicate: () => isHit && Fraktar.actions.drink(),
    });

    isHit = true;
    Fraktar.actions.hit(8);

    // The predicates run once the step is accepted: the potion is refused
    // after the blow is, and the blow has the last word all the same.
    expect(asAccepted(Fraktar.lastAttempt).attemptedAt).toBe(0);
    expect(Fraktar.controlStates).toEqual(["IS_WEAK"]);
  });

  it("should leave the last attempt to the proposal which is presented, when who listens to the control states calls it", function () {
    const Fraktar = createDrinker();
    const dispose = observe(Fraktar.controlStates, () => {
      Fraktar.actions.drink();
    });

    Fraktar.actions.hit(8);

    expect(asAccepted(Fraktar.lastAttempt).attemptedAt).toBe(0);
    expect(Fraktar.representationRef.current.potions).toBe(3);
    dispose();
  });

  it("should leave the last attempt to say the step did not settle, when a reaction of it throws", async function () {
    let isHit = false;
    const Fraktar = createContainer<Hero>()
      .addAcceptor("addHP", {
        mutator: (data, hp: number) => {
          data.hp += hp;
        },
      })
      .addAcceptor("drink", {
        mutator: (data) => {
          data.potions--;
        },
      })
      .addControlStatePredicate("IS_WEAK", ({ data }) => {
        if (isHit) {
          Fraktar.actions.drink();
        }
        return data.hp < 5;
      })
      .addActions({
        hit: (hp: number) => [{ type: "addHP", payload: -hp }],
        drink: "drink",
      })
      .addStepReaction({
        runOnInit: false,
        do: () => {
          throw new Error("The bard fell silent.");
        },
      })
      .create({ hp: 10, potions: 3, log: [] });

    isHit = true;
    const outcome = Fraktar.attempt.hit(8);
    await outcome;

    const attempt = asAccepted(Fraktar.lastAttempt);
    expect(attempt.attemptedAt).toBe(0);
    expect(attempt.settled).toBe(false);
    expect(attempt.reason?.code).toBe(RejectionCode.reactionThrew);
    expect(attempt).toEqual(await outcome);
  });

  it("should not be presented later either when it takes a while", async function () {
    const steps: string[][] = [];
    const Fraktar = createDrinker(
      {
        mutator: () => {
          Fraktar.actions.sip();
          Fraktar.actions.gulp();
        },
      },
      steps
    );

    Fraktar.actions.hit(8);
    await settle();

    // Refused when they were called: neither came back with a proposal.
    expect(Fraktar.representationRef.current.potions).toBe(3);
    expect(asAccepted(Fraktar.lastAttempt).attemptedAt).toBe(0);
    expect(steps).toEqual([["addHP"]]);
  });

  it("should not be presented when the proposal which calls it waited for its turn", async function () {
    const writes: Write[] = [];
    const Fraktar = createContainer<Hero>()
      .addAcceptor("addHP", {
        mutator: (data, hp: number) => {
          data.hp += hp;
          if (data.hp < 5) {
            Fraktar.actions.drink();
          }
        },
      })
      .addAcceptor("drink", {
        mutator: (data) => {
          data.potions--;
        },
      })
      .addActions({
        hit: (hp: number) => [{ type: "addHP", payload: -hp }],
        drink: "drink",
      })
      .addStepReaction(persist(writes))
      .create({ hp: 10, potions: 3, log: [] });

    Fraktar.actions.hit(1);
    Fraktar.actions.hit(7);
    writes[0].done();
    await settle();

    expect(Fraktar.representationRef.current).toEqual({
      hp: 2,
      potions: 3,
      log: [],
    });
    expect(Fraktar.stepId).toBe(2);
    expect(writes.length).toBe(2);
  });

  it("should stop somebody who answers each write by the same action", function () {
    const Fraktar = createDrinker();
    // In 1.7 each blow was dealt inside the one before, until the stack ran
    // out.
    const dispose = observe(Fraktar.representationRef.current, "hp", () => {
      Fraktar.actions.hit(1);
    });

    Fraktar.actions.hit(1);

    expect(Fraktar.representationRef.current.hp).toBe(9);
    expect(Fraktar.stepId).toBe(1);
    dispose();
  });
});

describe("a cancelable action which is presented", function () {
  it("should be presented against the state it was called in: no step slips in meanwhile", async function () {
    type Hero = { hp: number; potions: number };
    const Fraktar = createContainer<Hero>()
      .addAcceptor("addHP", {
        mutator: (data, hp: number) => {
          data.hp += hp;
        },
      })
      .addAcceptor("drink", {
        // Somebody hits the hero just as he is about to drink.
        condition: (data) => {
          Fraktar.actions.hit(8);
          return data.potions > 0;
        },
        mutator: (data) => {
          data.potions--;
          data.hp += 10;
        },
      })
      .addActions({
        hit: (hp: number) => [{ type: "addHP", payload: -hp }],
        drink: {
          isAsync: true,
          isCancelable: true,
          action: async () => [{ type: "drink", payload: undefined }],
        },
      })
      .create({ hp: 10, potions: 3 });

    Fraktar.actions.drink();
    await settle();

    // In 1.7 the blow was a step of its own, taken inside the presentation:
    // the potion was drunk although something happened since it was asked
    // for. Nothing can happen there anymore.
    expect(Fraktar.representationRef.current).toEqual({ hp: 20, potions: 2 });
    expect(Fraktar.stepId).toBe(1);
  });
});
