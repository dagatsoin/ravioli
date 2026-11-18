import { _resetGlobalState, configure, reaction } from "mobx";
import { createContainer } from "../..";

/**
 * MobX catches what an observer throws, unless it is told not to, which is
 * what it advises for tests. It does not recover from the throw by itself: it
 * is reset before each test, as its own tests do.
 */
beforeEach(function () {
  _resetGlobalState();
  configure({ disableErrorBoundaries: true });
});

afterAll(function () {
  _resetGlobalState();
});

describe("an observer which throws when it is notified of a step", function () {
  function createFraktar(letters: number[]) {
    return createContainer<{ hp: number }>()
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
      .create({ hp: 10 });
  }

  it("should throw at whoever called the action", function () {
    const Fraktar = createFraktar([]);
    reaction(
      () => Fraktar.representationRef.current.hp,
      () => {
        throw new Error("the health bar broke");
      }
    );

    expect(() => Fraktar.actions.setHP(5)).toThrowError("the health bar broke");
  });

  it("should not keep the step from being taken, reactions included", function () {
    const letters: number[] = [];
    const Fraktar = createFraktar(letters);
    reaction(
      () => Fraktar.representationRef.current.hp,
      () => {
        throw new Error("the health bar broke");
      }
    );

    expect(() => Fraktar.actions.setHP(5)).toThrow();

    expect(Fraktar.stepId).toBe(1);
    expect(letters).toEqual([5]);
  });

  it("should not leave the container closed", function () {
    const letters: number[] = [];
    const Fraktar = createFraktar(letters);
    const dispose = reaction(
      () => Fraktar.representationRef.current.hp,
      () => {
        throw new Error("the health bar broke");
      }
    );
    expect(() => Fraktar.actions.setHP(5)).toThrow();
    dispose();

    // Used to wait for ever behind a step which was never to end.
    Fraktar.actions.setHP(7);
    expect(Fraktar.stepId).toBe(2);

    Fraktar.reset({ hp: 10 });
    expect(Fraktar.stepId).toBe(0);
    expect(Fraktar.representationRef.current.hp).toBe(10);
  });
});

describe("an observer which throws when it is told a reaction failed", function () {
  it("should not leave the container closed, nor the actions which wait", function () {
    const Fraktar = createContainer<{ hp: number; inventory: string[] }>()
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
        when: ({ delta }) =>
          delta.acceptedMutations.some(({ type }) => type === "setHP"),
        do: () => {
          throw new Error("the healer is away");
        },
      })
      .create({ hp: 10, inventory: [] });
    jest.spyOn(console, "error").mockImplementation(() => {});
    // Asks for a bandage as soon as it sees the hit, during the step: the
    // bandage waits for the end of it.
    reaction(
      () => Fraktar.stepId,
      (stepId) => stepId === 1 && Fraktar.actions.addItem("bandage")
    );
    reaction(
      () => {
        const attempt = Fraktar.lastAttempt;
        return attempt?.status === "accepted" && !attempt.settled;
      },
      (hasFailed) => {
        if (hasFailed) {
          throw new Error("the log broke");
        }
      }
    );

    // Nobody is there to catch it: the pass of the reactions is not awaited.
    Fraktar.actions.setHP(5);

    expect(Fraktar.representationRef.current.inventory).toEqual(["bandage"]);
    expect(Fraktar.stepId).toBe(2);
    jest.restoreAllMocks();
  });
});

describe("an observer which throws when it is told a representation failed", function () {
  it("should not keep the actions which wait from their turn", function () {
    const Fraktar = createContainer<{ hp: number; inventory: string[] }>()
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
      .addTransformation(({ data }) => {
        if (data.hp < 0 && !data.inventory.length) {
          throw new Error("no health bar below zero without a bandage");
        }
        return { health: data.hp, bag: data.inventory.slice() };
      })
      .create({ hp: 10, inventory: [] });
    jest.spyOn(console, "error").mockImplementation(() => {});
    // The bandage is asked for during the step, and waits for the end of it.
    reaction(
      () => Fraktar.stepId,
      (stepId) => stepId === 1 && Fraktar.actions.addItem("bandage")
    );
    reaction(
      () => {
        const attempt = Fraktar.lastAttempt;
        return attempt?.status === "accepted" && !attempt.settled;
      },
      (hasFailed) => {
        if (hasFailed) {
          throw new Error("the log broke");
        }
      }
    );

    // The step is over when the representation fails, and the log with it.
    Fraktar.actions.setHP(-1);

    expect(Fraktar.representationRef.current.bag).toEqual(["bandage"]);
    expect(Fraktar.stepId).toBe(2);
    jest.restoreAllMocks();
  });
});
