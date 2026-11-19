import { observable } from "mobx";
import { Patch, applyPatch, jsonCopy } from "../..";

describe("a JSON copy of the hero", function () {
  it("should hold the sheet, the nested sheets and the inventory as they are", function () {
    const Fraktar = observable({
      name: "Fraktar",
      stats: { hp: 3, purse: { gold: 5 } },
      inventory: [{ id: "sword" }, { id: "shield" }],
      pet: null,
    });

    const copy = jsonCopy(Fraktar);

    expect(copy).toEqual({
      name: "Fraktar",
      stats: { hp: 3, purse: { gold: 5 } },
      inventory: [{ id: "sword" }, { id: "shield" }],
      pet: null,
    });
    // Nothing of the model is left in it.
    expect(JSON.parse(JSON.stringify(copy))).toEqual(copy);
    expect(copy.stats).not.toBe(Fraktar.stats);
  });

  it("should hold the quest log as an object, its keys as texts", function () {
    const Fraktar = observable({
      quests: new Map<any, { progress: number }>([
        ["dragon", { progress: 1 }],
        [7, { progress: 0 }],
      ]),
    });

    expect(jsonCopy(Fraktar)).toEqual({
      quests: { dragon: { progress: 1 }, "7": { progress: 0 } },
    });
  });

  it("should hold the status effects as an object, each one a key which is true", function () {
    const Fraktar = observable({ effects: new Set(["poisoned", "blessed"]) });

    expect(jsonCopy(Fraktar)).toEqual({
      effects: { poisoned: true, blessed: true },
    });
  });

  it("should name a member which is not a text by its own JSON, keys sorted", function () {
    const Fraktar = observable({ party: new Set([{ name: "Elwing", hp: 5 }]) });

    expect(jsonCopy(Fraktar)).toEqual({
      party: { '{"hp":5,"name":"Elwing"}': true },
    });
  });

  it("should name alike two members whose fields were written in another order", function () {
    const Fraktar = observable({
      party: new Set([
        { name: "Elwing", pets: [{ name: "Rex", age: 3 }], sigil: null },
        { sigil: null, pets: [{ age: 3, name: "Rex" }], name: "Elwing" },
      ]),
    });

    expect(Object.keys(jsonCopy(Fraktar).party)).toEqual([
      '{"name":"Elwing","pets":[{"age":3,"name":"Rex"}],"sigil":null}',
    ]);
  });

  it("should hold what a box holds", function () {
    const Fraktar = observable({
      hp: observable.box(3),
      stats: observable.box({ mp: 2 }),
    });

    expect(jsonCopy(Fraktar)).toEqual({ hp: 3, stats: { mp: 2 } });
  });

  it("should write a date, a symbol and a big number as texts", function () {
    const Fraktar = observable({
      bornAt: new Date("2020-05-17T10:00:00.000Z"),
      diedAt: new Date("never"),
      sigil: Symbol("warfog"),
      gold: BigInt("12345678901234567890"),
    });

    expect(jsonCopy(Fraktar)).toEqual({
      bornAt: "2020-05-17T10:00:00.000Z",
      // Not a date anybody could write.
      diedAt: null,
      sigil: "Symbol(warfog)",
      gold: "12345678901234567890",
    });
  });

  it("should leave out what JSON does not hold, as JSON does", function () {
    const Fraktar = observable<Record<string, unknown>>({
      hp: 3,
      title: undefined,
      shout: () => "For the Horde!",
      slots: ["sword", undefined, () => "shield"],
    });

    const copy = jsonCopy(Fraktar);

    expect(Object.keys(copy)).toEqual(["hp", "slots"]);
    expect(copy.slots).toEqual(["sword", null, null]);
    expect(jsonCopy(undefined)).toBeUndefined();
    expect(jsonCopy(() => {})).toBeUndefined();
  });

  it("should leave out what the hero computes", function () {
    const Fraktar = observable({
      hp: 3,
      get isWounded() {
        return this.hp < 5;
      },
    });

    expect(Object.keys(jsonCopy(Fraktar))).toEqual(["hp"]);
  });

  it("should be an object as any other, which can be written in", function () {
    const copy = jsonCopy(observable({ hp: 3 }));

    copy.hp = 5;

    expect(copy.hp).toBe(5);
  });

  it("should stop where the party comes back to itself", function () {
    const party: any = { leader: "Fraktar", next: { leader: "Elwing" } };
    party.next.next = party;

    expect(jsonCopy(party)).toEqual({
      leader: "Fraktar",
      next: { leader: "Elwing", next: "[Circular]" },
    });
  });

  it("should stop where a member of the party holds the party", function () {
    const party = new Set<object>();
    party.add({ name: "Fraktar", party });

    expect(jsonCopy({ party })).toEqual({
      party: { '{"name":"Fraktar","party":"[Circular]"}': true },
    });
  });

  it("should stop where a quest is named by what holds the quest log", function () {
    const quests = new Map<object, number>();
    quests.set({ log: quests }, 1);

    expect(jsonCopy({ quests })).toEqual({
      quests: { '{"log":"[Circular]"}': 1 },
    });
  });

  it("should copy twice a guild two members share", function () {
    const guild = { name: "Warfog" };

    const copy = jsonCopy({ Fraktar: { guild }, Elwing: { guild } });

    expect(copy).toEqual({
      Fraktar: { guild: { name: "Warfog" } },
      Elwing: { guild: { name: "Warfog" } },
    });
    expect(copy.Fraktar.guild).not.toBe(copy.Elwing.guild);
  });

  it("should take a native map, set and array as well", function () {
    expect(
      jsonCopy({
        quests: new Map([["dragon", 1]]),
        effects: new Set(["blessed"]),
        inventory: ["sword"],
      })
    ).toEqual({
      quests: { dragon: 1 },
      effects: { blessed: true },
      inventory: ["sword"],
    });
  });

  it("should keep a key named __proto__ as a field of its own", function () {
    const copy = jsonCopy({
      quests: new Map([["__proto__", { cursed: true }]]),
    });

    expect(Object.keys(copy.quests)).toEqual(["__proto__"]);
    expect(copy.quests.cursed).toBeUndefined();
  });
});

describe("a patch applied to a JSON copy", function () {
  function sheet() {
    return {
      name: "Fraktar",
      stats: { hp: 3 },
      inventory: ["sword", "shield", "potion"],
    };
  }

  it("should add, replace and remove a field", function () {
    const copy = applyPatch(sheet(), [
      { op: "add", path: "/title", value: "the brave" },
      { op: "replace", path: "/stats/hp", value: 10 },
      { op: "remove", path: "/name" },
    ]);

    expect(copy).toEqual({
      title: "the brave",
      stats: { hp: 10 },
      inventory: ["sword", "shield", "potion"],
    });
  });

  it("should change the copy it is given, and give it back", function () {
    const copy = sheet();

    const patched = applyPatch(copy, [
      { op: "replace", path: "/stats/hp", value: 10 },
    ]);

    expect(patched).toBe(copy);
  });

  it("should add an item where it is told, the others moving on", function () {
    const copy = applyPatch(sheet(), [
      { op: "add", path: "/inventory/1", value: "axe" },
    ]);

    expect(copy.inventory).toEqual(["sword", "axe", "shield", "potion"]);
  });

  it("should add an item at the end, named by its place or by a dash", function () {
    const copy = applyPatch(sheet(), [
      { op: "add", path: "/inventory/3", value: "rope" },
      { op: "add", path: "/inventory/-", value: "torch" },
    ]);

    expect(copy.inventory).toEqual([
      "sword",
      "shield",
      "potion",
      "rope",
      "torch",
    ]);
  });

  it("should replace and remove an item", function () {
    const copy = applyPatch(sheet(), [
      { op: "replace", path: "/inventory/0", value: "axe" },
      { op: "remove", path: "/inventory/1" },
    ]);

    expect(copy.inventory).toEqual(["axe", "potion"]);
  });

  it("should replace the whole copy, or remove it", function () {
    const Elwing = { name: "Elwing" };

    expect(
      applyPatch(sheet(), [{ op: "replace", path: "", value: Elwing }])
    ).toEqual({
      name: "Elwing",
    });
    expect(applyPatch(sheet(), [{ op: "remove", path: "" }])).toBeUndefined();
  });

  it("should read a key which holds a slash or a tilde", function () {
    const copy = applyPatch({ quests: {} as Record<string, number> }, [
      { op: "add", path: "/quests/north~1south", value: 1 },
      { op: "add", path: "/quests/~0lost", value: 2 },
    ]);

    expect(copy.quests).toEqual({ "north/south": 1, "~lost": 2 });
  });

  it("should read a key which holds two slashes", function () {
    const copy = applyPatch({ "north/east/tower": 1 }, [
      { op: "replace", path: "/north~1east~1tower", value: 2 },
    ]);

    expect(copy).toEqual({ "north/east/tower": 2 });
  });

  it("should not be rewritten by what is applied next", function () {
    const patch: Patch = [{ op: "add", path: "/pet", value: { name: "Rex" } }];

    const copy = applyPatch<any>(sheet(), patch);
    applyPatch(copy, [{ op: "replace", path: "/pet/name", value: "Rexy" }]);

    // The copy took a copy: the patch still says what it said.
    expect(patch).toEqual([
      { op: "add", path: "/pet", value: { name: "Rex" } },
    ]);
  });

  it("should put a copy of an item where it is told by its place", function () {
    const potion = { doses: 1 };
    const copy = applyPatch({ bag: [0] }, [
      { op: "replace", path: "/bag/0", value: potion },
    ]);

    potion.doses = 2;

    expect(copy).toEqual({ bag: [{ doses: 1 }] });
  });

  it("should leave nothing of a field which is removed", function () {
    const copy = applyPatch<any>(sheet(), [{ op: "remove", path: "/name" }]);

    expect(Object.keys(copy)).toEqual(["stats", "inventory"]);
  });

  it("should read a key which is written ~01 as the key ~1", function () {
    const copy = applyPatch<any>({ quests: { "~1": 1 } }, [
      { op: "replace", path: "/quests/~01", value: 2 },
    ]);

    expect(copy.quests).toEqual({ "~1": 2 });
  });

  it("should take a copy of what replaces the whole copy", function () {
    const Elwing = { name: "Elwing" };

    const copy = applyPatch<any>(sheet(), [
      { op: "replace", path: "", value: Elwing },
    ]);
    Elwing.name = "Elwing the renamed";

    expect(copy.name).toBe("Elwing");
  });

  it("should put a null where an item is added without a value", function () {
    const copy = applyPatch(sheet(), [
      { op: "add", path: "/inventory/1" },
      { op: "add", path: "/inventory/-" },
    ]);

    expect(copy.inventory).toEqual(["sword", null, "shield", "potion", null]);
  });

  it("should replay several patches in a row", function () {
    const patches: Patch[] = [
      [{ op: "replace", path: "/stats/hp", value: 10 }],
      [
        { op: "remove", path: "/inventory/1" },
        { op: "add", path: "/inventory/1", value: "axe" },
      ],
    ];

    const copy = patches.reduce(applyPatch, sheet());

    expect(copy).toEqual({
      name: "Fraktar",
      stats: { hp: 10 },
      inventory: ["sword", "axe", "potion"],
    });
  });
});

describe("a patch which does not fit the copy", function () {
  const sheet = () => ({
    name: "Fraktar",
    stats: { hp: 3 },
    inventory: ["sword"],
  });

  /**
   * What the sheet answers to a patch of this one operation.
   */
  function refusal(op: "add" | "remove" | "replace", path: string) {
    try {
      applyPatch(sheet(), [{ op, path, value: "axe" }]);
    } catch (error) {
      return (error as Error).message;
    }
    return "applied";
  }

  it("should be refused when it removes or replaces what is not there", function () {
    expect(refusal("remove", "/title")).toBe(
      "[RAVIOLI] Can't apply the patch: nothing is at /title."
    );
    expect(refusal("replace", "/title")).toBe(
      "[RAVIOLI] Can't apply the patch: nothing is at /title."
    );
    expect(refusal("remove", "/inventory/1")).toBe(
      "[RAVIOLI] Can't apply the patch: nothing is at /inventory/1."
    );
  });

  it("should be refused when it goes through what is not there", function () {
    expect(refusal("add", "/pet/name")).toBe(
      "[RAVIOLI] Can't apply the patch: nothing is at /pet/name."
    );
    expect(refusal("add", "/name/first")).toBe(
      "[RAVIOLI] Can't apply the patch: nothing is at /name/first."
    );
  });

  it("should be refused when it goes through a field which holds nothing", function () {
    expect(() =>
      applyPatch({ quest: null }, [
        { op: "replace", path: "/quest/progress", value: 1 },
      ])
    ).toThrowError(
      "[RAVIOLI] Can't apply the patch: nothing is at /quest/progress."
    );
  });

  it("should be refused when it adds an item past the end", function () {
    expect(refusal("add", "/inventory/5")).toBe(
      "[RAVIOLI] Can't apply the patch: nothing is at /inventory/5."
    );
  });

  it("should be refused when it names an item by what is not a place", function () {
    expect(refusal("add", "/inventory/01")).toBe(
      "[RAVIOLI] Can't apply the patch: nothing is at /inventory/01."
    );
    expect(refusal("replace", "/inventory/length")).toBe(
      "[RAVIOLI] Can't apply the patch: nothing is at /inventory/length."
    );
    // The sword is at 0, and only at 0.
    expect(refusal("replace", "/inventory/00")).toBe(
      "[RAVIOLI] Can't apply the patch: nothing is at /inventory/00."
    );
  });

  it("should not be let out of the copy through what every object inherits", function () {
    expect(refusal("add", "/__proto__/cursed")).toBe(
      "[RAVIOLI] Can't apply the patch: nothing is at /__proto__/cursed."
    );
    expect(({} as any).cursed).toBeUndefined();
  });

  it("should take a field named __proto__ as a field", function () {
    const copy = applyPatch<any>(sheet(), [
      { op: "add", path: "/__proto__", value: { cursed: true } },
    ]);

    expect(copy.cursed).toBeUndefined();
    expect(Object.keys(copy)).toEqual([
      "name",
      "stats",
      "inventory",
      "__proto__",
    ]);
  });

  it("should be refused when its path is not a JSON pointer", function () {
    expect(refusal("add", "title")).toBe(
      "[RAVIOLI] Can't apply the patch: title is not a JSON pointer."
    );
  });

  it("should be refused when it holds an operation Ravioli never writes", function () {
    // What a patch read from a file may hold: the type does not allow it.
    const patch = JSON.parse(
      '[{ "op": "move", "from": "/name", "path": "/title" }]'
    );

    expect(() => applyPatch(sheet(), patch)).toThrowError(
      "[RAVIOLI] Can't apply the operation move: only add, remove and replace are applied."
    );
  });
});
