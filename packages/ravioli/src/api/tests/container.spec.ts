import { createContainer } from "../..";


test("control states", function () {
  const container = createContainer<{ hp: number }>()
    .addControlStatePredicate("IS_ALIVE", ({ data }) => data.hp > 0)
    .addControlStatePredicate("IS_DEAD", ({ data }) => data.hp <= 0)
    .create({ hp: 3 });
  expect(container.controlStates).toContain("IS_ALIVE");
  expect(container.controlStates).not.toContain("IS_DEAD");
});

test("instance isolation", function(){
  const User = createContainer<{
    name: string;
  }>()
    .addAcceptor("setName", {
      mutator(data, { name }: { name: string }) {
        data.name = name;
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

describe("a container declaration", function () {
  it("should refuse a second acceptor bound to the same mutation", function () {
    const Hero = createContainer<{ hp: number }>().addAcceptor("setHP", {
      mutator: (data, hp: number) => {
        data.hp = hp;
      },
    });

    expect(() =>
      Hero.addAcceptor("setHP", {
        mutator: (data, hp: number) => {
          data.hp = hp * 2;
        },
      })
    ).toThrowError(/already an acceptor bound to setHP/);
  });

  it("should refuse a second control state with the same name", function () {
    const Hero = createContainer<{ hp: number }>().addControlStatePredicate(
      "IS_ALIVE",
      ({ data }) => data.hp > 0
    );

    expect(() =>
      Hero.addControlStatePredicate("IS_ALIVE", ({ data }) => data.hp > 10)
    ).toThrowError(/already a control state called IS_ALIVE/);
  });

  it("should throw when Mutations is read: the property only carries a type", function () {
    const Hero = createContainer<{ hp: number }>();

    expect(() => Hero.Mutations).toThrowError(/typing purpose only/);
  });
});
