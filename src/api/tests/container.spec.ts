import { createContainer } from "../..";


test("control states", function () {
  const container = createContainer<{ hp: number }>()
    .addControlStatePredicate("IS_ALIVE", ({ model }) => model.hp > 0)
    .addControlStatePredicate("IS_DEAD", ({ model }) => model.hp <= 0)
    .create({ hp: 3 });
  expect(container.controlStates).toContain("IS_ALIVE");
  expect(container.controlStates).not.toContain("IS_DEAD");
});

test("instance isolation", function(){
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