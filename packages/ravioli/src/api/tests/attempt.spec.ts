import {
  _resetGlobalState,
  autorun,
  configure,
  intercept,
  observe,
  reaction,
} from "mobx";
import { Attempt, IInstance, RejectionCode, createContainer } from "../..";
import {
  Write,
  asAccepted,
  asDiscarded,
  asRejected,
  persist,
  settle,
} from "./helpers";

type Model = { hp: number; inventory: string[] };

/**
 * Says whether a promise is still pending, without waiting for it.
 */
function watch<T>(promise: Promise<T>) {
  const watched = { isPending: true };
  promise.then(
    () => (watched.isPending = false),
    () => (watched.isPending = false)
  );
  return watched;
}

/**
 * A hero who can only be healed alive, and whose every step is written to a
 * database. The write is awaited.
 */
function createFraktar(writes: Write[] = []) {
  return createContainer<Model>()
    .addAcceptor("setHP", {
      condition: (data, hp: number) =>
        hp >= 0 || { code: "NEGATIVE_HP", message: "hp cannot be negative" },
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
    .addActions({
      setHP: "setHP",
      addItem: "addItem",
      heal: {
        isAllowed: ({ controlStates }) => controlStates.includes("IS_ALIVE"),
        action: (hp: number) => [{ type: "setHP", payload: hp }],
      },
      loot: (chest: { weapon: string; armor: string }) => [
        { type: "addItem", payload: chest.weapon },
        { type: "addItem", payload: chest.armor },
      ],
    })
    .addStepReaction(persist(writes))
    .create({ hp: 10, inventory: [] });
}

beforeEach(function () {
  jest.spyOn(console, "info").mockImplementation(() => {});
  jest.spyOn(console, "warn").mockImplementation(() => {});
  jest.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(function () {
  jest.restoreAllMocks();
});

describe("the author of an accepted action", function () {
  it("should be told once the reactions of the step are done", async function () {
    const writes: Write[] = [];
    const Fraktar = createFraktar(writes);

    const outcome = Fraktar.attempt.setHP(5);
    const watched = watch(outcome);
    await settle();

    // The step is taken, its write is not done: nothing is final yet.
    expect(Fraktar.stepId).toBe(1);
    expect(watched.isPending).toBe(true);

    writes[0].done();

    const attempt = asAccepted(await outcome);
    expect(attempt.accepted).toEqual([{ type: "setHP", payload: 5 }]);
    expect(attempt.rejected).toEqual([]);
    expect(attempt.attemptedAt).toBe(0);
    expect(attempt.settled).toBe(true);
  });

  it("should be told what the last attempt says", async function () {
    const writes: Write[] = [];
    const Fraktar = createFraktar(writes);

    const outcome = Fraktar.attempt.setHP(5);
    writes[0].done();

    expect(await outcome).toBe(Fraktar.lastAttempt);
  });

  it("should have the action called with what it was given", async function () {
    const writes: Write[] = [];
    const Fraktar = createFraktar(writes);

    const outcome = Fraktar.attempt.loot({
      weapon: "sword",
      armor: "shield",
    });
    writes[0].done();

    expect(asAccepted(await outcome).accepted).toEqual([
      { type: "addItem", payload: "sword" },
      { type: "addItem", payload: "shield" },
    ]);
    expect(Fraktar.representationRef.current.inventory).toEqual([
      "sword",
      "shield",
    ]);
  });

  it("should be told both sides of a partially accepted proposal", async function () {
    const writes: Write[] = [];
    const Fraktar = createFraktar(writes);

    const outcome = Fraktar.attempt(({ addItem, setHP }) => [
      addItem("sword"),
      setHP(-1),
    ]);
    writes[0].done();

    const attempt = asAccepted(await outcome);
    expect(attempt.accepted).toEqual([{ type: "addItem", payload: "sword" }]);
    expect(attempt.rejected).toEqual([
      {
        mutation: { type: "setHP", payload: -1 },
        reason: { code: "NEGATIVE_HP", message: "hp cannot be negative" },
      },
    ]);
  });
});

describe("the author of a refused action", function () {
  it("should be told at once why the model rejected it", async function () {
    const writes: Write[] = [];
    const Fraktar = createFraktar(writes);

    const attempt = asRejected(await Fraktar.attempt.setHP(-1));

    expect(attempt.rejected).toEqual([
      {
        mutation: { type: "setHP", payload: -1 },
        reason: { code: "NEGATIVE_HP", message: "hp cannot be negative" },
      },
    ]);
    expect(attempt.attemptedAt).toBe(0);
    expect(Fraktar.stepId).toBe(0);
    expect(writes.length).toBe(0);
  });

  it("should be told the action was not allowed", async function () {
    const writes: Write[] = [];
    const Fraktar = createFraktar(writes);
    const death = Fraktar.attempt.setHP(0);
    writes[0].done();
    await death;

    const attempt = asDiscarded(await Fraktar.attempt.heal(5));

    expect(attempt.reason.code).toBe(RejectionCode.unauthorized);
    expect(attempt.reason.meta).toEqual({ action: "heal", controlStates: [] });
    expect(Fraktar.representationRef.current.hp).toBe(0);
  });
});

describe("the author of a cancelable action", function () {
  /**
   * The potion takes a while to act: the test decides when.
   */
  function createDrinker() {
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
        hit: (hp: number) => [{ type: "addHP", payload: -hp }],
        drink: {
          isAsync: true,
          isCancelable: true,
          action: async (hp: number) => {
            await potion;
            return [{ type: "addHP", payload: hp }];
          },
        },
      })
      .create({ hp: 10, inventory: [] });

    return { Fraktar, swallow };
  }

  it("should be told it was dropped: the state changed meanwhile", async function () {
    const { Fraktar, swallow } = createDrinker();

    const outcome = Fraktar.attempt.drink(5);
    // The world moves on before the potion acts.
    Fraktar.actions.hit(1);
    swallow();

    const attempt = asDiscarded(await outcome);
    expect(attempt.reason.code).toBe(RejectionCode.staleProposal);
    expect(attempt.reason.meta).toEqual({ proposalStepId: 0 });
    expect(attempt.attemptedAt).toBe(1);
    expect(Fraktar.representationRef.current.hp).toBe(9);
  });

  it("should be told it was accepted when nothing moved", async function () {
    const { Fraktar, swallow } = createDrinker();

    const outcome = Fraktar.attempt.drink(5);
    swallow();

    expect(asAccepted(await outcome).settled).toBe(true);
    expect(Fraktar.representationRef.current.hp).toBe(15);
  });
});

describe("the authors of actions which wait", function () {
  it("should each be told of their own action", async function () {
    const writes: Write[] = [];
    const Fraktar = createFraktar(writes);

    const first = Fraktar.attempt.setHP(5);
    const second = Fraktar.attempt.setHP(-1);
    const third = Fraktar.attempt.addItem("sword");

    writes[0].done();
    await settle();
    writes[1].done();

    // The last attempt only ever holds one of them.
    expect(asAccepted(await first).accepted).toEqual([
      { type: "setHP", payload: 5 },
    ]);
    expect(asRejected(await second).attemptedAt).toBe(1);
    const attempt = asAccepted(await third);
    expect(attempt.accepted).toEqual([{ type: "addItem", payload: "sword" }]);
    expect(attempt.attemptedAt).toBe(1);
  });

  it("should not be told before their turn", async function () {
    const writes: Write[] = [];
    const Fraktar = createFraktar(writes);

    Fraktar.actions.setHP(5);
    const watched = watch(Fraktar.attempt.setHP(-1));
    await settle();

    // The model would refuse it, but it has not seen it yet.
    expect(watched.isPending).toBe(true);

    writes[0].done();
    await settle();

    expect(watched.isPending).toBe(false);
  });

  it("should be told when the step ahead of theirs was undone", async function () {
    const writes: Write[] = [];
    const Fraktar = createFraktar(writes);
    const error = new Error("the database is down");
    const order: string[] = [];

    const first = Fraktar.attempt.setHP(5);
    const second = Fraktar.attempt.addItem("sword");
    first.then(() => order.push("first"));
    second.then(() => order.push("second"));

    writes[0].fail(error);

    const undone = asAccepted(await first);
    expect(undone.accepted).toEqual([{ type: "setHP", payload: 5 }]);
    expect(undone.settled).toBe(false);
    expect(undone.undone).toBe(true);
    expect(undone.reason).toEqual({
      code: RejectionCode.reactionThrew,
      message: "the database is down",
      meta: { error },
    });

    const refused = asDiscarded(await second);
    expect(refused.reason.code).toBe(RejectionCode.precedingStepUndone);
    expect(refused.reason.meta).toEqual({ stepId: 1, reason: undone.reason });

    // Told in the order things happened.
    expect(order).toEqual(["first", "second"]);
    expect(Fraktar.representationRef.current).toEqual({
      hp: 10,
      inventory: [],
    });
  });
});

describe("the author of an action whose consequences fail", function () {
  /**
   * A hero who loots a potion after each hit. The potion is a step the
   * reactions start, with a write of its own.
   */
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
      .create({ hp: 10, inventory: [] });
  }

  it("should be told once the steps the reactions started are done too", async function () {
    const writes: Write[] = [];
    const Fraktar = createLooter(writes);

    const outcome = Fraktar.attempt.setHP(5);
    const watched = watch(outcome);
    writes[0].done();
    await settle();

    // The hit is written. The potion it brought is being written.
    expect(Fraktar.stepId).toBe(2);
    expect(watched.isPending).toBe(true);

    writes[1].done();

    const attempt = asAccepted(await outcome);
    // The attempt is the author's own: the potion is not in it.
    expect(attempt.accepted).toEqual([{ type: "setHP", payload: 5 }]);
    expect(attempt.settled).toBe(true);
  });

  it("should be told the step stands when one it started was undone", async function () {
    const writes: Write[] = [];
    const Fraktar = createLooter(writes);
    const error = new Error("the database is down");

    const outcome = Fraktar.attempt.setHP(5);
    writes[0].done();
    await settle();
    writes[1].fail(error);

    const attempt = asAccepted(await outcome);
    expect(attempt.settled).toBe(false);
    expect(attempt.reason?.message).toBe("the database is down");
    // The potion was taken back. The hit was written: it stays.
    expect(attempt.undone).toBeUndefined();
    expect(Fraktar.representationRef.current).toEqual({ hp: 5, inventory: [] });
    expect(asAccepted(Fraktar.lastAttempt).undone).toBe(true);
  });

  it("should be told when a reaction which is not awaited threw", async function () {
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
      .create({ hp: 10, inventory: [] });

    const attempt = asAccepted(await Fraktar.attempt.setHP(5));

    // The step itself stands, its consequences do not.
    expect(attempt.settled).toBe(false);
    expect(attempt.undone).toBeUndefined();
    expect(attempt.reason?.code).toBe(RejectionCode.reactionThrew);
    expect(Fraktar.representationRef.current.hp).toBe(5);
  });

  it("should be told when the reactions never settled", async function () {
    const gate = createContainer<{ status: string; failures: number }>()
      .addAcceptor("fail", {
        mutator: (data) => {
          data.failures = data.failures + 1;
        },
      })
      // No condition: the reaction can propose this one forever.
      .addAcceptor("lock", {
        mutator: (data) => {
          data.status = "LOCKED";
        },
      })
      .addActions({ fail: "fail", lock: "lock" })
      .addStepReaction({
        runOnInit: false,
        do: ({ actions }) => actions.lock(),
      })
      .create({ status: "OPEN", failures: 0 });

    const attempt = asAccepted(await gate.attempt.fail());

    expect(attempt.accepted).toEqual([{ type: "fail", payload: undefined }]);
    expect(attempt.settled).toBe(false);
    expect(attempt.reason?.code).toBe(RejectionCode.reactionsDidNotSettle);
  });

  it("should be told when the model refuses what the reactions propose", async function () {
    const writes: Write[] = [];
    const Fraktar = createContainer<Model>()
      .addAcceptor("setHP", {
        condition: (data, hp: number) => hp >= 0,
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
      // A blow too many, which the model refuses.
      .addStepReaction({
        runOnInit: false,
        when: ({ data }) => data.hp === 5,
        do: ({ actions }) => actions.setHP(-1),
      })
      .addStepReaction(persist(writes))
      .create({ hp: 10, inventory: [] });

    const outcome = Fraktar.attempt.setHP(5);
    const waiting = Fraktar.attempt.addItem("sword");
    writes[0].done();
    await settle();
    writes[1].done();

    expect(asAccepted(await outcome).attemptedAt).toBe(0);
    expect(asAccepted(await waiting).attemptedAt).toBe(1);
  });
});

describe("a composed proposal", function () {
  it("should have its outcome told as any other", async function () {
    const writes: Write[] = [];
    const Fraktar = createFraktar(writes);

    const outcome = Fraktar.attempt(({ setHP, addItem }) => [
      setHP(5),
      addItem("sword"),
    ]);
    writes[0].done();

    const attempt = asAccepted(await outcome);
    expect(attempt.accepted).toEqual([
      { type: "setHP", payload: 5 },
      { type: "addItem", payload: "sword" },
    ]);
    // One proposal, one step.
    expect(Fraktar.stepId).toBe(1);
  });

  it("should be taken already built", async function () {
    const Fraktar = createFraktar();

    const attempt = asRejected(
      await Fraktar.attempt([
        [{ type: "setHP", payload: -1 }],
        [{ type: "setHP", payload: -2 }],
      ])
    );

    expect(attempt.rejected.length).toBe(2);
  });
});

describe("an action which is asynchronous", function () {
  it("should have its outcome told once its proposal went through", async function () {
    const Fraktar = createContainer<Model>()
      .addAcceptor("addItem", {
        mutator: (data, item: string) => {
          data.inventory.push(item);
        },
      })
      .addActions({
        search: {
          isAsync: true,
          action: async (item: string) => [{ type: "addItem", payload: item }],
        },
      })
      .create({ hp: 10, inventory: [] });

    const attempt = asAccepted(await Fraktar.attempt.search("torch"));

    expect(attempt.accepted).toEqual([{ type: "addItem", payload: "torch" }]);
    expect(Fraktar.representationRef.current.inventory).toEqual(["torch"]);
  });
});

describe("an action which breaks", function () {
  function createCursed(writes: Write[] = []) {
    return createContainer<Model>()
      .addAcceptor("setHP", {
        mutator: (data, hp: number) => {
          data.hp = hp;
        },
      })
      .addAcceptor("curse", {
        mutator: () => {
          throw new Error("the acceptor is cursed");
        },
      })
      .addActions({
        setHP: "setHP",
        curse: "curse",
        stumble: () => {
          throw new Error("the action stumbled");
        },
        search: {
          isAsync: true,
          action: async () => {
            throw new Error("nothing to be found");
          },
        },
      })
      .addStepReaction(persist(writes))
      .create({ hp: 10, inventory: [] });
  }

  it("should reject, a refusal is an outcome but a bug is not", async function () {
    const Fraktar = createCursed();

    // Called directly, the action throws at its caller.
    expect(() => Fraktar.actions.stumble()).toThrowError("the action stumbled");

    await expect(Fraktar.attempt.stumble()).rejects.toThrowError(
      "the action stumbled"
    );
    await expect(Fraktar.attempt.search()).rejects.toThrowError(
      "nothing to be found"
    );
    await expect(Fraktar.attempt.curse()).rejects.toThrowError(
      "the acceptor is cursed"
    );
  });

  it("should reject when it breaks the model after having waited", async function () {
    const writes: Write[] = [];
    const Fraktar = createCursed(writes);

    Fraktar.actions.setHP(5);
    const cursed = Fraktar.attempt.curse();
    const next = Fraktar.attempt.setHP(7);
    // Handled here, before the write ends.
    const rejection = expect(cursed).rejects.toThrowError(
      "the acceptor is cursed"
    );

    writes[0].done();
    await rejection;
    writes[1].done();

    // The one behind it had its turn all the same.
    expect(asAccepted(await next).attemptedAt).toBe(1);
  });
});

describe("an attempt made by a reaction", function () {
  it("should get a step of its own, behind what the reactions propose", async function () {
    const steps: string[][] = [];
    let outcome: Promise<Attempt<any>> | undefined;
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
        runOnInit: false,
        do: ({ delta }) =>
          steps.push(
            delta.acceptedMutations.map(({ payload }) => String(payload))
          ),
      })
      .addStepReaction({
        runOnInit: false,
        when: ({ delta }) =>
          delta.acceptedMutations.some(({ type }) => type === "setHP"),
        do: ({ actions }) => {
          // Whoever asks what becomes of a proposal is not composed with the others.
          outcome = Fraktar.attempt.addItem("trophy");
          actions.addItem("potion");
          actions.addItem("bandage");
        },
      })
      .create({ hp: 10, inventory: [] });

    Fraktar.actions.setHP(5);

    expect(steps).toEqual([["5"], ["potion", "bandage"], ["trophy"]]);
    expect(asAccepted(await outcome).accepted).toEqual([
      { type: "addItem", payload: "trophy" },
    ]);
  });
});

describe("an action which is fired and forgotten", function () {
  it("should still return nothing", function () {
    const Fraktar = createFraktar();

    expect(Fraktar.actions.setHP(5)).toBeUndefined();
    expect(
      Fraktar.compose(({ addItem }) => [addItem("sword")])
    ).toBeUndefined();
  });

  it("should not hold a reaction which returns what its action returned", async function () {
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
      // Awaited, and written the short way: had the action returned a promise
      // of its outcome, the step would wait for a step which waits for it.
      .addStepReaction({
        awaitAsync: true,
        runOnInit: false,
        when: ({ delta }) =>
          delta.acceptedMutations.some(({ type }) => type === "setHP"),
        do: ({ actions }) => actions.addItem("potion"),
      })
      .create({ hp: 10, inventory: [] });

    const attempt = asAccepted(await Fraktar.attempt.setHP(5));

    expect(attempt.settled).toBe(true);
    expect(Fraktar.representationRef.current.inventory).toEqual(["potion"]);
  });
});

describe("a reaction which asks what becomes of what it proposes", function () {
  it("should be cut as any reaction which keeps a chain of steps going", async function () {
    const outcomes: Array<Promise<Attempt<any>>> = [];
    const Fraktar = createContainer<Model>()
      .addAcceptor("incHP", {
        mutator: (data) => {
          data.hp++;
        },
      })
      .addActions({ incHP: "incHP" })
      // No acceptor ever refuses it, and it does not go through the actions
      // it is given: this one used to run for ever.
      .addStepReaction({
        runOnInit: false,
        do: () => {
          outcomes.push(Fraktar.attempt.incHP());
        },
      })
      .create({ hp: 0, inventory: [] });

    Fraktar.actions.incHP();

    // The step, then fifty more in a row.
    expect(Fraktar.representationRef.current.hp).toBe(51);
    const last = asDiscarded(await outcomes[outcomes.length - 1]);
    expect(last.reason.code).toBe(RejectionCode.reactionsDidNotSettle);
    expect(asAccepted(await outcomes[0]).settled).toBe(true);
  });

  it("should be cut when it keeps the chain going one way then the other", async function () {
    const Fraktar = createContainer<Model>()
      .addAcceptor("incHP", {
        mutator: (data) => {
          data.hp++;
        },
      })
      .addActions({ incHP: "incHP" })
      // Each step is written somewhere first, which takes a moment.
      .addStepReaction({
        runOnInit: false,
        awaitAsync: true,
        do: () => settle(),
      })
      // Proposes as any reaction does, then asks what becomes of the next
      // one, in turn. It gives up by itself far beyond what a chain may run.
      .addStepReaction({
        runOnInit: false,
        when: ({ data }) => data.hp < 200,
        do: ({ actions, data }) => {
          if (data.hp % 2) {
            actions.incHP();
          } else {
            Fraktar.attempt.incHP();
          }
        },
      })
      .create({ hp: 0, inventory: [] });

    Fraktar.actions.incHP();
    for (let stepId = -1; stepId !== Fraktar.stepId; ) {
      stepId = Fraktar.stepId;
      await settle();
      await settle();
    }

    // The step, then fifty more in a row: one chain, whoever keeps it going.
    expect(Fraktar.representationRef.current.hp).toBe(51);
  });
});

describe("the author of an action which is not allowed anymore", function () {
  it("should be told so when its turn comes", async function () {
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
    const first = Fraktar.attempt.drink();
    const second = Fraktar.attempt.drink();
    writes[0].done();
    await settle();
    writes[1].done();

    expect(asAccepted(await first).settled).toBe(true);
    const refused = asDiscarded(await second);
    expect(refused.reason.code).toBe(RejectionCode.unauthorized);
    expect(refused.reason.meta).toEqual({ action: "drink", controlStates: [] });
    expect(Fraktar.representationRef.current).toEqual({ potions: 0, hp: 7 });
  });
});

describe("the author of a step written while a reaction of the creation fails", function () {
  it("should only be told of their own step", async function () {
    const writes: Write[] = [];
    const Fraktar = createContainer<Model>()
      .addAcceptor("setHP", {
        mutator: (data, hp: number) => {
          data.hp = hp;
        },
      })
      .addActions({ setHP: "setHP" })
      // Runs at creation too: the container is open meanwhile.
      .addStepReaction({ ...persist(writes), runOnInit: true })
      .create({ hp: 10, inventory: [] });

    const outcome = Fraktar.attempt.setHP(5);
    writes[0].fail(new Error("the first write failed"));
    await settle();
    writes[1].done();

    expect(asAccepted(await outcome).settled).toBe(true);
  });
});

describe("the author of a step which can not be taken back", function () {
  it("should be told it stands, and not that it was undone", async function () {
    const writes: Write[] = [];
    const Fraktar = createContainer<{ curses: string[] }>()
      .addAcceptor("curse", {
        mutator: (data, curse: string) => {
          data.curses.push(curse);
        },
      })
      .addActions({ enchant: "curse" })
      .addStepReaction(persist(writes))
      .create({ curses: [] });
    // Something which listens to the model refuses to lift a curse.
    intercept(Fraktar.representationRef.current.curses, (change) => {
      if (change.type === "splice" && change.removedCount) {
        throw new Error("a curse can not be lifted");
      }
      return change;
    });

    const outcome = Fraktar.attempt.enchant("greed");
    const next = Fraktar.attempt.enchant("pride");
    writes[0].fail(new Error("the database is down"));

    const attempt = asAccepted(await outcome);
    expect(attempt.undone).toBeUndefined();
    expect(attempt.settled).toBe(false);
    expect(attempt.reason?.code).toBe("STEP_NOT_UNDONE");

    // The step stands: the one behind it is presented, not refused.
    await settle();
    writes[1].done();
    expect(asAccepted(await next).settled).toBe(true);
  });
});

describe("an instance written by hand before attempt existed", function () {
  it("should still be an instance", function () {
    // What a test double looked like in 1.7. The type is what is checked here.
    const double: IInstance<Model> = {
      stepId: 0,
      lastAttempt: undefined,
      actions: undefined as never,
      controlStates: [],
      representationRef: { current: { hp: 10, inventory: [] } },
      compose: () => {},
      rollback: () => {},
      reset: () => {},
    };

    expect(double.representationRef.current.hp).toBe(10);
  });
});

describe("the author of a step which fails twice", function () {
  it("should be told the first reason", async function () {
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
      .create({ hp: 10, inventory: [] });

    const attempt = asAccepted(await Fraktar.attempt.setHP(-1));

    // The reaction threw, then the representation could not be made.
    expect(attempt.settled).toBe(false);
    expect(attempt.reason?.message).toBe("boom");
  });
});

describe("the author of an action which takes a while, and is not allowed", function () {
  /**
   * A hero who can only drink alive. The potion takes a while to act: the
   * hero can die in between.
   */
  function createMortal(hp: number, isCancelable: boolean) {
    let swallow!: () => void;
    const potion = new Promise<void>((resolve) => {
      swallow = resolve;
    });
    const Fraktar = createContainer<{ hp: number }>()
      .addAcceptor("addHP", {
        mutator: (data, healed: number) => {
          data.hp += healed;
        },
      })
      .addControlStatePredicate("IS_ALIVE", ({ data }) => data.hp > 0)
      .addActions({
        hit: (wound: number) => [{ type: "addHP", payload: -wound }],
        drink: {
          isAsync: true,
          isCancelable,
          isAllowed: ({ controlStates }) => controlStates.includes("IS_ALIVE"),
          action: async (healed: number) => {
            await potion;
            return [{ type: "addHP", payload: healed }];
          },
        },
      })
      .create({ hp });
    return { Fraktar, swallow };
  }

  beforeEach(function () {
    jest.spyOn(console, "warn").mockImplementation(() => {});
  });

  it("should be told when it is refused as it is called", async function () {
    const { Fraktar } = createMortal(0, false);

    const attempt = asDiscarded(await Fraktar.attempt.drink(5));

    expect(attempt.reason.code).toBe(RejectionCode.unauthorized);
  });

  it("should be told when it is refused once it resolved", async function () {
    const { Fraktar, swallow } = createMortal(3, false);

    const outcome = Fraktar.attempt.drink(5);
    Fraktar.actions.hit(3);
    swallow();

    expect(asDiscarded(await outcome).reason.code).toBe(
      RejectionCode.unauthorized
    );
  });

  it("should be told when it is cancelable too", async function () {
    const { Fraktar } = createMortal(0, true);

    const attempt = asDiscarded(await Fraktar.attempt.drink(5));

    expect(attempt.reason.code).toBe(RejectionCode.unauthorized);
  });
});

describe("the author of a step an observer throws at", function () {
  // MobX lets the throw of an observer through when it is told to, which is
  // what it advises for tests. It is reset afterwards, as its own tests do.
  beforeEach(function () {
    _resetGlobalState();
    configure({ disableErrorBoundaries: true });
  });

  afterEach(function () {
    _resetGlobalState();
  });

  it("should be told what became of the step, which was taken", async function () {
    const writes: Write[] = [];
    const Fraktar = createFraktar(writes);
    const dispose = reaction(
      () => Fraktar.representationRef.current.hp,
      () => {
        throw new Error("the health bar broke");
      }
    );

    const outcome = Fraktar.attempt.setHP(5);
    dispose();
    writes[0].done();

    // Not rejected with the health bar: the step is there, and written.
    expect(asAccepted(await outcome).settled).toBe(true);
    expect(Fraktar.stepId).toBe(1);
  });
  it("should be told the step was taken back when the observer throws as the model comes back", async function () {
    const writes: Write[] = [];
    const Fraktar = createFraktar(writes);
    const outcome = Fraktar.attempt.setHP(5);
    const waiting = Fraktar.attempt.addItem("sword");
    const dispose = reaction(
      () => Fraktar.representationRef.current.hp,
      () => {
        throw new Error("the health bar broke");
      }
    );

    writes[0].fail(new Error("The database is down."));

    expect(asAccepted(await outcome).undone).toBe(true);
    expect(asDiscarded(await waiting).reason.code).toBe(
      RejectionCode.precedingStepUndone
    );
    expect(Fraktar.representationRef.current).toEqual({
      hp: 10,
      inventory: [],
    });
    dispose();
  });

  it("should be told of a refusal the observer of the last attempt throws at", async function () {
    const Fraktar = createFraktar();
    Fraktar.actions.setHP(0);
    const dispose = reaction(
      () => Fraktar.lastAttempt?.status === "discarded",
      () => {
        throw new Error("the log broke");
      }
    );

    const outcome = Fraktar.attempt.heal(5);
    dispose();

    expect(asDiscarded(await outcome).reason.code).toBe(
      RejectionCode.unauthorized
    );
  });
});

describe("the author of a step taken back while who listens to the control states throws", function () {
  it("should be told it was taken back, and so should who waited behind", async function () {
    const writes: Write[] = [];
    const Fraktar = createFraktar(writes);
    const outcome = Fraktar.attempt.setHP(0);
    const waiting = Fraktar.attempt.addItem("sword");
    let isBack = false;
    const dispose = observe(Fraktar.controlStates, () => {
      if (isBack) {
        throw new Error("the status bar broke");
      }
    });

    isBack = true;
    writes[0].fail(new Error("The database is down."));

    expect(asAccepted(await outcome).undone).toBe(true);
    expect(asDiscarded(await waiting).reason.code).toBe(
      RejectionCode.precedingStepUndone
    );
    expect(Fraktar.controlStates).toEqual(["IS_ALIVE"]);
    expect(Fraktar.representationRef.current).toEqual({
      hp: 10,
      inventory: [],
    });
    expect(Fraktar.stepId).toBe(0);
    dispose();
  });
});

describe("the author of an action called while a proposal is presented", function () {
  /**
   * A hero whose blow is interrupted: somebody asks what becomes of another
   * action from inside its presentation. `asked` is what they are answered.
   */
  function createInterrupted(asked: Array<Promise<Attempt<any>>>) {
    const interrupt: { from?: string; ask: () => Promise<Attempt<any>> } = {
      ask: () => Fraktar.attempt.addItem("shield"),
    };
    const at = (place: string) => {
      if (interrupt.from === place) {
        asked.push(interrupt.ask());
      }
    };
    const Fraktar = createContainer<Model>()
      .addAcceptor("setHP", {
        condition: () => {
          at("condition");
          return true;
        },
        mutator: (data, hp: number) => {
          data.hp = hp;
          at("mutator");
        },
      })
      .addAcceptor("addItem", {
        mutator: (data, item: string) => {
          data.inventory.push(item);
        },
      })
      .addControlStatePredicate("IS_ALIVE", ({ data }) => {
        at("predicate");
        return data.hp > 0;
      })
      .addActions({
        setHP: "setHP",
        addItem: "addItem",
        forge: {
          isAsync: true,
          isCancelable: true,
          action: async (item: string) => [{ type: "addItem", payload: item }],
        },
      })
      .create({ hp: 10, inventory: [] });
    return { Fraktar, interrupt };
  }

  ["condition", "mutator", "predicate"].forEach(function (place) {
    it(`should be told it was discarded when the ${place} asks`, async function () {
      const asked: Array<Promise<Attempt<any>>> = [];
      const { Fraktar, interrupt } = createInterrupted(asked);
      interrupt.from = place;

      const outcome = Fraktar.attempt.setHP(5);

      expect(asDiscarded(await asked[0]).reason).toEqual({
        code: RejectionCode.stepLocked,
        message: "A proposal is already being presented.",
      });
      // The author of the blow is told of the blow, and of it alone.
      expect(asAccepted(await outcome).attemptedAt).toBe(0);
      expect(Fraktar.representationRef.current).toEqual({
        hp: 5,
        inventory: [],
      });
      expect(Fraktar.stepId).toBe(1);
    });
  });

  it("should be told so when it asks for a composed proposal", async function () {
    const asked: Array<Promise<Attempt<any>>> = [];
    const { Fraktar, interrupt } = createInterrupted(asked);
    interrupt.from = "mutator";
    interrupt.ask = () =>
      Fraktar.attempt(({ addItem }) => [addItem("shield"), addItem("helm")]);

    Fraktar.actions.setHP(5);

    expect(asDiscarded(await asked[0]).reason.code).toBe(
      RejectionCode.stepLocked
    );
    expect(Fraktar.representationRef.current.inventory).toEqual([]);
  });

  it("should be told so at once when the action is cancelable", async function () {
    const asked: Array<Promise<Attempt<any>>> = [];
    const { Fraktar, interrupt } = createInterrupted(asked);
    interrupt.from = "mutator";
    interrupt.ask = () => Fraktar.attempt.forge("shield");

    Fraktar.actions.setHP(5);

    // Not stale later, once it resolved: refused when it was called.
    expect(asDiscarded(await asked[0]).reason.code).toBe(
      RejectionCode.stepLocked
    );
    expect(Fraktar.representationRef.current.inventory).toEqual([]);
  });
});

describe("an action which is called as something every function has", function () {
  /**
   * A hero whose actions bear the names a function already answers to.
   */
  function createNamesake() {
    return createContainer<{ log: string[] }>()
      .addAcceptor("write", {
        mutator: (data, line: string) => {
          data.log.push(line);
        },
      })
      .addActions({
        name: (who: string) => [{ type: "write", payload: `name ${who}` }],
        length: (size: number) => [
          { type: "write", payload: `length ${size}` },
        ],
        call: (who: string) => [{ type: "write", payload: `call ${who}` }],
        apply: (what: string) => [{ type: "write", payload: `apply ${what}` }],
        bind: (what: string) => [{ type: "write", payload: `bind ${what}` }],
      })
      .create({ log: [] });
  }

  it("should be attempted when it is called name", async function () {
    const Fraktar = createNamesake();

    const outcome = await Fraktar.attempt.name("Elwing");

    expect(asAccepted(outcome).accepted).toEqual([
      { type: "write", payload: "name Elwing" },
    ]);
  });

  it("should be attempted when it is called length", async function () {
    const Fraktar = createNamesake();

    const outcome = await Fraktar.attempt.length(3);

    expect(asAccepted(outcome).accepted).toEqual([
      { type: "write", payload: "length 3" },
    ]);
  });

  it("should be attempted when it is called call", async function () {
    const Fraktar = createNamesake();

    const outcome = await Fraktar.attempt.call("Elwing");

    expect(asAccepted(outcome).accepted).toEqual([
      { type: "write", payload: "call Elwing" },
    ]);
  });

  it("should be attempted when it is called apply", async function () {
    const Fraktar = createNamesake();

    const outcome = await Fraktar.attempt.apply("a balm");

    expect(asAccepted(outcome).accepted).toEqual([
      { type: "write", payload: "apply a balm" },
    ]);
  });

  it("should be attempted when it is called bind", async function () {
    const Fraktar = createNamesake();

    const outcome = await Fraktar.attempt.bind("a wound");

    expect(asAccepted(outcome).accepted).toEqual([
      { type: "write", payload: "bind a wound" },
    ]);
  });

  it("should leave a composed proposal attempted as it was", async function () {
    const Fraktar = createNamesake();

    const outcome = await Fraktar.attempt(({ name, bind }) => [
      name("Elwing"),
      bind("a wound"),
    ]);

    expect(asAccepted(outcome).accepted.length).toBe(2);
    expect(Fraktar.representationRef.current.log).toEqual([
      "name Elwing",
      "bind a wound",
    ]);
  });

  it("should be listed among the actions which can be attempted, and nothing else", function () {
    const Fraktar = createNamesake();

    // A function keeps its own name and length where it had them.
    expect(Object.keys(Fraktar.attempt).sort()).toEqual(
      Object.keys(Fraktar.actions).sort()
    );
  });

  it("should be attempted when it is called prototype, arguments or caller", async function () {
    // 1.7 took them: the container is created, the actions are called.
    const Fraktar = createContainer<{ log: string[] }>()
      .addAcceptor("write", {
        mutator: (data, line: string) => {
          data.log.push(line);
        },
      })
      .addActions({
        prototype: () => [{ type: "write", payload: "prototype" }],
        arguments: () => [{ type: "write", payload: "arguments" }],
        caller: () => [{ type: "write", payload: "caller" }],
      })
      .create({ log: [] });

    Fraktar.actions.prototype();
    const outcomes = [
      await Fraktar.attempt.prototype(),
      await Fraktar.attempt.arguments(),
      await Fraktar.attempt.caller(),
    ];

    expect(outcomes.map((outcome) => outcome.status)).toEqual([
      "accepted",
      "accepted",
      "accepted",
    ]);
    expect(Fraktar.representationRef.current.log).toEqual([
      "prototype",
      "prototype",
      "arguments",
      "caller",
    ]);
    expect(Object.keys(Fraktar.attempt).sort()).toEqual([
      "arguments",
      "caller",
      "prototype",
    ]);
  });

  describe("when one is called then", function () {
    function createPromised() {
      return createContainer<{ log: string[] }>()
        .addAcceptor("write", {
          mutator: (data, line: string) => {
            data.log.push(line);
          },
        })
        .addActions({
          write: "write",
          then: () => [{ type: "write", payload: "then" }],
        })
        .create({ log: [] });
    }

    it("should not be on attempt, which would be taken for a promise", async function () {
      const Fraktar = createPromised();

      // @ts-expect-error not on attempt
      expect(Fraktar.attempt.then).toBeUndefined();
      expect(Object.keys(Fraktar.attempt)).toEqual(["write"]);
      // Handed back by an async function, attempt is not awaited as a promise:
      // the action is not called, and the function resolves.
      expect(await (async () => Fraktar.attempt)()).toBe(Fraktar.attempt);
      expect(Fraktar.representationRef.current.log).toEqual([]);
    });

    it("should be attempted through a composer", async function () {
      const Fraktar = createPromised();

      const outcome = await Fraktar.attempt(({ then }) => [then()]);

      expect(asAccepted(outcome).accepted).toEqual([
        { type: "write", payload: "then" },
      ]);
    });

    it("should stay on actions, as in 1.7", function () {
      const Fraktar = createPromised();

      Fraktar.actions.then();

      expect(Fraktar.representationRef.current.log).toEqual(["then"]);
    });
  });
});

describe("an action given to the factory once a container was created", function () {
  it("should be attempted as the container calls it: the one it was created with", async function () {
    const factory = createContainer<{ log: string[] }>()
      .addAcceptor("write", {
        mutator: (data, line: string) => {
          data.log.push(line);
        },
      })
      .addActions({ shout: () => [{ type: "write", payload: "old shout" }] });
    const Fraktar = factory.create({ log: [] });
    // The factory is one object: what it is given later is given to it.
    factory.addActions({
      shout: () => [{ type: "write", payload: "new shout" }],
      whisper: () => [{ type: "write", payload: "whisper" }],
    });

    Fraktar.actions.shout();
    await Fraktar.attempt.shout();

    expect(Fraktar.representationRef.current.log).toEqual([
      "old shout",
      "old shout",
    ]);
    expect(Object.keys(Fraktar.attempt)).toEqual(Object.keys(Fraktar.actions));
  });
});

describe("an autorun which asks what becomes of an action", function () {
  /**
   * A hero somebody watches, and who is given a sword each time his health
   * is seen to change. `ask` is how the sword is asked for.
   */
  async function watch(
    ask: (Fraktar: ReturnType<typeof createWatched>) => Promise<Attempt<any>>
  ) {
    const Fraktar = createWatched();
    const asked: Array<Promise<Attempt<any>>> = [];
    let runs = 0;
    // It gives up by itself far beyond what it should ever run.
    const dispose = autorun(() => {
      Fraktar.representationRef.current.hp;
      if (++runs > 1 && runs < 60) {
        asked.push(ask(Fraktar));
      }
    });

    Fraktar.actions.setHP(5);
    await Promise.all(asked);
    dispose();
    return { Fraktar, asked };
  }

  function createWatched() {
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
      .addStepReaction({ runOnInit: false, do: () => {} })
      .create({ hp: 10, inventory: [] });
  }

  it("should not run again for what the attempt reads", async function () {
    const { Fraktar, asked } = await watch((hero) =>
      hero.attempt.addItem("sword")
    );

    // Once: the health changed once.
    expect(asked.length).toBe(1);
    expect(Fraktar.representationRef.current.inventory).toEqual(["sword"]);
  });

  it("should not run again for what a composed attempt reads", async function () {
    const { asked } = await watch((hero) =>
      hero.attempt(({ addItem }) => [addItem("sword")])
    );

    expect(asked.length).toBe(1);
  });
});

describe("the author of an action sent while the hero is put on another state", function () {
  it("should be told it was discarded, the container being locked", async function () {
    const Fraktar = createContainer<Model>()
      .addAcceptor("addItem", {
        mutator: (data, item: string) => {
          data.inventory.push(item);
        },
      })
      .addActions({ addItem: "addItem" })
      .create({ hp: 10, inventory: [] });
    const asked: Array<Promise<Attempt<any>>> = [];
    const dispose = observe(Fraktar.representationRef.current, "hp", () => {
      asked.push(Fraktar.attempt.addItem("shield"));
    });

    Fraktar.reset({ hp: 3, inventory: [] });
    dispose();

    expect(asDiscarded(await asked[0]).reason).toEqual({
      code: RejectionCode.stepLocked,
      message: "The container is being rolled back or reset.",
    });
    expect(Fraktar.representationRef.current.inventory).toEqual([]);
  });
});
