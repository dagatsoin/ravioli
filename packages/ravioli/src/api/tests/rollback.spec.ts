import { autorun, toJS } from "mobx";
import { Delta, Step, createContainer } from "../..";

type Model = { hp: number; inventory: string[] };
type Mutations =
  | { type: "setHP"; payload: number }
  | { type: "addItem"; payload: string };
type ControlStates = "IS_ALIVE" | "IS_DEAD" | "JUST_DIED";

/**
 * A step reaction which snapshots the walked path.
 * A delta holds live references, so it is copied, proposal tag included.
 */
function recorder<M, CS>(steps: Array<Step<Model, M, CS>>) {
  return {
    debugName: "record the walked path",
    runOnInit: false,
    do({ data, delta }: { data: Model; delta: Delta<M, CS> }) {
      steps.push({
        data: toJS(data),
        delta: {
          acceptedMutations: delta.acceptedMutations.slice(),
          proposal: Object.assign(delta.proposal.slice(), {
            stepId: delta.proposal.stepId,
          }),
          controlStates: delta.controlStates.slice(),
          previousControlStates: delta.previousControlStates.slice(),
        },
      });
    },
  };
}

/**
 * A hero which can die. JUST_DIED can not be answered from the model alone:
 * it needs to know where the hero comes from.
 */
function createFraktar(steps: Array<Step<Model, Mutations, ControlStates>>) {
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
    .addStepReaction(recorder(steps))
    .create({ hp: 10, inventory: [] });
}

describe("walking back a path", function () {
  it("should restore a control state which depends on the past", function () {
    const steps: Array<Step<Model, Mutations, ControlStates>> = [];
    const Fraktar = createFraktar(steps);

    Fraktar.actions.setHP(0);
    expect(Fraktar.controlStates).toEqual(["IS_DEAD", "JUST_DIED"]);

    // One more step: the hero is dead, but not freshly dead anymore.
    Fraktar.actions.addItem("shroud");
    expect(Fraktar.controlStates).toEqual(["IS_DEAD"]);

    Fraktar.rollback(steps[0]);

    // create() would give IS_DEAD only: a fresh container has no past.
    expect(Fraktar.controlStates).toEqual(["IS_DEAD", "JUST_DIED"]);
  });

  it("should restore the model data", function () {
    const steps: Array<Step<Model, Mutations, ControlStates>> = [];
    const Fraktar = createFraktar(steps);

    Fraktar.actions.addItem("sword");
    Fraktar.actions.addItem("shield");
    expect(Fraktar.representationRef.current.inventory).toEqual([
      "sword",
      "shield",
    ]);

    Fraktar.rollback(steps[0]);

    expect(Fraktar.representationRef.current.inventory).toEqual(["sword"]);
  });

  it("should land on the step the delta produced", function () {
    const steps: Array<Step<Model, Mutations, ControlStates>> = [];
    const Fraktar = createFraktar(steps);

    Fraktar.actions.setHP(5);
    Fraktar.actions.setHP(3);
    Fraktar.actions.setHP(1);
    expect(Fraktar.stepId).toBe(3);

    Fraktar.rollback(steps[0]);

    expect(Fraktar.stepId).toBe(1);
  });

  it("should refuse the creation step, which is a reset", function () {
    const steps: Array<Step<Model, Mutations, ControlStates>> = [];
    const Fraktar = createFraktar(steps);
    Fraktar.actions.setHP(5);

    // No action built it, so nothing tagged it.
    const creation: Step<Model, Mutations, ControlStates> = {
      ...steps[0],
      delta: { ...steps[0].delta, proposal: [] },
    };

    expect(() => Fraktar.rollback(creation)).toThrowError(/reset/);
  });
});

describe("going back to creation", function () {
  it("should restore the state, the control states and the step", function () {
    const steps: Array<Step<Model, Mutations, ControlStates>> = [];
    const Fraktar = createFraktar(steps);

    Fraktar.actions.setHP(0);
    Fraktar.actions.addItem("shroud");
    expect(Fraktar.controlStates).toEqual(["IS_DEAD"]);
    expect(Fraktar.stepId).toBe(2);

    Fraktar.reset({ hp: 10, inventory: [] });

    expect(Fraktar.representationRef.current).toEqual({
      hp: 10,
      inventory: [],
    });
    expect(Fraktar.controlStates).toEqual(["IS_ALIVE"]);
    expect(Fraktar.stepId).toBe(0);
  });

  it("should compute the control states without a past", function () {
    const steps: Array<Step<Model, Mutations, ControlStates>> = [];
    const Fraktar = createFraktar(steps);

    // Created dead: a brand new container has never been alive, so the hero
    // just died. reset gives the same answer.
    Fraktar.reset({ hp: 0, inventory: [] });

    expect(Fraktar.controlStates).toEqual(["IS_DEAD", "JUST_DIED"]);
  });

  it("should land on the step the container was created at", function () {
    const steps: Array<Step<Model, Mutations, ControlStates>> = [];
    const Fraktar = createContainer<Model>()
      .addAcceptor("setHP", {
        mutator: (data, hp: number) => {
          data.hp = hp;
        },
      })
      .addActions({ setHP: "setHP" })
      .addStepReaction(recorder(steps))
      .create({ hp: 10, inventory: [] }, { initialStepId: 7 });

    Fraktar.actions.setHP(5);
    expect(Fraktar.stepId).toBe(8);

    Fraktar.reset({ hp: 10, inventory: [] });

    expect(Fraktar.stepId).toBe(7);
  });

  it("should replay the creation, skipping what does not run on init", function () {
    let welcomes = 0;
    let steps = 0;
    const Fraktar = createContainer<Model>()
      .addAcceptor("setHP", {
        mutator: (data, hp: number) => {
          data.hp = hp;
        },
      })
      .addActions({ setHP: "setHP" })
      .addStepReaction({ debugName: "welcome", do: () => welcomes++ })
      .addStepReaction({ runOnInit: false, do: () => steps++ })
      .create({ hp: 10, inventory: [] });

    expect(welcomes).toBe(1);
    Fraktar.actions.setHP(5);
    expect(welcomes).toBe(2);
    expect(steps).toBe(1);

    Fraktar.reset({ hp: 10, inventory: [] });

    // The creation pass ran again...
    expect(welcomes).toBe(3);
    // ... and what does not run on init stayed quiet.
    expect(steps).toBe(1);
  });

  it("should keep the observers attached", function () {
    const steps: Array<Step<Model, Mutations, ControlStates>> = [];
    const Fraktar = createFraktar(steps);
    const representation = Fraktar.representationRef.current;
    const healthBar: number[] = [];
    const dispose = autorun(() =>
      healthBar.push(Fraktar.representationRef.current.hp)
    );

    Fraktar.actions.setHP(4);
    Fraktar.reset({ hp: 10, inventory: [] });

    expect(Fraktar.representationRef.current).toBe(representation);
    expect(healthBar).toEqual([10, 4, 10]);
    dispose();
  });
});

describe("the observers", function () {
  it("should stay attached to the representation", function () {
    const steps: Array<Step<Model, Mutations, ControlStates>> = [];
    const Fraktar = createFraktar(steps);
    const representation = Fraktar.representationRef.current;
    const healthBar: number[] = [];
    const dispose = autorun(() =>
      healthBar.push(Fraktar.representationRef.current.hp)
    );

    Fraktar.actions.setHP(4);
    Fraktar.actions.setHP(1);
    Fraktar.rollback(steps[0]);

    expect(Fraktar.representationRef.current).toBe(representation);
    expect(healthBar).toEqual([10, 4, 1, 4]);
    dispose();
  });

  it("should be notified once for the whole rollback", function () {
    const steps: Array<Step<Model, Mutations, ControlStates>> = [];
    const Fraktar = createFraktar(steps);
    Fraktar.actions.setHP(4);
    Fraktar.actions.setHP(1);

    let renders = 0;
    const dispose = autorun(() => {
      Fraktar.stepId;
      Fraktar.controlStates.slice();
      Fraktar.representationRef.current.hp;
      renders++;
    });

    Fraktar.rollback(steps[0]);

    expect(renders).toBe(2);
    dispose();
  });
});

describe("the step reactions", function () {
  type SetHP = { type: "setHP"; payload: number };

  it("should replay the arrival at the step", function () {
    const steps: Array<Step<Model, SetHP, "IS_DEAD" | "JUST_DIED">> = [];
    let eulogies = 0;
    const Fraktar = createContainer<Model>()
      .addAcceptor("setHP", {
        mutator: (data, hp: number) => {
          data.hp = hp;
        },
      })
      .addControlStatePredicate("IS_DEAD", ({ data }) => data.hp <= 0)
      .addControlStatePredicate(
        "JUST_DIED",
        ({ data, previousControlStates }) =>
          data.hp <= 0 && !previousControlStates.includes("IS_DEAD")
      )
      .addActions({ setHP: "setHP" })
      .addStepReaction({
        debugName: "eulogy",
        runOnInit: false,
        when: ({ delta }) => delta.controlStates.includes("JUST_DIED"),
        do: () => eulogies++,
      })
      .addStepReaction(recorder(steps))
      .create({ hp: 10, inventory: [] });

    Fraktar.actions.setHP(0);
    expect(eulogies).toBe(1);

    Fraktar.actions.setHP(-1);
    expect(eulogies).toBe(1);

    Fraktar.rollback(steps[0]);
    expect(eulogies).toBe(2);
  });

  it("should be refused while the reactions are running", function () {
    const steps: Array<Step<Model, SetHP, never>> = [];
    jest.spyOn(console, "warn").mockImplementation(() => {});
    let stepIdDuringReaction = -1;

    const Fraktar = createContainer<Model>()
      .addAcceptor("setHP", {
        mutator: (data, hp: number) => {
          data.hp = hp;
        },
      })
      .addActions({ setHP: "setHP" })
      .addStepReaction({
        runOnInit: false,
        do: (args) => {
          recorder(steps).do(args);
          if (steps.length > 1) {
            Fraktar.rollback(steps[0]);
            stepIdDuringReaction = Fraktar.stepId;
          }
        },
      })
      .create({ hp: 10, inventory: [] });

    Fraktar.actions.setHP(5);
    Fraktar.actions.setHP(1);

    // The rollback was ignored, the model did not move under the reaction.
    expect(stepIdDuringReaction).toBe(2);
    expect(Fraktar.representationRef.current.hp).toBe(1);
    jest.restoreAllMocks();
  });
});

describe("the last attempt", function () {
  it("should be cleared, it belongs to the abandoned timeline", function () {
    const steps: Array<Step<Model, Mutations, ControlStates>> = [];
    const Fraktar = createFraktar(steps);

    Fraktar.actions.setHP(5);
    expect(Fraktar.lastAttempt).toBeDefined();

    Fraktar.rollback(steps[0]);

    expect(Fraktar.lastAttempt).toBeUndefined();
  });
});
