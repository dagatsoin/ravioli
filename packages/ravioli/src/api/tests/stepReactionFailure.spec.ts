import { createContainer, RejectionCode } from "../..";

beforeEach(function () {
  jest.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(function () {
  jest.restoreAllMocks();
});

describe("a reaction which throws", function () {
  function createFraktar() {
    return createContainer<{ hp: number }>()
      .addAcceptor("setHP", {
        mutator: (data, hp: number) => {
          data.hp = hp;
        },
      })
      .addActions({ setHP: "setHP" })
      .addStepReaction({
        runOnInit: false,
        when: ({ data }) => data.hp === 1,
        do: () => {
          throw new Error("boom");
        },
      })
      .create({ hp: 10 });
  }

  it("should not stop the container from taking the next step", function () {
    const Fraktar = createFraktar();

    Fraktar.actions.setHP(1);
    expect(Fraktar.representationRef.current.hp).toBe(1);

    // Used to be swallowed by the running reactions guard, for good.
    Fraktar.actions.setHP(7);
    expect(Fraktar.representationRef.current.hp).toBe(7);
    expect(Fraktar.stepId).toBe(2);
  });

  it("should not stop a rollback nor a reset", function () {
    const Fraktar = createFraktar();

    Fraktar.actions.setHP(1);
    Fraktar.reset({ hp: 10 });

    expect(Fraktar.representationRef.current.hp).toBe(10);
    expect(Fraktar.stepId).toBe(0);
  });

  it("should report the step as not settled", function () {
    const Fraktar = createFraktar();

    Fraktar.actions.setHP(1);

    const attempt = Fraktar.lastAttempt;
    expect(attempt?.status).toBe("accepted");
    if (attempt?.status !== "accepted") {
      throw new Error("unreachable");
    }
    // The step itself stands, its consequences do not.
    expect(attempt.accepted.length).toBe(1);
    expect(attempt.settled).toBe(false);
    expect(attempt.reason?.code).toBe(RejectionCode.reactionThrew);
    expect(attempt.reason?.message).toBe("boom");
  });

  it("should leave a step whose reactions ran settled", function () {
    const Fraktar = createFraktar();

    Fraktar.actions.setHP(7);

    const attempt = Fraktar.lastAttempt;
    if (attempt?.status !== "accepted") {
      throw new Error("unreachable");
    }
    expect(attempt.settled).toBe(true);
    expect(attempt.reason).toBeUndefined();
  });
});

describe("a runaway cascade", function () {
  function createLock() {
    return createContainer<{ status: string; failures: number }>()
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
        when: ({ data }) => data.failures >= 3,
        do: ({ actions }) => actions.lock(),
      })
      .create({ status: "OPEN", failures: 0 });
  }

  it("should be cut instead of eating the stack", function () {
    const gate = createLock();

    expect(() => {
      gate.actions.fail();
      gate.actions.fail();
      gate.actions.fail();
    }).not.toThrow();

    // Used to reach 698 and blow the stack.
    expect(gate.stepId).toBeLessThan(60);
    expect(gate.representationRef.current.status).toBe("LOCKED");
  });

  it("should report the step as not settled", function () {
    const gate = createLock();

    gate.actions.fail();
    gate.actions.fail();
    gate.actions.fail();

    const attempt = gate.lastAttempt;
    if (attempt?.status !== "accepted") {
      throw new Error("unreachable");
    }
    expect(attempt.settled).toBe(false);
    expect(attempt.reason?.code).toBe(RejectionCode.reactionsDidNotSettle);
    expect(attempt.reason?.message).toMatch(/did not settle after 50 steps/);
  });

  it("should leave the container usable", function () {
    const gate = createLock();

    gate.actions.fail();
    gate.actions.fail();
    gate.actions.fail();

    const stepId = gate.stepId;
    gate.reset({ status: "OPEN", failures: 0 });

    expect(gate.representationRef.current.failures).toBe(0);
    expect(gate.stepId).toBe(0);
    expect(stepId).toBeGreaterThan(0);
  });
});

describe("a cascade which settles", function () {
  it("should not accumulate across actions", function () {
    let heals = 0;
    const Fraktar = createContainer<{ hp: number }>()
      .addAcceptor("setHP", {
        mutator: (data, hp: number) => {
          data.hp = hp;
        },
      })
      .addAcceptor("incHP", {
        condition: (data) => data.hp < 5,
        mutator: (data) => {
          data.hp = data.hp + 1;
        },
      })
      .addActions({ setHP: "setHP", incHP: "incHP" })
      .addStepReaction({
        debugName: "auto heal",
        runOnInit: false,
        when: ({ data }) => data.hp < 5,
        do: ({ actions }) => {
          heals++;
          actions.incHP();
        },
      })
      .create({ hp: 5 });

    // Each round cascades five steps, then settles. Twenty rounds is a hundred
    // reaction fed steps, none of them consecutive past the bound.
    for (let round = 0; round < 20; round++) {
      Fraktar.actions.setHP(0);
      expect(Fraktar.representationRef.current.hp).toBe(5);
    }

    expect(heals).toBe(20 * 5);
    const attempt = Fraktar.lastAttempt;
    if (attempt?.status !== "accepted") {
      throw new Error("unreachable");
    }
    expect(attempt.settled).toBe(true);
  });
});
