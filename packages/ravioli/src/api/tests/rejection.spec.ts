import { autorun } from "mobx";
import { Attempt, RejectionCode, createContainer } from "../..";

/**
 * Narrowing helpers. They fail the test with a readable message instead of
 * letting the assertion crash on an undefined field.
 */
function asAccepted<M>(attempt: Attempt<M> | undefined) {
  if (attempt?.status !== "accepted") {
    throw new Error(`Expected an accepted attempt, got ${attempt?.status}`);
  }
  return attempt;
}

function asRejected<M>(attempt: Attempt<M> | undefined) {
  if (attempt?.status !== "rejected") {
    throw new Error(`Expected a rejected attempt, got ${attempt?.status}`);
  }
  return attempt;
}

function asDiscarded<M>(attempt: Attempt<M> | undefined) {
  if (attempt?.status !== "discarded") {
    throw new Error(`Expected a discarded attempt, got ${attempt?.status}`);
  }
  return attempt;
}

beforeEach(function () {
  jest.spyOn(console, "warn").mockImplementation(() => {});
  jest.spyOn(console, "info").mockImplementation(() => {});
});

afterEach(function () {
  jest.restoreAllMocks();
});

function createHero(initialHP: number = 10) {
  return createContainer<{ hp: number }>()
    .addAcceptor("setHP", {
      condition: (data, { hp }: { hp: number }) => data.hp > 0 && hp >= 0,
      mutator: (data, { hp }: { hp: number }) => {
        data.hp = hp;
      },
    })
    .addAcceptor("setName", {
      mutator: (data: any, { name }: { name: string }) => {
        data.name = name;
      },
    })
    .addActions({
      setHP: "setHP",
      setName: "setName",
      renameAndSetHP(payload: { name: string; hp: number }) {
        return [
          { type: "setName", payload: { name: payload.name } },
          { type: "setHP", payload: { hp: payload.hp } },
        ];
      },
    })
    .create({ hp: initialHP });
}

describe("last attempt", function () {
  it("should be undefined until the first attempt", function () {
    expect(createHero().lastAttempt).toBeUndefined();
  });

  it("should report an accepted proposal", function () {
    const hero = createHero();

    hero.actions.setHP({ hp: 5 });

    const attempt = asAccepted(hero.lastAttempt);
    expect(attempt.accepted).toEqual([{ type: "setHP", payload: { hp: 5 } }]);
    expect(attempt.rejected).toEqual([]);
    // The attempt is stamped with the step it was presented against,
    // not with the step it produced.
    expect(attempt.attemptedAt).toBe(0);
    expect(hero.stepId).toBe(1);
  });

  it("should be overwritten by the next attempt", function () {
    const hero = createHero();

    hero.actions.setHP({ hp: -1 });
    asRejected(hero.lastAttempt);

    hero.actions.setHP({ hp: 5 });
    expect(asAccepted(hero.lastAttempt).rejected).toEqual([]);
  });
});

describe("rejected proposal", function () {
  it("should not start a step nor run a reaction", function () {
    let ranReactionsNb = 0;
    const container = createContainer<{ hp: number }>()
      .addAcceptor("setHP", {
        condition: (data) => data.hp > 0,
        mutator: (data, hp: number) => {
          data.hp = hp;
        },
      })
      .addActions({ setHP: "setHP" })
      .addStepReaction({ runOnInit: false, do: () => ranReactionsNb++ })
      .create({ hp: 0 });

    container.actions.setHP(3);

    expect(container.stepId).toBe(0);
    expect(ranReactionsNb).toBe(0);
    // ... but the refusal is not lost anymore.
    expect(asRejected(container.lastAttempt).rejected.length).toBe(1);
  });

  it("should report every refused mutation with the default reason", function () {
    const hero = createHero(0);

    hero.actions.setHP({ hp: 5 });

    const attempt = asRejected(hero.lastAttempt);
    expect(attempt.attemptedAt).toBe(0);
    expect(attempt.rejected).toEqual([
      {
        mutation: { type: "setHP", payload: { hp: 5 } },
        reason: { code: RejectionCode.conditionFailed },
      },
    ]);
  });

  it("should report the reason returned by the condition", function () {
    const hero = createContainer<{ hp: number }>()
      .addAcceptor("setHP", {
        condition: (data, hp: number) =>
          hp >= 0 || { code: "NEGATIVE_HP", message: "hp cannot be negative", meta: { hp } },
        mutator: (data, hp: number) => {
          data.hp = hp;
        },
      })
      .addActions({ setHP: "setHP" })
      .create({ hp: 10 });

    hero.actions.setHP(-2);

    const [rejection] = asRejected(hero.lastAttempt).rejected;
    expect(rejection.reason).toEqual({
      code: "NEGATIVE_HP",
      message: "hp cannot be negative",
      meta: { hp: -2 },
    });
    expect(hero.representationRef.current.hp).toBe(10);
  });

  it("should report a mutation which has no acceptor", function () {
    const hero = createContainer<{ hp: number }>()
      .addAcceptor("setHP", {
        mutator: (data, hp: number) => {
          data.hp = hp;
        },
      })
      .addActions({
        // Simulates a proposal coming from an untrusted source, eg. the network.
        ghost: (() => [{ type: "ghost", payload: undefined }]) as any,
      })
      .create({ hp: 10 });

    expect(() => (hero.actions as any).ghost()).not.toThrow();

    const [rejection] = asRejected(hero.lastAttempt).rejected;
    expect(rejection.reason.code).toBe(RejectionCode.unknownAcceptor);
    expect(hero.stepId).toBe(0);
  });
});

describe("partially rejected proposal", function () {
  it("should report both sides of the same attempt", function () {
    const hero = createHero();

    // setName is accepted, setHP is refused.
    hero.actions.renameAndSetHP({ name: "Fraktar", hp: -1 });

    const attempt = asAccepted(hero.lastAttempt);
    expect(attempt.accepted).toEqual([
      { type: "setName", payload: { name: "Fraktar" } },
    ]);
    expect(attempt.rejected).toEqual([
      {
        mutation: { type: "setHP", payload: { hp: -1 } },
        reason: { code: RejectionCode.conditionFailed },
      },
    ]);
    // Something was accepted: the clock ticked.
    expect(attempt.attemptedAt).toBe(0);
    expect(hero.stepId).toBe(1);
  });
});

describe("discarded proposal", function () {
  it("should report an unauthorized action", function () {
    const container = createContainer<{ hp: number }>()
      .addAcceptor("addHP", {
        mutator: (data, hp: number) => {
          data.hp += hp;
        },
      })
      .addControlStatePredicate("IS_ALIVE", ({ data }) => data.hp > 0)
      .addActions({
        heal: {
          isAllowed: ({ controlStates }) => controlStates.includes("IS_ALIVE"),
          action: (hp: number) => [{ type: "addHP", payload: hp }],
        },
      })
      .create({ hp: 0 });

    container.actions.heal(5);

    const attempt = asDiscarded(container.lastAttempt);
    expect(attempt.reason.code).toBe(RejectionCode.unauthorized);
    expect(attempt.reason.meta).toEqual({ action: "heal", controlStates: [] });
    expect(attempt.attemptedAt).toBe(0);
    expect(container.stepId).toBe(0);
  });

  it("should report a stale proposal", async function () {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });

    const container = createContainer<{ hp: number }>()
      .addAcceptor("addHP", {
        mutator: (data, hp: number) => {
          data.hp += hp;
        },
      })
      .addActions({
        hit: (hp: number) => [{ type: "addHP", payload: -hp }],
        slowHeal: {
          isAsync: true,
          isCancelable: true,
          action: async (hp: number) => {
            await gate;
            return [{ type: "addHP", payload: hp }];
          },
        },
      })
      .create({ hp: 10 });

    // The slow action captures the step 0...
    const pending = container.actions.slowHeal(5);
    // ... but the world moves on before it resolves.
    container.actions.hit(1);
    expect(container.stepId).toBe(1);

    release();
    await pending;

    const attempt = asDiscarded(container.lastAttempt);
    expect(attempt.reason.code).toBe(RejectionCode.staleProposal);
    expect(attempt.reason.meta).toEqual({ proposalStepId: 0 });
    // Stamped with the step the presentation was attempted at, not with the stale one.
    expect(attempt.attemptedAt).toBe(1);
    expect(container.representationRef.current.hp).toBe(9);
  });
});

describe("reactivity", function () {
  it("should notify observers of a refusal although no step happened", function () {
    const hero = createHero(0);
    const seen: Array<string | undefined> = [];
    const dispose = autorun(() => seen.push(hero.lastAttempt?.status));

    hero.actions.setHP({ hp: 5 });

    expect(seen).toEqual([undefined, "rejected"]);
    dispose();
  });

  it("should notify again on an identical refusal", function () {
    const hero = createHero(0);
    let runs = 0;
    const dispose = autorun(() => {
      hero.lastAttempt;
      runs++;
    });

    hero.actions.setHP({ hp: 5 });
    hero.actions.setHP({ hp: 5 });

    // Initial run, then one per attempt: each attempt is a new value.
    expect(runs).toBe(3);
    dispose();
  });

  it("should land in the same transaction as the step", function () {
    const hero = createHero();
    let runs = 0;
    const dispose = autorun(() => {
      hero.stepId;
      hero.lastAttempt;
      runs++;
    });

    hero.actions.setHP({ hp: 5 });

    // One notification, not one per observable.
    expect(runs).toBe(2);
    dispose();
  });
});
