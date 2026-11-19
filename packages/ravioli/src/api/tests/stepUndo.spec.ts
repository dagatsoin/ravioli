import {
  IObservableArray,
  autorun,
  intercept,
  makeObservable,
  observable,
  observe,
  reaction,
  runInAction,
  toJS,
} from "mobx";
import { setFlagsFromString } from "v8";
import { runInNewContext } from "vm";
import { Attempt, RejectionCode, createContainer } from "../..";
import { Write, asAccepted, asDiscarded, persist, settle } from "./helpers";

type Model = { hp: number; inventory: string[] };

/**
 * A hero who can die, and whose every step is written to a database. The
 * write is awaited. JUST_DIED can not be answered from the model alone: it
 * needs to know where the hero comes from.
 */
function createFraktar(writes: Write[]) {
  return createContainer<Model>()
    .addAcceptor("setHP", {
      mutator: (data, hp: number) => {
        data.hp = hp;
      },
    })
    .addAcceptor("addItem", {
      mutator: (data, item: string) => {
        data.inventory.push(item);
      },
    })
    .addControlStatePredicate("IS_ALIVE", ({ data }) => data.hp > 0)
    .addControlStatePredicate("IS_DEAD", ({ data }) => data.hp <= 0)
    .addControlStatePredicate(
      "JUST_DIED",
      ({ data, previousControlStates }) =>
        data.hp <= 0 && !previousControlStates.includes("IS_DEAD")
    )
    .addActions({ setHP: "setHP", addItem: "addItem" })
    .addStepReaction(persist(writes))
    .create({ hp: 10, inventory: [] });
}

/**
 * A hero whose acceptor does whatever the test hands it, so each test writes
 * its own step.
 */
function createAdventurer<T>(state: T, writes: Write[]) {
  return createContainer<T>()
    .addAcceptor("live", {
      mutator: (data, adventure: (hero: T) => void) => adventure(data),
    })
    .addActions({ live: "live" })
    .addStepReaction(persist(writes))
    .create(state);
}

beforeEach(function () {
  jest.spyOn(console, "info").mockImplementation(() => {});
  jest.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(function () {
  jest.restoreAllMocks();
});

describe("a step whose write fails", function () {
  it("should give the model back as it was before the step", async function () {
    const writes: Write[] = [];
    const Fraktar = createFraktar(writes);

    Fraktar.actions.addItem("sword");
    writes[0].done();
    await settle();

    Fraktar.actions.addItem("shield");
    expect(Fraktar.representationRef.current.inventory).toEqual([
      "sword",
      "shield",
    ]);

    writes[1].fail(new Error("the database is down"));
    await settle();

    // The database never got the shield: neither did the hero.
    expect(Fraktar.representationRef.current).toEqual({
      hp: 10,
      inventory: ["sword"],
    });
  });

  it("should give the step id back", async function () {
    const writes: Write[] = [];
    const Fraktar = createFraktar(writes);

    Fraktar.actions.setHP(5);
    expect(Fraktar.stepId).toBe(1);

    writes[0].fail(new Error("the database is down"));
    await settle();

    expect(Fraktar.stepId).toBe(0);
  });

  it("should give back a control state which depends on the past", async function () {
    const writes: Write[] = [];
    const Fraktar = createFraktar(writes);

    Fraktar.actions.setHP(0);
    writes[0].done();
    await settle();
    expect(Fraktar.controlStates).toEqual(["IS_DEAD", "JUST_DIED"]);

    // One more step: the hero is dead, but not freshly dead anymore.
    Fraktar.actions.addItem("shroud");
    expect(Fraktar.controlStates).toEqual(["IS_DEAD"]);

    writes[1].fail(new Error("the database is down"));
    await settle();

    // Computing them again from the model would give IS_DEAD only.
    expect(Fraktar.controlStates).toEqual(["IS_DEAD", "JUST_DIED"]);
  });

  it("should say so on the attempt", async function () {
    const writes: Write[] = [];
    const Fraktar = createFraktar(writes);
    const error = new Error("the database is down");

    Fraktar.actions.setHP(5);
    writes[0].fail(error);
    await settle();

    const attempt = asAccepted(Fraktar.lastAttempt);
    // What the model had accepted is still told...
    expect(attempt.accepted).toEqual([{ type: "setHP", payload: 5 }]);
    expect(attempt.attemptedAt).toBe(0);
    // ... with what became of it.
    expect(attempt.settled).toBe(false);
    expect(attempt.undone).toBe(true);
    expect(attempt.reason).toEqual({
      code: RejectionCode.reactionThrew,
      message: "the database is down",
      meta: { error },
    });
  });

  it("should not mark a step whose write succeeds", async function () {
    const writes: Write[] = [];
    const Fraktar = createFraktar(writes);

    Fraktar.actions.setHP(5);
    writes[0].done();
    await settle();

    const attempt = asAccepted(Fraktar.lastAttempt);
    expect(attempt.settled).toBe(true);
    expect(attempt.undone).toBeUndefined();
    expect(Fraktar.representationRef.current.hp).toBe(5);
  });

  it("should notify the observers once for the whole return", async function () {
    const writes: Write[] = [];
    const Fraktar = createFraktar(writes);
    Fraktar.actions.setHP(0);

    let renders = 0;
    const dispose = autorun(() => {
      Fraktar.stepId;
      Fraktar.controlStates.slice();
      Fraktar.representationRef.current.hp;
      Fraktar.lastAttempt;
      renders++;
    });

    writes[0].fail(new Error("the database is down"));
    await settle();

    expect(renders).toBe(2);
    expect(Fraktar.stepId).toBe(0);
    dispose();
  });

  it("should leave the container ready for the next action", async function () {
    const writes: Write[] = [];
    const Fraktar = createFraktar(writes);

    Fraktar.actions.setHP(5);
    writes[0].fail(new Error("the database is down"));
    await settle();

    // Presented against the state the database has.
    Fraktar.actions.setHP(7);
    writes[1].done();
    await settle();

    expect(Fraktar.stepId).toBe(1);
    expect(Fraktar.representationRef.current.hp).toBe(7);
    expect(asAccepted(Fraktar.lastAttempt).attemptedAt).toBe(0);
  });

  it("should be undone when the reaction throws before it waits", function () {
    const Fraktar = createContainer<Model>()
      .addAcceptor("setHP", {
        mutator: (data, hp: number) => {
          data.hp = hp;
        },
      })
      .addActions({ setHP: "setHP" })
      .addStepReaction({
        awaitAsync: true,
        runOnInit: false,
        do: () => {
          throw new Error("no connection to wait on");
        },
      })
      .create({ hp: 10, inventory: [] });

    Fraktar.actions.setHP(5);

    // Awaited by declaration: the write did not happen either.
    expect(Fraktar.representationRef.current.hp).toBe(10);
    expect(Fraktar.stepId).toBe(0);
    expect(asAccepted(Fraktar.lastAttempt).undone).toBe(true);
  });
});

describe("the actions which waited behind a step whose write fails", function () {
  it("should be refused: they were meant for a state which is gone", async function () {
    const writes: Write[] = [];
    const Fraktar = createFraktar(writes);
    const error = new Error("the database is down");

    Fraktar.actions.setHP(5);
    Fraktar.actions.addItem("sword");
    Fraktar.actions.addItem("shield");

    writes[0].fail(error);
    await settle();

    // Neither was presented: no step, no write.
    expect(Fraktar.stepId).toBe(0);
    expect(Fraktar.representationRef.current).toEqual({
      hp: 10,
      inventory: [],
    });
    expect(writes.length).toBe(1);

    const attempt = asDiscarded(Fraktar.lastAttempt);
    expect(attempt.attemptedAt).toBe(0);
    expect(attempt.reason).toEqual({
      code: "PRECEDING_STEP_UNDONE",
      message:
        "The step 1 was undone: what waited behind it was not presented.",
      meta: {
        stepId: 1,
        reason: {
          code: RejectionCode.reactionThrew,
          message: "the database is down",
          meta: { error },
        },
      },
    });
  });

  it("should each be reported, after the step they waited behind", async function () {
    const writes: Write[] = [];
    const Fraktar = createFraktar(writes);
    const attempts: string[] = [];
    const dispose = autorun(() => {
      const attempt = Fraktar.lastAttempt;
      if (attempt !== undefined) {
        attempts.push(
          attempt.status === "accepted"
            ? `accepted, undone: ${attempt.undone}`
            : attempt.status
        );
      }
    });

    Fraktar.actions.setHP(5);
    Fraktar.actions.addItem("sword");
    Fraktar.actions.addItem("shield");

    writes[0].fail(new Error("the database is down"));
    await settle();

    expect(attempts).toEqual([
      "accepted, undone: undefined",
      "accepted, undone: true",
      "discarded",
      "discarded",
    ]);
    dispose();
  });

  it("should not take with them an action which arrives after the return", async function () {
    const writes: Write[] = [];
    const Fraktar = createFraktar(writes);

    Fraktar.actions.setHP(5);
    Fraktar.actions.addItem("sword");

    writes[0].fail(new Error("the database is down"));
    await settle();

    Fraktar.actions.addItem("shield");
    writes[1].done();
    await settle();

    expect(Fraktar.representationRef.current).toEqual({
      hp: 10,
      inventory: ["shield"],
    });
    expect(Fraktar.stepId).toBe(1);
  });

  it("should not take with them what an observer asks for on the return", async function () {
    const writes: Write[] = [];
    const Fraktar = createFraktar(writes);
    const dispose = reaction(
      () => {
        const attempt = Fraktar.lastAttempt;
        return attempt?.status === "accepted" && attempt.undone === true;
      },
      (isUndone) => isUndone && Fraktar.actions.addItem("bandage")
    );

    Fraktar.actions.setHP(5);
    Fraktar.actions.addItem("sword");

    writes[0].fail(new Error("the database is down"));
    await settle();
    writes[1].done();
    await settle();

    // The sword waited behind the undone step. The bandage was asked for by
    // someone who saw the model come back.
    expect(Fraktar.representationRef.current).toEqual({
      hp: 10,
      inventory: ["bandage"],
    });
    expect(Fraktar.stepId).toBe(1);
    dispose();
  });
});

describe("a reaction which proposes late, behind a step whose write fails", function () {
  it("should have its fate told as any action which waited", async function () {
    let answer!: () => void;
    const priest = new Promise<void>((resolve) => {
      answer = resolve;
    });
    const writes: Write[] = [];
    const Fraktar = createContainer<Model>()
      .addAcceptor("setHP", {
        mutator: (data, hp: number) => {
          data.hp = hp;
        },
      })
      .addAcceptor("addItem", {
        mutator: (data, item: string) => {
          data.inventory.push(item);
        },
      })
      .addActions({ setHP: "setHP", addItem: "addItem" })
      // Not awaited: the blessing comes once the priest answers.
      .addStepReaction({
        runOnInit: false,
        when: ({ delta }) =>
          delta.acceptedMutations.some(({ type }) => type === "setHP"),
        do: ({ actions }) => {
          priest.then(() => actions.addItem("blessing"));
        },
      })
      .addStepReaction(persist(writes))
      .create({ hp: 10, inventory: [] });

    Fraktar.actions.setHP(5);
    writes[0].done();
    await settle();
    Fraktar.actions.addItem("sword");
    // The reaction of the first step proposes during the write of the second.
    answer();
    await settle();
    writes[1].fail(new Error("the database is down"));
    await settle();

    // It was not dropped in silence with what the reactions of the sword
    // proposed: it waited behind it, and is refused as what waits there.
    expect(asDiscarded(Fraktar.lastAttempt).reason.code).toBe(
      RejectionCode.precedingStepUndone
    );
    expect(Fraktar.representationRef.current).toEqual({ hp: 5, inventory: [] });
  });
});

describe("a cancelable action called before a step which is taken back", function () {
  it("should be dropped: the step id is the same, but things happened", async function () {
    const writes: Write[] = [];
    let swallow!: () => void;
    const potion = new Promise<void>((resolve) => {
      swallow = resolve;
    });
    const Fraktar = createContainer<Model>()
      .addAcceptor("setHP", {
        mutator: (data, hp: number) => {
          data.hp = hp;
        },
      })
      .addActions({
        setHP: "setHP",
        drink: {
          isAsync: true,
          isCancelable: true,
          action: async (hp: number) => {
            await potion;
            return [{ type: "setHP", payload: hp }];
          },
        },
      })
      .addStepReaction(persist(writes))
      .create({ hp: 10, inventory: [] });

    const pending = Fraktar.actions.drink(15);
    Fraktar.actions.setHP(5);
    writes[0].fail(new Error("the database is down"));
    await settle();
    // Back at the step the potion was drunk at.
    expect(Fraktar.stepId).toBe(0);
    swallow();
    await pending;

    expect(asDiscarded(Fraktar.lastAttempt).reason.code).toBe(
      RejectionCode.staleProposal
    );
    expect(Fraktar.representationRef.current.hp).toBe(10);
  });
});

describe("what the reactions of an undone step did", function () {
  it("should not present what they proposed for it", async function () {
    const writes: Write[] = [];
    const Fraktar = createContainer<Model>()
      .addAcceptor("setHP", {
        mutator: (data, hp: number) => {
          data.hp = hp;
        },
      })
      .addAcceptor("addItem", {
        mutator: (data, item: string) => {
          data.inventory.push(item);
        },
      })
      .addActions({ setHP: "setHP", addItem: "addItem" })
      .addStepReaction({
        debugName: "loot",
        runOnInit: false,
        when: ({ delta }) =>
          delta.acceptedMutations.some(({ type }) => type === "setHP"),
        do: ({ actions }) => actions.addItem("potion"),
      })
      .addStepReaction(persist(writes))
      .create({ hp: 10, inventory: [] });

    Fraktar.actions.setHP(5);
    writes[0].fail(new Error("the database is down"));
    await settle();

    // The potion was the consequence of a step which did not happen.
    expect(Fraktar.representationRef.current).toEqual({
      hp: 10,
      inventory: [],
    });
    expect(Fraktar.stepId).toBe(0);
  });

  it("should stay done: only the model comes back", async function () {
    const writes: Write[] = [];
    const letters: number[] = [];
    const Fraktar = createContainer<Model>()
      .addAcceptor("setHP", {
        mutator: (data, hp: number) => {
          data.hp = hp;
        },
      })
      .addActions({ setHP: "setHP" })
      .addStepReaction({
        debugName: "write home",
        runOnInit: false,
        do: ({ data }) => letters.push(data.hp),
      })
      .addStepReaction(persist(writes))
      .create({ hp: 10, inventory: [] });

    Fraktar.actions.setHP(5);
    writes[0].fail(new Error("the database is down"));
    await settle();

    // The letter left with the hp of a step which was then taken back.
    expect(letters).toEqual([5]);
  });

  it("should give a one shot reaction its run back", async function () {
    const writes: Write[] = [];
    const welcomes: number[] = [];
    const farewells: number[] = [];
    const Fraktar = createContainer<Model>()
      .addAcceptor("setHP", {
        mutator: (data, hp: number) => {
          data.hp = hp;
        },
      })
      .addActions({ setHP: "setHP" })
      .addStepReaction({
        debugName: "welcome",
        runOnInit: false,
        once: true,
        do: ({ data }) => welcomes.push(data.hp),
      })
      .addStepReaction({
        debugName: "farewell",
        runOnInit: false,
        once: true,
        do: ({ data }) => farewells.push(data.hp),
      })
      .addStepReaction(persist(writes))
      .create({ hp: 10, inventory: [] });

    Fraktar.actions.setHP(5);
    writes[0].fail(new Error("the database is down"));
    await settle();
    Fraktar.actions.setHP(7);
    writes[1].done();
    await settle();
    Fraktar.actions.setHP(8);

    // The step they ran in did not happen: each is owed the run it promises,
    // and each one once.
    expect(welcomes).toEqual([5, 7]);
    expect(farewells).toEqual([5, 7]);
  });

  it("should be taken back too when one of them wrote in the model", async function () {
    const writes: Write[] = [];
    const Fraktar = createContainer<Model>()
      .addAcceptor("setHP", {
        mutator: (data, hp: number) => {
          data.hp = hp;
        },
      })
      .addActions({ setHP: "setHP" })
      // Not what a reaction is for, but nothing stops it.
      .addStepReaction({
        runOnInit: false,
        do: ({ data }) => {
          data.inventory.push("stolen ring");
        },
      })
      .addStepReaction(persist(writes))
      .create({ hp: 10, inventory: [] });

    Fraktar.actions.setHP(5);
    writes[0].fail(new Error("the database is down"));
    await settle();

    expect(Fraktar.representationRef.current).toEqual({
      hp: 10,
      inventory: [],
    });
  });
});

describe("a step started by a reaction, whose write fails", function () {
  function createLooter(writes: Write[]) {
    return createContainer<Model>()
      .addAcceptor("setHP", {
        mutator: (data, hp: number) => {
          data.hp = hp;
        },
      })
      .addAcceptor("addItem", {
        mutator: (data, item: string) => {
          data.inventory.push(item);
        },
      })
      .addActions({ setHP: "setHP", addItem: "addItem" })
      .addStepReaction(persist(writes))
      .addStepReaction({
        debugName: "loot",
        runOnInit: false,
        when: ({ delta }) =>
          delta.acceptedMutations.some(({ type }) => type === "setHP"),
        do: ({ actions }) => actions.addItem("potion"),
      })
      .addTransformation(({ data }) => ({
        health: data.hp,
        bag: data.inventory.slice(),
      }))
      .create({ hp: 10, inventory: [] });
  }

  it("should be undone alone: the step before it was written", async function () {
    const writes: Write[] = [];
    const Fraktar = createLooter(writes);

    Fraktar.actions.setHP(5);
    writes[0].done();
    await settle();
    // The potion is in the bag, its write is running.
    expect(Fraktar.stepId).toBe(2);

    writes[1].fail(new Error("the database is down"));
    await settle();

    expect(Fraktar.stepId).toBe(1);
    expect(Fraktar.representationRef.current).toEqual({ health: 5, bag: [] });
    const attempt = asAccepted(Fraktar.lastAttempt);
    expect(attempt.accepted).toEqual([{ type: "addItem", payload: "potion" }]);
    expect(attempt.undone).toBe(true);
  });

  it("should never have been shown by a custom representation", async function () {
    const writes: Write[] = [];
    const Fraktar = createLooter(writes);
    const shown: string[] = [];
    const dispose = reaction(
      () => JSON.stringify(Fraktar.representationRef.current),
      (representation) => shown.push(representation)
    );

    Fraktar.actions.setHP(5);
    writes[0].done();
    await settle();
    writes[1].fail(new Error("the database is down"));
    await settle();

    // The potion was never written: it was never shown either.
    expect(shown).toEqual(['{"health":5,"bag":[]}']);
    dispose();
  });
});

describe("a step started while the container is created", function () {
  it("should be taken back as any other when its write fails", async function () {
    const writes: Write[] = [];
    const Fraktar = createContainer<Model>()
      .addAcceptor("setHP", {
        mutator: (data, hp: number) => {
          data.hp = hp;
        },
      })
      .addActions({ setHP: "setHP" })
      // Runs at creation: a hero who is born dead is raised at once.
      .addStepReaction({
        debugName: "raise",
        when: ({ data }) => data.hp === 0,
        do: ({ actions }) => actions.setHP(10),
      })
      .addStepReaction(persist(writes))
      .create({ hp: 0, inventory: [] });

    // The creation is over, the write of the step it started is not.
    expect(Fraktar.representationRef.current.hp).toBe(10);
    expect(Fraktar.stepId).toBe(1);

    writes[0].fail(new Error("the database is down"));
    await settle();

    expect(Fraktar.representationRef.current.hp).toBe(0);
    expect(Fraktar.stepId).toBe(0);
  });
});

describe("a representation which can not be made after the return", function () {
  it("should not stop the return nor what follows it", async function () {
    const writes: Write[] = [];
    let isCursed = false;
    const Fraktar = createContainer<Model>()
      .addAcceptor("setHP", {
        mutator: (data, hp: number) => {
          data.hp = hp;
        },
      })
      .addActions({ setHP: "setHP" })
      .addStepReaction(persist(writes))
      // Not a function of the model alone, which a transformation should be.
      .addTransformation(({ data }) => {
        if (isCursed) {
          throw new Error("the mirror is cursed");
        }
        return { health: data.hp };
      })
      .create({ hp: 10, inventory: [] });

    Fraktar.actions.setHP(5);
    Fraktar.actions.setHP(7);
    isCursed = true;
    writes[0].fail(new Error("the database is down"));
    await settle();

    // The step was taken back and what waited was refused, the mirror aside.
    expect(Fraktar.stepId).toBe(0);
    expect(asDiscarded(Fraktar.lastAttempt).reason.code).toBe(
      RejectionCode.precedingStepUndone
    );

    isCursed = false;
    Fraktar.actions.setHP(3);
    writes[1].done();
    await settle();

    expect(Fraktar.representationRef.current.health).toBe(3);
  });
});

describe("a step which can not be taken back whole", function () {
  type Cursed = { gold: number; curses: string[]; hp: number };

  /**
   * A hero whose curses can not be lifted: something which listens to the
   * model refuses it, and with it the way back of the step which cursed him.
   */
  function createCursed(writes: Write[]) {
    const Fraktar = createAdventurer<Cursed>(
      { gold: 0, curses: [], hp: 10 },
      writes
    );
    intercept(Fraktar.representationRef.current.curses, (change) => {
      if (change.type === "splice" && change.removedCount) {
        throw new Error("a curse can not be lifted");
      }
      return change;
    });
    return Fraktar;
  }

  it("should stand whole, and say so", async function () {
    const writes: Write[] = [];
    const Fraktar = createCursed(writes);
    const error = new Error("the database is down");

    Fraktar.actions.live((hero) => {
      hero.gold = 100;
      hero.curses.push("greed");
      hero.hp = 1;
    });
    writes[0].fail(error);
    await settle();

    const attempt = asAccepted(Fraktar.lastAttempt);
    expect(attempt.undone).toBeUndefined();
    expect(attempt.settled).toBe(false);
    expect(attempt.reason?.code).toBe("STEP_NOT_UNDONE");
    expect(attempt.reason?.message).toBe(
      "An awaited reaction failed and the step 1 could not be taken back: " +
        "a curse can not be lifted."
    );
    expect(attempt.reason?.meta).toEqual({
      reason: {
        code: RejectionCode.reactionThrew,
        message: "the database is down",
        meta: { error },
      },
      error: new Error("a curse can not be lifted"),
    });
    // Not a state which never existed: the step is all there.
    expect(toJS(Fraktar.representationRef.current)).toEqual({
      gold: 100,
      curses: ["greed"],
      hp: 1,
    });
    expect(Fraktar.stepId).toBe(1);
  });

  it("should give their turn to the actions which waited behind it", async function () {
    const writes: Write[] = [];
    const Fraktar = createCursed(writes);

    Fraktar.actions.live((hero) => {
      hero.curses.push("greed");
    });
    Fraktar.actions.live((hero) => {
      hero.gold = 100;
    });
    writes[0].fail(new Error("the database is down"));
    await settle();

    // The step stands: the state they were meant for is still there.
    expect(Fraktar.stepId).toBe(2);
    expect(Fraktar.representationRef.current.gold).toBe(100);
  });

  it("should stand when the model holds a date, which nobody sees written", async function () {
    const writes: Write[] = [];
    const Fraktar = createAdventurer({ bornAt: new Date(0), hp: 10 }, writes);

    Fraktar.actions.live((hero) => {
      hero.hp = 5;
      hero.bornAt.setTime(86400000);
    });
    writes[0].fail(new Error("the database is down"));
    await settle();

    const attempt = asAccepted(Fraktar.lastAttempt);
    expect(attempt.undone).toBeUndefined();
    expect(attempt.reason?.code).toBe(RejectionCode.stepNotUndone);
    expect(attempt.reason?.message).toBe(
      "An awaited reaction failed and the step 1 could not be taken back: " +
        "the model holds a Date at /bornAt, which MobX does not observe: " +
        "nothing tells what was written in it."
    );
    expect(Fraktar.representationRef.current.hp).toBe(5);
    expect(Fraktar.stepId).toBe(1);
  });

  it("should keep the control states it has", async function () {
    const writes: Write[] = [];
    const Fraktar = createFraktar(writes);
    let isBack = false;
    // The dead stay dead: the model refuses the way back.
    const dispose = intercept(
      Fraktar.representationRef.current,
      "hp",
      (change) => (isBack ? null : change)
    );

    Fraktar.actions.setHP(0);
    isBack = true;
    writes[0].fail(new Error("the database is down"));
    await settle();

    expect(asAccepted(Fraktar.lastAttempt).reason?.code).toBe(
      "STEP_NOT_UNDONE"
    );
    expect(Fraktar.representationRef.current.hp).toBe(0);
    expect(Fraktar.controlStates).toEqual(["IS_DEAD", "JUST_DIED"]);
    dispose();
  });
});

describe("a node which left the model in an earlier step", function () {
  it("should keep what its new owner writes in it meanwhile", async function () {
    const writes: Write[] = [];
    const Fraktar = createAdventurer<{
      hp: number;
      pet: { name: string } | null;
    }>({ hp: 10, pet: { name: "Rex" } }, writes);
    const pet = Fraktar.representationRef.current.pet!;
    Fraktar.actions.live((hero) => {
      hero.pet = null;
    });
    writes[0].done();
    await settle();

    Fraktar.actions.live((hero) => {
      hero.hp = 5;
    });
    // Not Fraktar's anymore: this write is not of his step.
    runInAction(() => {
      pet.name = "Elwing's Rex";
    });
    writes[1].fail(new Error("the database is down"));
    await settle();

    expect(Fraktar.representationRef.current.hp).toBe(10);
    expect(pet.name).toBe("Elwing's Rex");
  });
});

describe("a failure which does not undo the step", function () {
  it("should be the one of a reaction which is not awaited", async function () {
    const writes: Write[] = [];
    const Fraktar = createContainer<Model>()
      .addAcceptor("setHP", {
        mutator: (data, hp: number) => {
          data.hp = hp;
        },
      })
      .addActions({ setHP: "setHP" })
      .addStepReaction(persist(writes))
      .addStepReaction({
        runOnInit: false,
        do: () => {
          throw new Error("boom");
        },
      })
      .create({ hp: 10, inventory: [] });

    Fraktar.actions.setHP(5);
    writes[0].done();
    await settle();

    // The write was done when it threw. The step itself stands, its
    // consequences do not.
    const attempt = asAccepted(Fraktar.lastAttempt);
    expect(attempt.settled).toBe(false);
    expect(attempt.undone).toBeUndefined();
    expect(Fraktar.representationRef.current.hp).toBe(5);
    expect(Fraktar.stepId).toBe(1);

    // And it is not taken back later either, by the failure of another one.
    Fraktar.actions.setHP(7);
    writes[1].fail(new Error("the database is down"));
    await settle();
    expect(Fraktar.representationRef.current.hp).toBe(5);
    expect(Fraktar.stepId).toBe(1);
  });

  it("should be the one of a write which follows a rollback", async function () {
    const writes: Write[] = [];
    const Fraktar = createFraktar(writes);

    Fraktar.actions.setHP(5);
    writes[0].done();
    await settle();

    // A jump is not a step: the given state is taken as it is.
    Fraktar.rollback({
      data: { hp: 3, inventory: ["sword"] },
      delta: {
        acceptedMutations: [],
        proposal: Object.assign([], { stepId: 6 }),
        controlStates: ["IS_ALIVE"],
        previousControlStates: ["IS_ALIVE"],
      },
    });
    Fraktar.actions.addItem("shield");
    writes[1].fail(new Error("the database is down"));
    await settle();

    expect(toJS(Fraktar.representationRef.current)).toEqual({
      hp: 3,
      inventory: ["sword", "shield"],
    });
    // The action which waited had its turn, on the state the rollback gave.
    expect(Fraktar.stepId).toBe(8);
  });

  it("should be the one of a write which follows a reset", async function () {
    const writes: Write[] = [];
    const Fraktar = createContainer<Model>()
      .addAcceptor("setHP", {
        mutator: (data, hp: number) => {
          data.hp = hp;
        },
      })
      .addActions({ setHP: "setHP" })
      // Runs at creation too, so a reset replays it.
      .addStepReaction({ ...persist(writes), runOnInit: true })
      .create({ hp: 10, inventory: [] });
    writes[0].done();
    await settle();

    Fraktar.actions.setHP(5);
    writes[1].done();
    await settle();

    Fraktar.reset({ hp: 10, inventory: [] });
    writes[2].fail(new Error("the database is down"));
    await settle();

    expect(Fraktar.representationRef.current.hp).toBe(10);
    expect(Fraktar.stepId).toBe(0);
  });
});

describe("a model of every shape", function () {
  type Sheet = {
    name: string;
    stats: { hp: number; purse: { gold: number } };
    inventory: Array<{ id: string; quantity: number }>;
    quests: Map<string, { progress: number }>;
    effects: Set<string>;
    party: Set<{ name: string }>;
    pet?: { name: string };
    title?: string;
  };

  function createSheet(writes: Write[]) {
    return createContainer<Sheet>()
      .addAcceptor("adventure", {
        mutator: (data) => {
          data.stats.hp = 1;
          data.stats.purse = { gold: 100 };
          delete data.title;
          data.pet = { name: "Rex" };
          data.inventory[0].quantity = 0;
          data.inventory.push({ id: "shield", quantity: 1 });
          data.inventory.splice(0, 1);
          data.inventory.reverse();
          data.quests.get("dragon")!.progress = 3;
          data.quests.delete("goblins");
          data.quests.set("lich", { progress: 0 });
          data.effects.delete("poisoned");
          data.effects.add("burning");
          data.party.forEach((member) => {
            member.name = member.name.toUpperCase();
          });
          data.party.add({ name: "Thrall" });
          data.name = "Fraktar the reckless";
        },
      })
      .addActions({ adventure: "adventure" })
      .addStepReaction(persist(writes))
      .create({
        name: "Fraktar",
        title: "the brave",
        stats: { hp: 10, purse: { gold: 5 } },
        inventory: [
          { id: "sword", quantity: 1 },
          { id: "potion", quantity: 3 },
          { id: "rope", quantity: 1 },
        ],
        quests: new Map([
          ["dragon", { progress: 1 }],
          ["goblins", { progress: 0 }],
          ["princess", { progress: 2 }],
        ]),
        effects: new Set(["poisoned", "blessed"]),
        party: new Set([{ name: "Elwing" }]),
      });
  }

  /**
   * Everything of the sheet in a text, the order of the keys included.
   */
  function read(sheet: Sheet) {
    return JSON.stringify({
      ...toJS(sheet),
      quests: Array.from(sheet.quests.entries()),
      effects: Array.from(sheet.effects),
      party: Array.from(sheet.party),
    });
  }

  it("should come back whole, each thing at its place", async function () {
    const writes: Write[] = [];
    const Fraktar = createSheet(writes);
    const sheet = Fraktar.representationRef.current;
    const before = read(sheet);
    const purse = sheet.stats.purse;
    const sword = sheet.inventory[0];
    const goblins = sheet.quests.get("goblins");

    Fraktar.actions.adventure();
    expect(read(sheet)).not.toBe(before);

    writes[0].fail(new Error("the database is down"));
    await settle();

    expect(read(sheet)).toBe(before);
    // The nodes which were removed are back themselves, not a copy of them.
    expect(sheet.stats.purse).toBe(purse);
    expect(sheet.inventory[0]).toBe(sword);
    expect(sheet.quests.get("goblins")).toBe(goblins);
  });

  it("should keep the observers of what came back attached", async function () {
    const writes: Write[] = [];
    const Fraktar = createSheet(writes);
    const sword = Fraktar.representationRef.current.inventory[0];
    const quantities: number[] = [];
    const dispose = autorun(() => quantities.push(sword.quantity));

    Fraktar.actions.adventure();
    writes[0].fail(new Error("the database is down"));
    await settle();

    expect(quantities).toEqual([1, 0, 1]);
    dispose();
  });

  it("should not get in the way of a step whose write succeeds", async function () {
    const writes: Write[] = [];
    const Fraktar = createSheet(writes);
    const sheet = Fraktar.representationRef.current;

    Fraktar.actions.adventure();
    writes[0].done();
    await settle();

    expect(sheet.name).toBe("Fraktar the reckless");
    expect(sheet.inventory.map(({ id }) => id)).toEqual([
      "shield",
      "rope",
      "potion",
    ]);
    expect(Array.from(sheet.quests.keys())).toEqual([
      "dragon",
      "princess",
      "lich",
    ]);
    expect(Array.from(sheet.effects)).toEqual(["blessed", "burning"]);
    expect(Array.from(sheet.party).map(({ name }) => name)).toEqual([
      "ELWING",
      "Thrall",
    ]);
    expect(Fraktar.stepId).toBe(1);
  });
});

describe("a list which is given again as a new list of the same items", function () {
  type Todo = { title: string; done: boolean; meta: { tags: string[] } };

  function createTodos(writes: Write[]) {
    return createAdventurer<{ todos: Todo[] }>(
      {
        todos: [
          { title: "sharpen the sword", done: false, meta: { tags: [] } },
          { title: "feed Rex", done: true, meta: { tags: [] } },
        ],
      },
      writes
    );
  }

  const rewrites: Record<string, (hero: { todos: Todo[] }) => void> = {
    filtered: (hero) => {
      hero.todos = hero.todos.filter(({ done }) => !done);
    },
    "spread with one more": (hero) => {
      hero.todos = [
        ...hero.todos,
        { title: "buy a rope", done: false, meta: { tags: [] } },
      ];
    },
    reversed: (hero) => {
      hero.todos = hero.todos.slice().reverse();
    },
  };

  Object.keys(rewrites).forEach(function (how) {
    it(`should still be listened to after a return, ${how}`, async function () {
      const writes: Write[] = [];
      const Fraktar = createTodos(writes);
      const todos = Fraktar.representationRef.current.todos;

      // The acceptor written the immutable way, and its write fails.
      Fraktar.actions.live(rewrites[how]);
      writes[0].fail(new Error("the database is down"));
      await settle();
      expect(Fraktar.representationRef.current.todos).toBe(todos);

      // The items are the ones the list held all along: what is written
      // in them, and under them, is still the step's.
      Fraktar.actions.live((hero) => {
        hero.todos[0].meta.tags.push("urgent");
      });
      writes[1].fail(new Error("the database is down"));
      await settle();

      expect(asAccepted(Fraktar.lastAttempt).undone).toBe(true);
      expect(
        toJS(Fraktar.representationRef.current.todos[0].meta.tags)
      ).toEqual([]);
    });
  });
});

describe("a node replaced by one of the nodes it holds", function () {
  it("should still be listened to after a return", async function () {
    const writes: Write[] = [];
    const Fraktar = createAdventurer<{ here: any }>(
      { here: { name: "castle", room: { name: "armory", chests: [] } } },
      writes
    );

    Fraktar.actions.live((hero) => {
      hero.here = hero.here.room;
    });
    writes[0].fail(new Error("the database is down"));
    await settle();

    Fraktar.actions.live((hero) => {
      hero.here.room.chests.push("oak");
    });
    writes[1].fail(new Error("the database is down"));
    await settle();

    expect(toJS(Fraktar.representationRef.current)).toEqual({
      here: { name: "castle", room: { name: "armory", chests: [] } },
    });
  });
});

describe("a node taken out of a node which was itself taken out", function () {
  type Order = { id: number; lines: Array<{ item: string; packed: boolean }> };
  type Shop = { pending: Order[]; packed: Order["lines"]; archived: Order[] };

  function createShop(writes: Write[]) {
    return createAdventurer<Shop>(
      {
        pending: [
          {
            id: 1,
            lines: [
              { item: "sword", packed: false },
              { item: "shield", packed: false },
            ],
          },
        ],
        packed: [],
        archived: [],
      },
      writes
    );
  }

  it("should get back what the step wrote in it, put back or not", async function () {
    const writes: Write[] = [];
    const Fraktar = createShop(writes);
    const before = JSON.stringify(Fraktar.representationRef.current);

    Fraktar.actions.live((shop) => {
      // The order leaves the model, then its lines leave the order.
      const order = shop.pending.shift()!;
      const [sword, shield] = order.lines;
      order.lines = [];
      // Written while they are in nobody's hands but the mutator's.
      sword.packed = true;
      shield.packed = true;
      shop.packed.push(sword);
      shop.archived.push(order);
    });
    writes[0].fail(new Error("the database is down"));
    await settle();

    expect(asAccepted(Fraktar.lastAttempt).undone).toBe(true);
    expect(JSON.stringify(Fraktar.representationRef.current)).toBe(before);
  });
});

describe("a step started by a reaction which breaks the model", function () {
  it("should not take back the step it follows, which was written", async function () {
    const writes: Write[] = [];
    const Fraktar = createContainer<Model>()
      .addAcceptor("setHP", {
        mutator: (data, hp: number) => {
          data.hp = hp;
        },
      })
      .addAcceptor("explode", {
        mutator: () => {
          throw new Error("the acceptor broke");
        },
      })
      .addActions({ setHP: "setHP", explode: "explode" })
      .addStepReaction({
        runOnInit: false,
        do: ({ actions }) => actions.explode(),
      })
      .addStepReaction(persist(writes))
      .create({ hp: 10, inventory: [] });

    Fraktar.actions.setHP(5);
    writes[0].done();
    await settle();

    // The write is done: only the consequences of the step did not happen.
    const attempt = asAccepted(Fraktar.lastAttempt);
    expect(attempt.settled).toBe(false);
    expect(attempt.undone).toBeUndefined();
    expect(Fraktar.representationRef.current.hp).toBe(5);
    expect(Fraktar.stepId).toBe(1);
  });
});

describe("the one shot reactions of a step which is taken back", function () {
  it("should come back in the order they had", async function () {
    const writes: Write[] = [];
    const runs: string[] = [];
    const Fraktar = createContainer<Model>()
      .addAcceptor("setHP", {
        mutator: (data, hp: number) => {
          data.hp = hp;
        },
      })
      .addActions({ setHP: "setHP" })
      .addStepReaction({
        once: true,
        runOnInit: false,
        do: () => runs.push("draw the sword"),
      })
      .addStepReaction({
        once: true,
        runOnInit: false,
        do: () => runs.push("raise the shield"),
      })
      .addStepReaction(persist(writes))
      .create({ hp: 10, inventory: [] });

    Fraktar.actions.setHP(5);
    writes[0].fail(new Error("the database is down"));
    await settle();
    Fraktar.actions.setHP(6);

    expect(runs).toEqual([
      "draw the sword",
      "raise the shield",
      "draw the sword",
      "raise the shield",
    ]);
  });
});

describe("a model which holds an object kept by reference", function () {
  it("should stand, as nobody sees what is written in it", async function () {
    const writes: Write[] = [];
    const sigil = { house: "Warfog" };
    const Fraktar = createAdventurer(
      observable({ hp: 10, sigil }, { sigil: observable.ref }),
      writes
    );

    Fraktar.actions.live((hero) => {
      hero.hp = 5;
      hero.sigil.house = "Horde";
    });
    writes[0].fail(new Error("the database is down"));
    await settle();

    const attempt = asAccepted(Fraktar.lastAttempt);
    expect(attempt.undone).toBeUndefined();
    expect(attempt.reason?.code).toBe("STEP_NOT_UNDONE");
    expect(attempt.reason?.message).toBe(
      "An awaited reaction failed and the step 1 could not be taken back: " +
        "the model holds an object which is not observable at /sigil, which " +
        "MobX does not observe: nothing tells what was written in it."
    );
    expect(Fraktar.representationRef.current.hp).toBe(5);
  });
});

describe("a model which holds a class MobX was not told every field of", function () {
  class Hero {
    hp = 10;
    hits = 0;
    constructor() {
      makeObservable(this, { hp: observable });
    }
  }

  it("should stand, as nobody sees what is written in that field", async function () {
    const writes: Write[] = [];
    const party = createAdventurer({ leader: new Hero() }, writes);

    party.actions.live(({ leader }) => {
      leader.hp--;
      leader.hits++;
    });
    writes[0].fail(new Error("the database is down"));
    await settle();

    const attempt = asAccepted(party.lastAttempt);
    expect(attempt.undone).toBeUndefined();
    expect(attempt.reason?.code).toBe("STEP_NOT_UNDONE");
    expect(attempt.reason?.message).toBe(
      "An awaited reaction failed and the step 1 could not be taken back: " +
        "the model holds a field which is not observable at /leader/hits, " +
        "which MobX does not observe: nothing tells what was written in it."
    );
    expect(party.representationRef.current.leader).toEqual({ hp: 9, hits: 1 });
  });
});

describe("a model whose map was put in another order by the step", function () {
  it("should get its order back", async function () {
    const writes: Write[] = [];
    const Fraktar = createAdventurer(
      {
        quests: observable.map([
          ["dragon", 1],
          ["goblins", 0],
        ]),
      },
      writes
    );

    Fraktar.actions.live((hero) => {
      hero.quests.replace([
        ["goblins", 0],
        ["dragon", 1],
      ]);
    });
    writes[0].fail(new Error("the database is down"));
    await settle();

    expect(asAccepted(Fraktar.lastAttempt).undone).toBe(true);
    expect(Array.from(Fraktar.representationRef.current.quests.keys())).toEqual(
      ["dragon", "goblins"]
    );
  });
});

describe("an action called while the step which is taken back was presented", function () {
  it("should leave nothing to refuse nor to take back: it was never presented", async function () {
    const writes: Write[] = [];
    const Fraktar = createFraktar(writes);
    // Who listens to the model picks up a shield as soon as the hero is hurt.
    const dispose = observe(
      Fraktar.representationRef.current,
      "hp",
      ({ newValue }) => {
        if (newValue < 10) {
          Fraktar.actions.addItem("shield");
        }
      }
    );

    Fraktar.actions.setHP(3);
    writes[0].fail(new Error("The database is down."));
    await settle();

    expect(Fraktar.representationRef.current).toEqual({
      hp: 10,
      inventory: [],
    });
    expect(Fraktar.stepId).toBe(0);
    expect(asAccepted(Fraktar.lastAttempt).undone).toBe(true);
    dispose();
  });

  it("should leave the step whole, and its return too, when the mutator calls it", async function () {
    const writes: Write[] = [];
    const Fraktar = createAdventurer({ hp: 10, inventory: ["sword"] }, writes);

    Fraktar.actions.live((hero) => {
      hero.hp = 3;
      // Another adventure, asked for in the middle of this one.
      Fraktar.actions.live((later) => later.inventory.push("shield"));
      hero.inventory.push("potion");
    });

    expect(Fraktar.representationRef.current).toEqual({
      hp: 3,
      inventory: ["sword", "potion"],
    });

    writes[0].fail(new Error("The database is down."));
    await settle();

    expect(Fraktar.representationRef.current).toEqual({
      hp: 10,
      inventory: ["sword"],
    });
    expect(writes.length).toBe(1);
  });
});

describe("an action sent while the step is taken back", function () {
  /**
   * A hero whose blow is written to a database, and who picks up a shield
   * as soon as he is seen whole again: `pick` is how he asks for it.
   */
  function createShielded(writes: Write[]) {
    const Fraktar = createContainer<Model>()
      .addAcceptor("setHP", {
        mutator: (data, hp: number) => {
          data.hp = hp;
        },
      })
      .addAcceptor("addItem", {
        mutator: (data, item: string) => {
          data.inventory.push(item);
        },
      })
      .addActions({
        setHP: "setHP",
        addItem: "addItem",
        fetch: {
          isAsync: true,
          action: async (item: string) => [{ type: "addItem", payload: item }],
        },
        forge: {
          isAsync: true,
          isCancelable: true,
          action: async (item: string) => [{ type: "addItem", payload: item }],
        },
      })
      .addStepReaction(persist(writes))
      .create({ hp: 10, inventory: [] });
    return Fraktar;
  }

  (["addItem", "fetch", "forge"] as const).forEach(function (action) {
    it(`should be discarded, the container being locked, when it is ${action}`, async function () {
      const writes: Write[] = [];
      const Fraktar = createShielded(writes);
      const asked: Array<Promise<Attempt<any>>> = [];
      const dispose = observe(
        Fraktar.representationRef.current,
        "hp",
        ({ newValue }) => {
          if (newValue === 10) {
            asked.push(Fraktar.attempt[action]("shield"));
          }
        }
      );

      const outcome = Fraktar.attempt.setHP(3);
      writes[0].fail(new Error("The database is down."));
      await settle();
      dispose();

      expect(asAccepted(await outcome).undone).toBe(true);
      expect(asDiscarded(await asked[0]).reason).toEqual({
        code: RejectionCode.stepLocked,
        message: "A step is being taken back.",
      });
      expect(Fraktar.representationRef.current).toEqual({
        hp: 10,
        inventory: [],
      });
      expect(Fraktar.stepId).toBe(0);
      expect(writes.length).toBe(1);
    });
  });

  it("should be presented when it is sent once the step is back", async function () {
    const writes: Write[] = [];
    const Fraktar = createShielded(writes);
    const asked: Array<Promise<Attempt<any>>> = [];
    // An autorun acts at the end of the transaction: the model is back.
    const dispose = autorun(() => {
      if (Fraktar.representationRef.current.hp === 10 && Fraktar.stepId === 0 && writes.length) {
        asked.push(Fraktar.attempt.addItem("shield"));
      }
    });

    Fraktar.actions.setHP(3);
    writes[0].fail(new Error("The database is down."));
    await settle();
    writes[1].done();
    await settle();
    dispose();

    expect(asAccepted(await asked[0]).settled).toBe(true);
    expect(Fraktar.representationRef.current).toEqual({
      hp: 10,
      inventory: ["shield"],
    });
  });
});

describe("a step taken back while who listens to the control states throws", function () {
  it("should be taken back whole, and what waited behind it refused", async function () {
    const writes: Write[] = [];
    const Fraktar = createFraktar(writes);
    let isBack = false;
    const dispose = observe(Fraktar.controlStates, () => {
      if (isBack) {
        throw new Error("the status bar broke");
      }
    });

    Fraktar.actions.setHP(0);
    Fraktar.actions.addItem("sword");
    isBack = true;
    writes[0].fail(new Error("The database is down."));
    await settle();

    expect(Fraktar.representationRef.current).toEqual({
      hp: 10,
      inventory: [],
    });
    expect(Fraktar.controlStates).toEqual(["IS_ALIVE"]);
    expect(Fraktar.stepId).toBe(0);
    expect(asDiscarded(Fraktar.lastAttempt).reason.code).toBe(
      RejectionCode.precedingStepUndone
    );
    expect(writes.length).toBe(1);
    dispose();
  });

  it("should be said taken back on the last attempt", async function () {
    const writes: Write[] = [];
    const Fraktar = createFraktar(writes);
    let isBack = false;
    const dispose = observe(Fraktar.controlStates, () => {
      if (isBack) {
        throw new Error("the status bar broke");
      }
    });

    Fraktar.actions.setHP(0);
    isBack = true;
    writes[0].fail(new Error("The database is down."));
    await settle();

    expect(asAccepted(Fraktar.lastAttempt).undone).toBe(true);
    dispose();
  });
});

describe("a step whose control states are kept from coming back", function () {
  /**
   * A hero whose death can not be taken back: whoever is asked before the
   * control states are written refuses, its own way.
   */
  async function die(refuse: () => null) {
    const writes: Write[] = [];
    const Fraktar = createFraktar(writes);
    let isBack = false;
    const dispose = intercept(
      Fraktar.controlStates as IObservableArray<string>,
      (change) => (isBack ? refuse() : change)
    );

    Fraktar.actions.setHP(0);
    isBack = true;
    writes[0].fail(new Error("the database is down"));
    await settle();
    dispose();
    return Fraktar;
  }

  it("should stand whole, and say so, when the refusal is silent", async function () {
    const Fraktar = await die(() => null);

    const attempt = asAccepted(Fraktar.lastAttempt);
    expect(attempt.undone).toBeUndefined();
    expect(attempt.reason?.code).toBe("STEP_NOT_UNDONE");
    expect(attempt.reason?.message).toBe(
      "An awaited reaction failed and the step 1 could not be taken back: " +
        "the control states were kept from coming back."
    );
    // Not a hero alive again who is still said dead.
    expect(Fraktar.representationRef.current.hp).toBe(0);
    expect(Fraktar.controlStates).toEqual(["IS_DEAD", "JUST_DIED"]);
    expect(Fraktar.stepId).toBe(1);
  });

  it("should stand whole when the refusal throws", async function () {
    const Fraktar = await die(() => {
      throw new Error("the dead stay dead");
    });

    expect(asAccepted(Fraktar.lastAttempt).reason?.code).toBe(
      "STEP_NOT_UNDONE"
    );
    expect(Fraktar.representationRef.current.hp).toBe(0);
    expect(Fraktar.controlStates).toEqual(["IS_DEAD", "JUST_DIED"]);
  });
});

describe("a container nobody holds anymore", function () {
  /**
   * Have what nobody holds collected now. Node only gives the way to when it
   * is asked to.
   */
  function collect() {
    setFlagsFromString("--expose-gc");
    runInNewContext("gc")();
  }

  it("should be let go of with its model, even when what it held lives on", async function () {
    // Quests which outlive the heroes: one hero per request, for example.
    const quests = observable.map([["dragon", 1]]);
    // A megabyte of memoirs each, written out and not only promised.
    const createHero = () =>
      createAdventurer(
        { quests, memoirs: Buffer.alloc(1e6, "once upon a time ").toString() },
        []
      );
    collect();
    const before = process.memoryUsage().heapUsed;

    for (let hero = 0; hero < 50; hero++) {
      createHero();
    }
    await settle();
    collect();

    // Kept alive by the quests, the fifty of them would be here still.
    const megabytes = (process.memoryUsage().heapUsed - before) / 1e6;
    expect(megabytes).toBeLessThan(10);
  });
});
