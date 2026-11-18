import {
  clearRegistry,
  createContainerFromJSON,
  getAcceptor,
  getAction,
  getControlStatePredicate,
  getStepReaction,
  registerAcceptor,
  registerAction,
  registerControlStatePredicate,
  registerStepReaction,
} from "../..";

type Model = { hp: number };

/**
 * What a game registers once, through the entry point of the package.
 */
function registerTheBasics() {
  registerAcceptor("addHP", {
    mutator: (data: Model, hp: number) => {
      data.hp += hp;
    },
  });
  registerControlStatePredicate(
    "isAlive",
    ({ data }: { data: Model }) => data.hp > 0
  );
  registerAction("hit", (hp: number) => [{ type: "addHP", payload: -hp }]);
  registerAction("heal", (hp: number) => [{ type: "addHP", payload: hp }]);
  registerStepReaction("autoHeal", {
    runOnInit: false,
    when: ({ data }: { data: Model }) => data.hp < 3,
    do: ({ actions }: { actions: any }) => actions.heal(1),
  });
}

afterEach(function () {
  clearRegistry();
});

describe("the package entry point", function () {
  it("should build a hero from a JSON configuration", function () {
    registerTheBasics();

    const Fraktar: any = createContainerFromJSON<Model>({
      acceptors: { addHP: "addHP" },
      controlStatePredicates: { IS_ALIVE: "isAlive" },
      actions: { hit: "hit", heal: "heal" },
      stepReactions: ["autoHeal"],
    }).create({ hp: 5 });

    Fraktar.actions.hit(3);

    // Hit to 2, then healed back to 3.
    expect(Fraktar.representationRef.current.hp).toBe(3);
    expect(Fraktar.controlStates.slice()).toEqual(["IS_ALIVE"]);
  });

  it("should let a component be built from the ones which are registered", function () {
    registerTheBasics();
    // A tougher game, made of the same bricks read back from the registry.
    const addHP = getAcceptor("addHP");
    registerAcceptor("addHPTwice", {
      mutator: (data: Model, hp: number) => {
        addHP.mutator(data, hp);
        addHP.mutator(data, hp);
      },
    });
    const isAlive: any = getControlStatePredicate("isAlive");
    registerControlStatePredicate(
      "isDead",
      (args: { data: Model }) => !isAlive(args)
    );
    const hit: any = getAction("hit");
    registerAction("crit", (hp: number) => hit(hp * 2));
    registerStepReaction("autoHealOnce", {
      ...getStepReaction("autoHeal"),
      once: true,
    });

    const Fraktar: any = createContainerFromJSON<Model>({
      acceptors: { addHP: "addHPTwice" },
      controlStatePredicates: { IS_DEAD: "isDead" },
      actions: { crit: "crit", heal: "heal" },
      stepReactions: ["autoHealOnce"],
    }).create({ hp: 10 });

    Fraktar.actions.crit(2);

    // Hit by 4, twice: 2. Healed by 1, twice: 4. And once only.
    expect(Fraktar.representationRef.current.hp).toBe(4);
    expect(Fraktar.controlStates.slice()).toEqual([]);

    Fraktar.actions.crit(1);
    expect(Fraktar.representationRef.current.hp).toBe(0);
    expect(Fraktar.controlStates.slice()).toEqual(["IS_DEAD"]);
  });

  it("should refuse a configuration once the registry is cleared", function () {
    registerTheBasics();

    clearRegistry();

    expect(() =>
      createContainerFromJSON<Model>({ acceptors: { addHP: "addHP" } })
    ).toThrowError(/Acceptor 'addHP' not found in registry/);
  });
});
