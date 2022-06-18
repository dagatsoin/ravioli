import { createContainer } from "../..";

test("Give a ref to the model in case of no representation", function () {
  const container = createContainer<{ hp: number }>().create({ hp: 3 });
  expect(container.representationRef.current.hp).toBe(3);
});

it("should have a representation", function () {
  const container = createContainer<{ hp: number }>()
    .addTransformation((model) => ({ health: model.hp }))
    .create({ hp: 3 });
  expect(container.representationRef.current).toBeDefined();
});

test("control states", function () {
  const container = createContainer<{ hp: number }>()
    .addControlStatePredicate("IS_ALIVE", ({ model }) => model.hp > 0)
    .addControlStatePredicate("IS_DEAD", ({ model }) => model.hp <= 0)
    .create({ hp: 3 });
  expect(container.controlStates).toContain("IS_ALIVE");
  expect(container.controlStates).not.toContain("IS_DEAD");
});

it("should be instantied", function(){
  const User = createContainer<{
    name: string;
  }>()
    .addAcceptor("setName", {
      mutator(model, { name }: { name: string }) {
        model.name = name;
      },
    })
    .addActions({
      rename: "setName",
    })
  
  const player0 = User.create({ name: "Fraktos" });
  const player1 = User.create({ name: "Glados" });

  player0.actions.rename({ name: "Fraktar" });
  
  expect(player0.representationRef.current.name).toBe("Fraktar")
  expect(player1.representationRef.current.name).toBe("Glados")
})

describe("complete use case", function () {
  const container = createContainer<{ hp: number }>()
    .addAcceptor("setHP", {
      mutator: (model, { hp }: { hp: number }) => (model.hp += hp),
    })
    .addControlStatePredicate("IS_ALIVE", ({ model }) => model.hp > 0)
    .addControlStatePredicate("IS_DEAD", ({ model }) => model.hp <= 0)
    .addActions({
      hit() {
        return [
          {
            type: "setHP",
            payload: {
              hp: -30,
            },
          },
        ];
      },
      heal: {
        isAllowed: (context) => context.controlStates[0] === "IS_ALIVE",
        action: () => [
          {
            type: "setHP",
            payload: {
              hp: 6,
            },
          },
        ],
      },
    })
    .addStepReaction("auto heal", {
      predicate: (args) => args.data.hp < 2,
      effect: ({ actions }) => actions.heal(),
    })
    .addTransformation((model) => ({ health: model.hp }))
    .create({ hp: 25 });

  it("should be alive first", function () {
    expect(container.representationRef.current.health).toBe(25);
    expect(container.controlStates).toEqual(["IS_ALIVE"]);
  });

  it("should be dead", function () {
    container.actions.hit();
    expect(container.controlStates).toEqual(["IS_DEAD"]);
  });

  it("can't be healed anymore because it is dead", function () {
    container.actions.heal();
    expect(container.controlStates).toEqual(["IS_DEAD"]);
  });
});
