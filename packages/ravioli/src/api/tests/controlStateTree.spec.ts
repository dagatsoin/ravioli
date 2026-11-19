import { createContainer } from "../..";

type Model = { hp: number; mp: number };

const ALIVE = ({ data }: { data: Model }) => data.hp > 0;
const WOUNDED = ({ data }: { data: Model }) => data.hp < 5;
const MANA = ({ data }: { data: Model }) => data.mp > 0;

/**
 * A hero with the given control states. The predicates are added in the order
 * of the keys, so a forward reference can be written on purpose.
 */
function hero(predicates: Record<string, any>, data: Model = { hp: 10, mp: 5 }) {
  let factory: any = createContainer<Model>()
    .addAcceptor("setHP", {
      mutator: (model: Model, hp: number) => {
        model.hp = hp;
      },
    })
    .addAcceptor("setMP", {
      mutator: (model: Model, mp: number) => {
        model.mp = mp;
      },
    })
    .addActions({ setHP: "setHP", setMP: "setMP" });

  Object.keys(predicates).forEach((name) => {
    factory = factory.addControlStatePredicate(name, predicates[name]);
  });

  return factory.create(data);
}

describe("3.1 regressions", function () {
  it("should activate an and when every member is active", function () {
    const Fraktar = hero(
      { ALIVE, WOUNDED, HURT: { and: ["ALIVE", "WOUNDED"] } },
      { hp: 3, mp: 5 }
    );
    expect(Fraktar.controlStates.sort()).toEqual(["ALIVE", "HURT", "WOUNDED"]);
  });

  it("should not activate an and when a member is not active", function () {
    const Fraktar = hero({ ALIVE, WOUNDED, HURT: { and: ["ALIVE", "WOUNDED"] } });
    expect(Fraktar.controlStates.sort()).toEqual(["ALIVE"]);
  });

  it("should activate an or when a member is active", function () {
    const Fraktar = hero({ ALIVE, WOUNDED, ANY: { or: ["ALIVE", "WOUNDED"] } });
    expect(Fraktar.controlStates.sort()).toEqual(["ALIVE", "ANY"]);
  });

  it("should not activate an or when no member is active", function () {
    const Fraktar = hero(
      { ALIVE, WOUNDED, ANY: { or: ["ALIVE", "MANA"] }, MANA },
      { hp: 0, mp: 0 }
    );
    expect(Fraktar.controlStates.sort()).toEqual(["WOUNDED"]);
  });

  it("should not activate a not over an active control state", function () {
    const Fraktar = hero({ ALIVE, DEAD: { not: "ALIVE" } });
    expect(Fraktar.controlStates.sort()).toEqual(["ALIVE"]);
  });

  it("should activate a not over an inactive control state", function () {
    const Fraktar = hero({ ALIVE, DEAD: { not: "ALIVE" } }, { hp: 0, mp: 5 });
    expect(Fraktar.controlStates.sort()).toEqual(["DEAD"]);
  });

  it("should follow a bare name without overflowing", function () {
    const Fraktar = hero({ ALIVE, KICKING: "ALIVE" });
    expect(Fraktar.controlStates.sort()).toEqual(["ALIVE", "KICKING"]);
  });

  it("should refuse an unknown key and name it", function () {
    expect(() => hero({ ALIVE, ANY: { ors: ["ALIVE"] } })).toThrowError(/ors/);
  });
});

describe("3.2 function predicates", function () {
  it("should activate on true and stay quiet on false", function () {
    const Fraktar = hero({ YES: () => true, NO: () => false });
    expect(Fraktar.controlStates.sort()).toEqual(["YES"]);
  });

  it("should read the data", function () {
    const Fraktar = hero({ ALIVE }, { hp: 0, mp: 5 });
    expect(Fraktar.controlStates.sort()).toEqual([]);
  });

  it("should read the previous control states", function () {
    const Fraktar = hero({
      ALIVE,
      WAS_ALIVE: ({ previousControlStates }: any) =>
        previousControlStates.includes("ALIVE"),
    });

    expect(Fraktar.controlStates.sort()).toEqual(["ALIVE"]);
    Fraktar.actions.setHP(4);
    expect(Fraktar.controlStates.sort()).toEqual(["ALIVE", "WAS_ALIVE"]);
  });

  it("should read the accepted mutations", function () {
    const Fraktar = hero({
      HEALED: ({ acceptedMutations }: any) =>
        acceptedMutations.some((mutation: any) => mutation.type === "setHP"),
    });

    expect(Fraktar.controlStates.sort()).toEqual([]);
    Fraktar.actions.setHP(4);
    expect(Fraktar.controlStates.sort()).toEqual(["HEALED"]);
  });

  it("should refuse a non boolean and name the control state", function () {
    expect(() => hero({ ALIVE: () => undefined })).toThrowError(
      /control state ALIVE returned undefined/
    );
  });

  it("should name the control state when the predicate throws", function () {
    expect(() =>
      hero({
        ALIVE: () => {
          throw new Error("no hp field");
        },
      })
    ).toThrowError(/control state ALIVE threw: no hp field/);
  });

  it("should name the control state when what the predicate throws is not an error", function () {
    const CURSED = () => {
      throw "cursed";
    };

    expect(() => hero({ CURSED })).toThrowError(
      /predicate of the control state CURSED threw: cursed/
    );
  });
});

describe("3.3 name leaf", function () {
  it("should resolve a function predicate", function () {
    const Fraktar = hero({ ALIVE, KICKING: "ALIVE" });
    expect(Fraktar.controlStates.sort()).toEqual(["ALIVE", "KICKING"]);
  });

  it("should resolve a declarative predicate, so references chain", function () {
    const Fraktar = hero({
      ALIVE,
      DEAD: { not: "ALIVE" },
      GHOST: "DEAD",
    }, { hp: 0, mp: 5 });
    expect(Fraktar.controlStates.sort()).toEqual(["DEAD", "GHOST"]);
  });

  it("should resolve a name declared after it", function () {
    const Fraktar = hero({ KICKING: "ALIVE", ALIVE });
    expect(Fraktar.controlStates.sort()).toEqual(["ALIVE", "KICKING"]);
  });

  it("should refuse an unknown name at creation", function () {
    expect(() => hero({ ALIVE, KICKING: "NOPE" })).toThrowError(
      /KICKING refers to NOPE/
    );
  });

  it("should refuse a self reference", function () {
    expect(() => hero({ LOOP: "LOOP" })).toThrowError(/cycle: LOOP -> LOOP/);
  });

  it("should refuse a mutual reference", function () {
    expect(() => hero({ X: "Y", Y: "X" })).toThrowError(/cycle/);
  });

  it("should refuse a longer cycle", function () {
    expect(() => hero({ X: "Y", Y: "Z", Z: "X" })).toThrowError(
      /cycle: X -> Y -> Z -> X/
    );
  });

  it("should allow the same name twice without seeing a cycle", function () {
    const Fraktar = hero({
      ALIVE,
      WOUNDED,
      A: { and: ["ALIVE", "ALIVE"] },
      B: { or: ["A", "ALIVE"] },
    });
    expect(Fraktar.controlStates.sort()).toEqual(["A", "ALIVE", "B"]);
  });
});

describe("3.4 previous leaf", function () {
  it("should be true when the control state was active at the previous step", function () {
    const Fraktar = hero({ WOUNDED, WAS_WOUNDED: { previous: "WOUNDED" } }, { hp: 3, mp: 5 });

    Fraktar.actions.setHP(9);
    expect(Fraktar.controlStates.sort()).toEqual(["WAS_WOUNDED"]);
  });

  it("should be false when it was not", function () {
    const Fraktar = hero({ WOUNDED, WAS_WOUNDED: { previous: "WOUNDED" } });

    Fraktar.actions.setHP(9);
    expect(Fraktar.controlStates.sort()).toEqual([]);
  });

  it("should be false at creation, there is no previous step", function () {
    const Fraktar = hero({ WOUNDED, WAS_WOUNDED: { previous: "WOUNDED" } }, { hp: 3, mp: 5 });
    expect(Fraktar.controlStates.sort()).toEqual(["WOUNDED"]);
  });

  it("should refuse an unknown name at creation", function () {
    expect(() => hero({ ALIVE, WAS: { previous: "NOPE" } })).toThrowError(
      /WAS refers to NOPE/
    );
  });

  it("should read the previous step only, not the one before", function () {
    const Fraktar = hero({ WOUNDED, WAS_WOUNDED: { previous: "WOUNDED" } });

    Fraktar.actions.setHP(3);
    expect(Fraktar.controlStates.sort()).toEqual(["WOUNDED"]);

    Fraktar.actions.setHP(9);
    expect(Fraktar.controlStates.sort()).toEqual(["WAS_WOUNDED"]);

    Fraktar.actions.setHP(8);
    expect(Fraktar.controlStates.sort()).toEqual([]);
  });

  it("should not see a self reference through previous as a cycle", function () {
    const Fraktar = hero({ STILL: { previous: "STILL" } });
    expect(Fraktar.controlStates.sort()).toEqual([]);
  });

  it("should refuse a number in place of the name", function () {
    expect(() => hero({ ALIVE, WAS_ALIVE: { previous: 3 } })).toThrowError(
      /WAS_ALIVE expects a control state name in previous, got number/
    );
  });

  it("should refuse an array in place of the name", function () {
    expect(() => hero({ ALIVE, WAS_ALIVE: { previous: ["ALIVE"] } })).toThrowError(
      /WAS_ALIVE expects a control state name in previous, got an array/
    );
  });
});

describe("3.5 not", function () {
  it("should negate a name", function () {
    const Fraktar = hero({ ALIVE, DEAD: { not: "ALIVE" } }, { hp: 0, mp: 5 });
    expect(Fraktar.controlStates.sort()).toEqual(["DEAD"]);
  });

  it("should negate a previous leaf", function () {
    const Fraktar = hero({ WOUNDED, FRESH: { not: { previous: "WOUNDED" } } }, { hp: 3, mp: 5 });

    expect(Fraktar.controlStates.sort()).toEqual(["FRESH", "WOUNDED"]);
    Fraktar.actions.setHP(2);
    expect(Fraktar.controlStates.sort()).toEqual(["WOUNDED"]);
  });

  it("should negate an and", function () {
    const Fraktar = hero({ ALIVE, WOUNDED, SAFE: { not: { and: ["ALIVE", "WOUNDED"] } } });
    expect(Fraktar.controlStates.sort()).toEqual(["ALIVE", "SAFE"]);
  });

  it("should negate an or", function () {
    const Fraktar = hero(
      { ALIVE, MANA, NOTHING: { not: { or: ["ALIVE", "MANA"] } } },
      { hp: 0, mp: 0 }
    );
    expect(Fraktar.controlStates.sort()).toEqual(["NOTHING"]);
  });

  it("should return the original value when doubled", function () {
    const Fraktar = hero({ ALIVE, STILL_ALIVE: { not: { not: "ALIVE" } } });
    expect(Fraktar.controlStates.sort()).toEqual(["ALIVE", "STILL_ALIVE"]);
  });
});

describe("3.6 and", function () {
  it("should activate when both members are active", function () {
    const Fraktar = hero({ ALIVE, MANA, READY: { and: ["ALIVE", "MANA"] } });
    expect(Fraktar.controlStates.sort()).toEqual(["ALIVE", "MANA", "READY"]);
  });

  it("should not activate when one member is not", function () {
    const Fraktar = hero({ ALIVE, MANA, READY: { and: ["ALIVE", "MANA"] } }, { hp: 10, mp: 0 });
    expect(Fraktar.controlStates.sort()).toEqual(["ALIVE"]);
  });

  it("should not activate when no member is", function () {
    const Fraktar = hero({ ALIVE, MANA, READY: { and: ["ALIVE", "MANA"] } }, { hp: 0, mp: 0 });
    expect(Fraktar.controlStates.sort()).toEqual([]);
  });

  it("should accept a single member", function () {
    const Fraktar = hero({ ALIVE, READY: { and: ["ALIVE"] } });
    expect(Fraktar.controlStates.sort()).toEqual(["ALIVE", "READY"]);
  });

  it("should refuse an empty and", function () {
    expect(() => hero({ ALIVE, READY: { and: [] } })).toThrowError(
      /READY has an empty and/
    );
  });

  it("should accept three members or more", function () {
    const Fraktar = hero({
      ALIVE,
      MANA,
      WOUNDED,
      READY: { and: ["ALIVE", "MANA", { not: "WOUNDED" }] },
    });
    expect(Fraktar.controlStates.sort()).toEqual(["ALIVE", "MANA", "READY"]);
  });

  it("should mix leaf kinds", function () {
    const Fraktar = hero({ ALIVE, WOUNDED, RECOVERING: { and: ["ALIVE", { previous: "WOUNDED" }] } }, { hp: 3, mp: 5 });

    expect(Fraktar.controlStates.sort()).toEqual(["ALIVE", "WOUNDED"]);
    Fraktar.actions.setHP(9);
    expect(Fraktar.controlStates.sort()).toEqual(["ALIVE", "RECOVERING"]);
  });

  it("should nest", function () {
    const Fraktar = hero({
      ALIVE,
      MANA,
      WOUNDED,
      READY: { and: [{ or: ["WOUNDED", "MANA"] }, "ALIVE"] },
    });
    expect(Fraktar.controlStates.sort()).toEqual(["ALIVE", "MANA", "READY"]);
  });

  it("should refuse a non array", function () {
    expect(() => hero({ ALIVE, READY: { and: "ALIVE" } })).toThrowError(
      /READY expects an array in and, got string/
    );
  });
});

describe("3.7 or", function () {
  it("should activate when one member is active", function () {
    const Fraktar = hero({ ALIVE, MANA, ANY: { or: ["ALIVE", "MANA"] } }, { hp: 10, mp: 0 });
    expect(Fraktar.controlStates.sort()).toEqual(["ALIVE", "ANY"]);
  });

  it("should activate when both members are active", function () {
    const Fraktar = hero({ ALIVE, MANA, ANY: { or: ["ALIVE", "MANA"] } });
    expect(Fraktar.controlStates.sort()).toEqual(["ALIVE", "ANY", "MANA"]);
  });

  it("should not activate when no member is", function () {
    const Fraktar = hero({ ALIVE, MANA, ANY: { or: ["ALIVE", "MANA"] } }, { hp: 0, mp: 0 });
    expect(Fraktar.controlStates.sort()).toEqual([]);
  });

  it("should accept a single member", function () {
    const Fraktar = hero({ ALIVE, ANY: { or: ["ALIVE"] } });
    expect(Fraktar.controlStates.sort()).toEqual(["ALIVE", "ANY"]);
  });

  it("should refuse an empty or", function () {
    expect(() => hero({ ALIVE, ANY: { or: [] } })).toThrowError(
      /ANY has an empty or/
    );
  });

  it("should accept three members or more", function () {
    const Fraktar = hero(
      { ALIVE, MANA, WOUNDED, ANY: { or: ["ALIVE", "MANA", "WOUNDED"] } },
      { hp: 0, mp: 0 }
    );
    expect(Fraktar.controlStates.sort()).toEqual(["ANY", "WOUNDED"]);
  });

  it("should mix leaf kinds", function () {
    const Fraktar = hero({ WOUNDED, ANY: { or: ["WOUNDED", { previous: "WOUNDED" }] } }, { hp: 3, mp: 5 });

    expect(Fraktar.controlStates.sort()).toEqual(["ANY", "WOUNDED"]);
    Fraktar.actions.setHP(9);
    expect(Fraktar.controlStates.sort()).toEqual(["ANY"]);
  });

  it("should nest", function () {
    const Fraktar = hero(
      { ALIVE, MANA, WOUNDED, ANY: { or: [{ and: ["ALIVE", "MANA"] }, "WOUNDED"] } },
      { hp: 0, mp: 0 }
    );
    expect(Fraktar.controlStates.sort()).toEqual(["ANY", "WOUNDED"]);
  });

  it("should refuse a non array", function () {
    expect(() => hero({ ALIVE, ANY: { or: 3 } })).toThrowError(
      /ANY expects an array in or, got number/
    );
  });
});

describe("3.8 malformed input", function () {
  it("should refuse an empty object", function () {
    expect(() => hero({ ANY: {} })).toThrowError(/got nothing/);
  });

  it("should refuse an unknown key", function () {
    expect(() => hero({ ALIVE, ANY: { ors: ["ALIVE"] } })).toThrowError(
      /unknown predicate key: ors/
    );
  });

  it("should refuse an empty not", function () {
    expect(() => hero({ ANY: { not: undefined } })).toThrowError(
      /ANY has an empty not/
    );
  });

  it("should refuse null", function () {
    expect(() => hero({ ANY: null })).toThrowError(/malformed predicate: null/);
  });

  it("should refuse a number", function () {
    expect(() => hero({ ANY: 3 })).toThrowError(/malformed predicate: number/);
  });

  it("should refuse a boolean", function () {
    expect(() => hero({ ANY: true })).toThrowError(/malformed predicate: boolean/);
  });

  it("should refuse two keys at once", function () {
    expect(() =>
      hero({ ALIVE, ANY: { and: ["ALIVE"], or: ["ALIVE"] } })
    ).toThrowError(/got and, or/);
  });
});

describe("3.9 several predicates together", function () {
  it("should activate two unrelated control states at the same time", function () {
    const Fraktar = hero({ ALIVE, MANA });
    expect(Fraktar.controlStates.sort()).toEqual(["ALIVE", "MANA"]);
  });

  it("should never activate A and not A together, over a range", function () {
    for (let hp = -3; hp <= 10; hp++) {
      const Fraktar = hero({ ALIVE, DEAD: { not: "ALIVE" } }, { hp, mp: 5 });
      const states = Fraktar.controlStates;
      expect(states.includes("ALIVE") && states.includes("DEAD")).toBe(false);
      expect(states.includes("ALIVE") || states.includes("DEAD")).toBe(true);
    }
  });

  it("should not depend on the declaration order", function () {
    const first = hero({ ALIVE, HURT: { and: ["ALIVE", "WOUNDED"] }, WOUNDED }, { hp: 3, mp: 5 });
    const second = hero({ WOUNDED, ALIVE, HURT: { and: ["ALIVE", "WOUNDED"] } }, { hp: 3, mp: 5 });

    expect(first.controlStates.slice().sort()).toEqual(
      second.controlStates.slice().sort()
    );
  });

  it("should resolve a deep tree", function () {
    let tree: any = "ALIVE";
    for (let depth = 0; depth < 10; depth++) {
      tree = { and: [{ or: [tree, { not: "MANA" }] }, "ALIVE"] };
    }
    const Fraktar = hero({ ALIVE, MANA, DEEP: tree });
    expect(Fraktar.controlStates.sort()).toEqual(["ALIVE", "DEEP", "MANA"]);
  });
});

describe("3.10 inside a container", function () {
  const machine = { ALIVE, WOUNDED, WAS_WOUNDED: { previous: "WOUNDED" } };

  it("should compute at creation, with no previous and no mutations", function () {
    const Fraktar = hero(machine, { hp: 3, mp: 5 });
    expect(Fraktar.controlStates.sort()).toEqual(["ALIVE", "WOUNDED"]);
  });

  it("should recompute after an accepted step", function () {
    const Fraktar = hero(machine, { hp: 3, mp: 5 });
    Fraktar.actions.setHP(9);
    expect(Fraktar.controlStates.sort()).toEqual(["ALIVE", "WAS_WOUNDED"]);
  });

  it("should be unchanged after a rejected attempt", function () {
    const Fraktar = createContainer<Model>()
      .addAcceptor("setHP", {
        condition: (model, hp: number) => hp >= 0,
        mutator: (model, hp: number) => {
          model.hp = hp;
        },
      })
      .addControlStatePredicate("ALIVE", ALIVE)
      .addControlStatePredicate("WAS_ALIVE", { previous: "ALIVE" })
      .addActions({ setHP: "setHP" })
      .create({ hp: 3, mp: 5 });

    expect(Fraktar.controlStates.slice()).toEqual(["ALIVE"]);
    Fraktar.actions.setHP(-1);
    expect(Fraktar.lastAttempt?.status).toBe("rejected");
    expect(Fraktar.controlStates.slice()).toEqual(["ALIVE"]);
  });

  it("should be unchanged after a discarded attempt", function () {
    jest.spyOn(console, "warn").mockImplementation(() => {});
    const Fraktar = createContainer<Model>()
      .addAcceptor("setHP", {
        mutator: (model, hp: number) => {
          model.hp = hp;
        },
      })
      .addControlStatePredicate("ALIVE", ALIVE)
      .addControlStatePredicate("WAS_ALIVE", { previous: "ALIVE" })
      .addActions({
        heal: {
          isAllowed: ({ controlStates }) => controlStates.includes("WAS_ALIVE"),
          action: (hp: number) => [{ type: "setHP", payload: hp }],
        },
      })
      .create({ hp: 3, mp: 5 });

    Fraktar.actions.heal(9);
    expect(Fraktar.lastAttempt?.status).toBe("discarded");
    expect(Fraktar.controlStates.slice()).toEqual(["ALIVE"]);
    jest.restoreAllMocks();
  });

  it("should be restored by rollback, past included", function () {
    const steps: any[] = [];
    const Fraktar: any = createContainer<Model>()
      .addAcceptor("setHP", {
        mutator: (model, hp: number) => {
          model.hp = hp;
        },
      })
      .addControlStatePredicate("ALIVE", ALIVE)
      .addControlStatePredicate("WOUNDED", WOUNDED)
      .addControlStatePredicate("WAS_WOUNDED", { previous: "WOUNDED" })
      .addActions({ setHP: "setHP" })
      .addStepReaction({
        runOnInit: false,
        do: ({ data, delta }) => {
          steps.push({
            data: { hp: data.hp, mp: data.mp },
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
      })
      .create({ hp: 3, mp: 5 });

    Fraktar.actions.setHP(9);
    expect(Fraktar.controlStates.slice().sort()).toEqual(["ALIVE", "WAS_WOUNDED"]);

    Fraktar.actions.setHP(8);
    expect(Fraktar.controlStates.slice().sort()).toEqual(["ALIVE"]);

    Fraktar.rollback(steps[0]);
    expect(Fraktar.controlStates.slice().sort()).toEqual(["ALIVE", "WAS_WOUNDED"]);
  });

  it("should be recomputed by reset as at creation", function () {
    const Fraktar = hero(machine, { hp: 3, mp: 5 });

    Fraktar.actions.setHP(9);
    expect(Fraktar.controlStates.slice().sort()).toEqual(["ALIVE", "WAS_WOUNDED"]);

    Fraktar.reset({ hp: 3, mp: 5 });
    expect(Fraktar.controlStates.slice().sort()).toEqual(["ALIVE", "WOUNDED"]);
  });

  it("should give a predicate the set from the step before", function () {
    const seen: string[][] = [];
    const Fraktar = hero({
      ALIVE,
      WOUNDED,
      SPY: ({ previousControlStates }: any) => {
        seen.push(previousControlStates.slice().sort());
        return false;
      },
    }, { hp: 3, mp: 5 });

    Fraktar.actions.setHP(9);

    expect(seen).toEqual([[], ["ALIVE", "WOUNDED"]]);
  });
});

describe("3.11 a tree added once the container exists", function () {
  /**
   * A hero whose factory is given one more control state after he was
   * created. Nothing checks that tree: the container meets it at its next
   * step. It is read from a text, as a configuration is.
   */
  function createLate(tree: string) {
    const factory = createContainer<Model>()
      .addAcceptor("setHP", {
        mutator: (data, hp: number) => {
          data.hp = hp;
        },
      })
      .addControlStatePredicate("ALIVE", ({ data }) => data.hp > 0)
      .addActions({ setHP: "setHP" });
    const Fraktar = factory.create({ hp: 10, mp: 5 });
    factory.addControlStatePredicate("KICKING", JSON.parse(tree));
    return Fraktar;
  }

  it("should throw on a malformed predicate instead of activating the control state", function () {
    const Fraktar = createLate('{ "ors": ["ALIVE"] }');

    expect(() => Fraktar.actions.setHP(3)).toThrowError(
      /KICKING has a malformed predicate: object/
    );
  });

  it("should throw on a name which is not a control state", function () {
    const Fraktar = createLate('"NOPE"');

    expect(() => Fraktar.actions.setHP(3)).toThrowError(
      /KICKING refers to NOPE, which is not a control state/
    );
  });
});
