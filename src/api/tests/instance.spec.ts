import { createContainer } from "..";

describe("complete use case", function () {
  const container = createContainer<{ hp: number }>()
    .addAcceptor("addHP", {
      mutator: (model, { hp }: { hp: number }) => (model.hp += hp),
    })
    .addControlStatePredicate("IS_ALIVE", ({ model }) => model.hp > 0)
    .addControlStatePredicate("IS_DEAD", ({ model }) => model.hp <= 0)
    .addActions({
      hit() {
        return [
          {
            type: "addHP",
            payload: {
              hp: -1,
            },
          },
        ];
      },
      heal: {
        isAllowed: (context) => context.controlStates[0] === "IS_ALIVE",
        action: () => [
          {
            type: "addHP",
            payload: {
              hp: 1,
            },
          },
        ],
      },
    })
    .addStepReaction("auto heal", {
      predicate: (args) => args.data.hp < 3,
      effect: ({ actions }) => actions.heal(),
    })
    .addTransformation(({data}) => ({ health: data.hp }))
    .create({ hp: 5 });

  it("should be alive first", function () {
    expect(container.representationRef.current.health).toBe(5);
    expect(container.controlStates).toEqual(["IS_ALIVE"]);
  });

  it("should be hit", function() {
    expect(container.stepId).toBe(0)
    container.actions.hit()
    expect(container.stepId).toBe(1)
    expect(container.representationRef.current.health).toBe(4)
  })

  it("should be healed", function() {
    expect(container.stepId).toBe(1)
    container.actions.heal()
    expect(container.stepId).toBe(2)
    expect(container.representationRef.current.health).toBe(5)
  })

  it("should compose actions", function() {
    expect(container.stepId).toBe(2)
    container.compose(({hit}) => [hit(), hit()]) // double hit
    expect(container.stepId).toBe(3)
    expect(container.representationRef.current.health).toBe(3)
  })
  
  it("should be auto healed", function() {
    expect(container.stepId).toBe(3)
    container.actions.hit()
    expect(container.stepId).toBe(5) // increment of 2: hit step + auto heal step
    expect(container.representationRef.current.health).toBe(3)
  })


  it("should be dead", function () {
    container.compose(({hit}) => [hit(), hit(), hit(), hit(), hit(), hit()]) // killer combo
    expect(container.controlStates).toEqual(["IS_DEAD"]);
  });

  it("can't be healed anymore because it is dead", function () {
    container.actions.heal();
    expect(container.controlStates).toEqual(["IS_DEAD"]);
  });
});
