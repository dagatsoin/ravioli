import {
  IObservableArray,
  autorun,
  makeAutoObservable,
  makeObservable,
  observable,
  observe,
  onBecomeObserved,
  runInAction,
} from "mobx";
import { applyPatch, jsonCopy } from "../..";
import { createStepRecorder } from "../../lib/stepRecorder";

/**
 * Record what a mutator does to the hero and read its patches, in both
 * directions. `replayed` is a JSON copy of the hero before, the patches
 * applied to it. `rewound` is a JSON copy of the hero after, the inverse
 * patches applied to it.
 */
function record<T extends object>(Fraktar: T, mutator: (hero: T) => void) {
  const recorder = createStepRecorder(Fraktar);
  const before = jsonCopy(Fraktar);
  recorder.start();
  runInAction(() => mutator(Fraktar));
  const { patches, inversePatches } = recorder.read();
  recorder.stop();
  const after = jsonCopy(Fraktar);

  return {
    patches,
    inversePatches,
    before,
    after,
    replayed: patches.reduce(applyPatch, jsonCopy(before)),
    rewound: inversePatches.reduce(applyPatch, jsonCopy(after)),
  };
}

describe("the hero sheet", function () {
  it("should tell a field which is updated, added and removed", function () {
    const Fraktar = observable<Record<string, unknown>>({
      hp: 3,
      title: "the brave",
    });

    const { patches, inversePatches, before, after, replayed, rewound } =
      record(Fraktar, (hero) => {
        hero.hp = 10;
        hero.isPoisoned = true;
        delete hero.title;
      });

    expect(patches).toEqual([
      [{ op: "replace", path: "/hp", value: 10 }],
      [{ op: "add", path: "/isPoisoned", value: true }],
      [{ op: "remove", path: "/title" }],
    ]);
    // What undoes them, last write first.
    expect(inversePatches).toEqual([
      [{ op: "add", path: "/title", value: "the brave" }],
      [{ op: "remove", path: "/isPoisoned" }],
      [{ op: "replace", path: "/hp", value: 3 }],
    ]);
    expect(replayed).toEqual(after);
    expect(rewound).toEqual(before);
  });

  it("should tell nothing of a write which changes nothing", function () {
    const Fraktar = observable({ hp: 3 });

    const { patches } = record(Fraktar, (hero) => {
      hero.hp = 3;
    });

    expect(patches).toEqual([]);
  });

  it("should tell an emptied field as removed and a filled one as added", function () {
    const Fraktar = observable<Record<string, unknown>>({
      hp: 3,
      title: "the brave",
      pet: undefined,
    });

    const { patches, inversePatches, before, after, replayed, rewound } =
      record(Fraktar, (hero) => {
        hero.title = undefined;
        hero.pet = "Rex";
      });

    // The field is still on the sheet, but undefined is not written in JSON.
    expect(patches).toEqual([
      [{ op: "remove", path: "/title" }],
      [{ op: "add", path: "/pet", value: "Rex" }],
    ]);
    expect(inversePatches).toEqual([
      [{ op: "remove", path: "/pet" }],
      [{ op: "add", path: "/title", value: "the brave" }],
    ]);
    expect(replayed).toEqual(after);
    expect(rewound).toEqual(before);
  });

  it("should tell nothing of a field which never was in a JSON copy", function () {
    const sigil = Symbol("sigil");
    const Fraktar = observable<Record<string | symbol, unknown>>({ hp: 3 });

    const { patches, inversePatches } = record(Fraktar, (hero) => {
      hero.shout = () => "For the Horde!";
      hero.title = undefined;
      delete hero.shout;
      // JSON has no field named by a symbol.
      hero[sigil] = "warfog";
      hero[sigil] = "horde";
    });

    expect(patches).toEqual([]);
    expect(inversePatches).toEqual([]);
  });

  it("should tell nothing of what is written under a field named by a symbol", function () {
    const sigil = Symbol("sigil");
    const Fraktar = observable<Record<string | symbol, any>>({ hp: 3 });
    runInAction(() => {
      Fraktar[sigil] = { house: "Warfog" };
    });

    const { patches, inversePatches } = record(Fraktar, (hero) => {
      hero[sigil].house = "Horde";
    });

    expect(patches).toEqual([]);
    expect(inversePatches).toEqual([]);
  });

  it("should escape a field whose name holds a slash or a tilde", function () {
    const Fraktar = observable<Record<string, unknown>>({ hp: 3 });

    const { patches, before, after, replayed, rewound } = record(
      Fraktar,
      (hero) => {
        hero["north/south"] = 1;
        hero["~lost"] = 2;
      }
    );

    expect(patches).toEqual([
      [{ op: "add", path: "/north~1south", value: 1 }],
      [{ op: "add", path: "/~0lost", value: 2 }],
    ]);
    expect(replayed).toEqual(after);
    expect(rewound).toEqual(before);
  });
});

describe("a nested sheet", function () {
  it("should tell its fields by their path", function () {
    const Fraktar = observable({ stats: { hp: 3, purse: { gold: 5 } } });

    const { patches, inversePatches } = record(Fraktar, (hero) => {
      hero.stats.purse.gold = 0;
    });

    expect(patches).toEqual([
      [{ op: "replace", path: "/stats/purse/gold", value: 0 }],
    ]);
    expect(inversePatches).toEqual([
      [{ op: "replace", path: "/stats/purse/gold", value: 5 }],
    ]);
  });

  it("should be told whole when it is added, replaced or removed", function () {
    const Fraktar = observable<Record<string, any>>({
      stats: { hp: 3 },
      pet: { name: "Rex" },
    });

    const { patches, inversePatches, before, after, replayed, rewound } =
      record(Fraktar, (hero) => {
        hero.stats = { hp: 10, mp: 2 };
        hero.mount = { name: "Shadowfax" };
        delete hero.pet;
      });

    expect(patches).toEqual([
      [{ op: "replace", path: "/stats", value: { hp: 10, mp: 2 } }],
      [{ op: "add", path: "/mount", value: { name: "Shadowfax" } }],
      [{ op: "remove", path: "/pet" }],
    ]);
    expect(inversePatches).toEqual([
      [{ op: "add", path: "/pet", value: { name: "Rex" } }],
      [{ op: "remove", path: "/mount" }],
      [{ op: "replace", path: "/stats", value: { hp: 3 } }],
    ]);
    expect(replayed).toEqual(after);
    expect(rewound).toEqual(before);
  });

  it("should be told as it was when it was put, whatever was written in it since", function () {
    const Fraktar = observable<{
      hp: number;
      pet?: { name: string; tricks: string[] };
    }>({
      hp: 3,
    });

    const { patches, inversePatches, before, after, replayed, rewound } =
      record(Fraktar, (hero) => {
        hero.pet = { name: "Rex", tricks: [] };
        hero.pet.name = "Rexy";
        hero.pet.tricks.push("sit");
      });

    // The patches are written when they are read, once all of it happened.
    // Each one still tells what the model held right after its own write.
    expect(patches).toEqual([
      [{ op: "add", path: "/pet", value: { name: "Rex", tricks: [] } }],
      [{ op: "replace", path: "/pet/name", value: "Rexy" }],
      [{ op: "add", path: "/pet/tricks/0", value: "sit" }],
    ]);
    expect(inversePatches).toEqual([
      [{ op: "remove", path: "/pet/tricks/0" }],
      [{ op: "replace", path: "/pet/name", value: "Rex" }],
      [{ op: "remove", path: "/pet" }],
    ]);
    expect(replayed).toEqual(after);
    expect(rewound).toEqual(before);
  });

  it("should be told as it was when it was removed, whatever is written in it since", function () {
    const Fraktar = observable<{ hp: number; pet?: { name: string } }>({
      hp: 3,
      pet: { name: "Rex" },
    });

    const { patches, inversePatches, before, after, replayed, rewound } =
      record(Fraktar, (hero) => {
        const pet = hero.pet!;
        delete hero.pet;
        // Out of the model: no patch tells this, it is not in a JSON copy.
        pet.name = "Stray";
      });

    expect(patches).toEqual([[{ op: "remove", path: "/pet" }]]);
    expect(inversePatches).toEqual([
      [{ op: "add", path: "/pet", value: { name: "Rex" } }],
    ]);
    expect(replayed).toEqual(after);
    expect(rewound).toEqual(before);
  });
});

describe("the inventory", function () {
  it("should tell an item which is pushed, with a copy of it", function () {
    const Fraktar = observable({ inventory: [{ id: "sword", quantity: 1 }] });

    const { patches, inversePatches, before, after, replayed, rewound } =
      record(Fraktar, (hero) => {
        hero.inventory.push({ id: "potion", quantity: 3 });
        hero.inventory[1].quantity = 2;
      });

    // The potion as it was pushed, not as it is now.
    expect(patches).toEqual([
      [
        {
          op: "add",
          path: "/inventory/1",
          value: { id: "potion", quantity: 3 },
        },
      ],
      [{ op: "replace", path: "/inventory/1/quantity", value: 2 }],
    ]);
    expect(inversePatches).toEqual([
      [{ op: "replace", path: "/inventory/1/quantity", value: 3 }],
      [{ op: "remove", path: "/inventory/1" }],
    ]);
    expect(replayed).toEqual(after);
    expect(rewound).toEqual(before);
  });

  it("should tell a splice as one patch of several operations", function () {
    const Fraktar = observable({
      inventory: ["sword", "shield", "potion", "rope"],
    });

    const { patches, inversePatches, before, after, replayed, rewound } =
      record(Fraktar, (hero) => {
        hero.inventory.splice(1, 2, "axe", "bow", "torch");
      });

    expect(patches).toEqual([
      [
        { op: "remove", path: "/inventory/1" },
        { op: "remove", path: "/inventory/1" },
        { op: "add", path: "/inventory/1", value: "axe" },
        { op: "add", path: "/inventory/2", value: "bow" },
        { op: "add", path: "/inventory/3", value: "torch" },
      ],
    ]);
    expect(inversePatches).toEqual([
      [
        { op: "remove", path: "/inventory/1" },
        { op: "remove", path: "/inventory/1" },
        { op: "remove", path: "/inventory/1" },
        { op: "add", path: "/inventory/1", value: "shield" },
        { op: "add", path: "/inventory/2", value: "potion" },
      ],
    ]);
    expect(replayed).toEqual(after);
    expect(rewound).toEqual(before);
  });

  it("should tell a reorder as the list it leaves", function () {
    const Fraktar = observable({
      inventory: ["sword", "axe", "shield", "bow"],
    });

    const { patches, inversePatches, before, after, replayed, rewound } =
      record(Fraktar, (hero) => {
        hero.inventory.sort();
        hero.inventory.reverse();
      });

    // Nothing stays where it was: one replace, not a remove and an add each.
    expect(patches).toEqual([
      [
        {
          op: "replace",
          path: "/inventory",
          value: ["axe", "bow", "shield", "sword"],
        },
      ],
      [
        {
          op: "replace",
          path: "/inventory",
          value: ["sword", "shield", "bow", "axe"],
        },
      ],
    ]);
    expect(inversePatches).toEqual([
      [
        {
          op: "replace",
          path: "/inventory",
          value: ["axe", "bow", "shield", "sword"],
        },
      ],
      [
        {
          op: "replace",
          path: "/inventory",
          value: ["sword", "axe", "shield", "bow"],
        },
      ],
    ]);
    expect(replayed).toEqual(after);
    expect(rewound).toEqual(before);
  });

  it("should tell a slot which is written by its index, and a list which is emptied", function () {
    const Fraktar = observable<{ inventory: unknown[] }>({
      inventory: ["sword", "shield"],
    });

    const { patches, before, after, replayed, rewound } = record(
      Fraktar,
      (hero) => {
        hero.inventory[0] = "axe";
        // An item JSON does not hold leaves a null, as JSON does.
        hero.inventory[1] = undefined;
        hero.inventory.push(undefined);
        (hero.inventory as IObservableArray<unknown>).clear();
      }
    );

    expect(patches).toEqual([
      [{ op: "replace", path: "/inventory/0", value: "axe" }],
      [{ op: "replace", path: "/inventory/1", value: null }],
      [{ op: "add", path: "/inventory/2", value: null }],
      [{ op: "replace", path: "/inventory", value: [] }],
    ]);
    expect(replayed).toEqual(after);
    expect(rewound).toEqual(before);
  });

  it("should follow an item through the splices which move it", function () {
    const Fraktar = observable({
      inventory: [
        { id: "sword", quantity: 1 },
        { id: "potion", quantity: 3 },
      ],
    });

    const { patches, before, after, replayed, rewound } = record(
      Fraktar,
      (hero) => {
        const potion = hero.inventory[1];
        hero.inventory.unshift({ id: "rope", quantity: 1 });
        potion.quantity = 2;
        hero.inventory.splice(0, 2);
        potion.quantity = 1;
      }
    );

    // The potion was third, then first.
    expect(patches).toEqual([
      [{ op: "add", path: "/inventory/0", value: { id: "rope", quantity: 1 } }],
      [{ op: "replace", path: "/inventory/2/quantity", value: 2 }],
      [
        { op: "remove", path: "/inventory/0" },
        { op: "remove", path: "/inventory/0" },
      ],
      [{ op: "replace", path: "/inventory/0/quantity", value: 1 }],
    ]);
    expect(replayed).toEqual(after);
    expect(rewound).toEqual(before);
  });

  it("should tell an item which is moved to another bag where it lands", function () {
    const Fraktar = observable({
      bag: [
        { id: "rope", quantity: 1 },
        { id: "potion", quantity: 3 },
      ],
      chest: [] as Array<{ id: string; quantity: number }>,
    });

    const { patches, before, after, replayed, rewound } = record(
      Fraktar,
      (hero) => {
        const item = hero.bag.pop()!;
        // Out of the model for a moment: no patch tells this write.
        item.quantity = 1;
        hero.chest.push(item);
      }
    );

    expect(patches).toEqual([
      [{ op: "remove", path: "/bag/1" }],
      [{ op: "add", path: "/chest/0", value: { id: "potion", quantity: 1 } }],
    ]);
    expect(replayed).toEqual(after);
    expect(rewound).toEqual(before);
  });
});

describe("the quest log", function () {
  it("should be told as an object, a quest under its name", function () {
    const Fraktar = observable({
      quests: new Map([
        ["dragon", { progress: 1 }],
        ["goblins", { progress: 0 }],
      ]),
    });

    const { patches, inversePatches, before, after, replayed, rewound } =
      record(Fraktar, (hero) => {
        hero.quests.set("lich", { progress: 0 });
        hero.quests.set("dragon", { progress: 3 });
        hero.quests.get("lich")!.progress = 1;
        hero.quests.delete("goblins");
      });

    expect(patches).toEqual([
      [{ op: "add", path: "/quests/lich", value: { progress: 0 } }],
      [{ op: "replace", path: "/quests/dragon", value: { progress: 3 } }],
      [{ op: "replace", path: "/quests/lich/progress", value: 1 }],
      [{ op: "remove", path: "/quests/goblins" }],
    ]);
    expect(inversePatches).toEqual([
      [{ op: "add", path: "/quests/goblins", value: { progress: 0 } }],
      [{ op: "replace", path: "/quests/lich/progress", value: 0 }],
      [{ op: "replace", path: "/quests/dragon", value: { progress: 1 } }],
      [{ op: "remove", path: "/quests/lich" }],
    ]);
    expect(replayed).toEqual(after);
    expect(rewound).toEqual(before);
  });

  it("should name a quest whose key is not a text by the text of its key", function () {
    const north = Symbol("north");
    const Fraktar = observable({ quests: new Map<unknown, string>() });

    const { patches, before, after, replayed, rewound } = record(
      Fraktar,
      (hero) => {
        hero.quests.set(7, "seven dwarves");
        hero.quests.set(north, "the pole");
        hero.quests.set("north/south", "the road");
        hero.quests.clear();
      }
    );

    expect(patches.slice(0, 3)).toEqual([
      [{ op: "add", path: "/quests/7", value: "seven dwarves" }],
      [{ op: "add", path: "/quests/Symbol(north)", value: "the pole" }],
      [{ op: "add", path: "/quests/north~1south", value: "the road" }],
    ]);
    expect(patches.length).toBe(6);
    expect(replayed).toEqual(after);
    expect(rewound).toEqual(before);
  });
});

describe("a hero who holds what MobX does not observe", function () {
  const refused = (what: string) =>
    "[RAVIOLI] The patches of this step can not be written: the model " +
    `holds ${what}, which MobX does not observe: nothing tells what was ` +
    "written in it.";

  it("should not have a step told while a quest is named by an object", function () {
    const giver = { name: "Elwing" };
    const Fraktar = observable({ hp: 3, quests: new Map([[giver, "wall"]]) });
    const recorder = createStepRecorder(Fraktar);
    recorder.start();
    runInAction(() => {
      Fraktar.hp = 10;
      // The key reads '{"name":"Elwing"}' until somebody renames Elwing, and
      // nothing tells when.
      giver.name = "Elwing the second";
    });

    expect(() => recorder.read().patches).toThrowError(
      refused("an object used as the key of a Map at /quests")
    );
  });

  it("should not have a step told which gives him a date", function () {
    const Fraktar = observable<Record<string, unknown>>({ hp: 3 });
    const recorder = createStepRecorder(Fraktar);
    recorder.start();
    const read = recorder.read();
    runInAction(() => {
      Fraktar.bornAt = new Date(0);
    });

    // Whoever reads late is not told either: the date can be written in
    // from now on.
    expect(() => read.inversePatches).toThrowError(
      refused("a Date at /bornAt")
    );
  });

  it("should not have a step told when his class leaves a field out", function () {
    class Hero {
      hp = 3;
      hits = 0;
      constructor() {
        makeObservable(this, { hp: observable });
      }
    }
    const party = observable({ leader: new Hero() });
    const recorder = createStepRecorder(party);
    recorder.start();
    runInAction(() => {
      party.leader.hp--;
      // A JSON copy shows this field, and no patch would tell this write.
      party.leader.hits++;
    });

    expect(() => recorder.read().patches).toThrowError(
      refused("a field which is not observable at /leader/hits")
    );
  });

  it("should not have a step told which gives him a field his class left out", function () {
    class Archer {
      hp = 3;
      target?: string;
      constructor() {
        makeAutoObservable(this);
      }
    }
    const party = observable({ leader: new Archer() });
    const recorder = createStepRecorder(party);
    recorder.start();
    runInAction(() => {
      party.leader.hp--;
      party.leader.target = "orc";
    });

    expect(() => recorder.read().patches).toThrowError(
      /the model holds a field which is not observable/
    );
  });

  it("should have his steps told again once he holds none", function () {
    const Fraktar = observable<Record<string, unknown>>({
      hp: 3,
      bornAt: new Date(0),
    });
    const recorder = createStepRecorder(Fraktar);
    recorder.start();
    runInAction(() => {
      // Kept as a text instead.
      Fraktar.bornAt = "1970-01-01T00:00:00.000Z";
    });
    recorder.stop();

    recorder.start();
    runInAction(() => {
      Fraktar.hp = 10;
    });

    expect(recorder.read().patches).toEqual([
      [{ op: "replace", path: "/hp", value: 10 }],
    ]);
  });
});

describe("a hero somebody listened to before the recorder, and writes in when told", function () {
  it("should not have his steps told: they were heard in the wrong order", function () {
    const Fraktar = observable({ hp: 3 });
    observe(Fraktar, "hp", ({ newValue }) => {
      if (newValue > 5) {
        Fraktar.hp = 5;
      }
    });
    const recorder = createStepRecorder(Fraktar);
    recorder.start();
    runInAction(() => {
      Fraktar.hp = 9;
    });

    // Told as heard, 5 then 9, the journal would end on 9.
    expect(() => recorder.read().patches).toThrowError(
      "[RAVIOLI] The patches of this step can not be written: a listener " +
        "wrote in a node of the model while it was told of a write in it: " +
        "the two writes were heard in the wrong order."
    );
  });
});

describe("a quest log which has two keys reading the same", function () {
  /**
   * What reading the patches of a mutator answers.
   */
  function refusal(mutator: (quests: Map<unknown, string>) => void) {
    const Fraktar = observable({
      quests: new Map<unknown, string>([[1, "one"]]),
    });
    const recorder = createStepRecorder(Fraktar);
    recorder.start();
    runInAction(() => mutator(Fraktar.quests));
    const read = recorder.read();
    try {
      read.patches;
    } catch (error) {
      return (error as Error).message;
    }
    return "written";
  }

  it("should not be told at all when the second key comes", function () {
    // 1 and "1" are one key in a JSON copy: which entry would it hold?
    expect(refusal((quests) => quests.set("1", "text one"))).toBe(
      "[RAVIOLI] The patches of this step can not be written: " +
        'two keys of a Map read "1" in a JSON copy.'
    );
  });

  it("should not be told when one of the two is written or leaves", function () {
    const refused =
      "[RAVIOLI] The patches of this step can not be written: " +
      'two keys of a Map read "1" in a JSON copy.';

    expect(
      refusal((quests) => {
        quests.set("1", "text one");
        quests.set(1, "another one");
      })
    ).toBe(refused);
    expect(
      refusal((quests) => {
        quests.set("1", "text one");
        quests.delete(1);
      })
    ).toBe(refused);
  });

  it("should not have told what is written under one of the two", function () {
    const Fraktar = observable({
      quests: new Map<unknown, { progress: number }>([
        [1, { progress: 1 }],
        ["1", { progress: 5 }],
      ]),
    });
    const recorder = createStepRecorder(Fraktar);
    recorder.start();
    runInAction(() => {
      Fraktar.quests.get(1)!.progress = 2;
    });

    // "/quests/1/progress" is the progress of the other quest in a JSON copy.
    expect(() => recorder.read().inversePatches).toThrowError(
      /two keys of a Map read "1" in a JSON copy/
    );
  });

  it("should not have told what is written under two keys which are not texts", function () {
    const Fraktar = observable({
      quests: new Map<unknown, { progress: number }>([
        [1, { progress: 1 }],
        [BigInt(1), { progress: 5 }],
        ["dragon", { progress: 0 }],
      ]),
    });
    const recorder = createStepRecorder(Fraktar);
    recorder.start();
    runInAction(() => {
      Fraktar.quests.get(1)!.progress = 2;
    });

    expect(() => recorder.read().patches).toThrowError(
      /two keys of a Map read "1" in a JSON copy/
    );
  });

  it("should be told again once the keys do not read the same anymore", function () {
    const Fraktar = observable({
      quests: new Map<unknown, string>([
        [1, "one"],
        ["1", "text one"],
      ]),
    });
    runInAction(() => {
      Fraktar.quests.delete(1);
    });

    const { patches, before, after, replayed, rewound } = record(
      Fraktar,
      (hero) => {
        hero.quests.set("1", "the only one");
        hero.quests.set(2, "two");
        hero.quests.set("dragon", "three");
        hero.quests.delete(2);
      }
    );

    expect(patches).toEqual([
      [{ op: "replace", path: "/quests/1", value: "the only one" }],
      [{ op: "add", path: "/quests/2", value: "two" }],
      [{ op: "add", path: "/quests/dragon", value: "three" }],
      [{ op: "remove", path: "/quests/2" }],
    ]);
    expect(replayed).toEqual(after);
    expect(rewound).toEqual(before);
  });
});

describe("the status effects", function () {
  it("should be told as an object, each effect a key which is true", function () {
    const Fraktar = observable({ effects: new Set(["poisoned", "blessed"]) });

    const { patches, inversePatches, before, after, replayed, rewound } =
      record(Fraktar, (hero) => {
        hero.effects.add("burning");
        hero.effects.delete("poisoned");
      });

    expect(patches).toEqual([
      [{ op: "add", path: "/effects/burning", value: true }],
      [{ op: "remove", path: "/effects/poisoned" }],
    ]);
    expect(inversePatches).toEqual([
      [{ op: "add", path: "/effects/poisoned", value: true }],
      [{ op: "remove", path: "/effects/burning" }],
    ]);
    expect(replayed).toEqual(after);
    expect(rewound).toEqual(before);
  });

  it("should replay when many effects come and go in one record", function () {
    const Fraktar = observable({ effects: new Set<string>() });

    const { patches, before, after, replayed, rewound } = record(
      Fraktar,
      (hero) => {
        for (let effect = 0; effect < 50; effect++) {
          hero.effects.add(`curse ${effect}`);
        }
        hero.effects.delete("curse 7");
        hero.effects.add("curse 7");
      }
    );

    expect(patches.length).toBe(52);
    expect(replayed).toEqual(after);
    expect(rewound).toEqual(before);
  });

  it("should tell once an effect which is there as a number and as a text", function () {
    const Fraktar = observable({ levels: new Set<unknown>([1]) });

    const { patches, inversePatches, before, after, replayed, rewound } =
      record(Fraktar, (hero) => {
        // The same key in a JSON copy: it is already there, then it stays.
        hero.levels.add("1");
        hero.levels.delete(1);
        hero.levels.delete("1");
      });

    expect(patches).toEqual([[{ op: "remove", path: "/levels/1" }]]);
    expect(inversePatches).toEqual([
      [{ op: "add", path: "/levels/1", value: true }],
    ]);
    expect(replayed).toEqual(after);
    expect(rewound).toEqual(before);
  });
});

describe("the party, a set of heroes", function () {
  type Member = { name: string; hp: number };

  it("should name a member by the text of what it holds", function () {
    const Fraktar = observable({ party: new Set<Member>() });

    const { patches, inversePatches, before, after, replayed, rewound } =
      record(Fraktar, (hero) => {
        hero.party.add({ name: "Elwing", hp: 5 });
      });

    // Its keys are sorted: a member reads the same whatever the order they
    // were written in.
    expect(patches).toEqual([
      [{ op: "add", path: '/party/{"hp":5,"name":"Elwing"}', value: true }],
    ]);
    expect(inversePatches).toEqual([
      [{ op: "remove", path: '/party/{"hp":5,"name":"Elwing"}' }],
    ]);
    expect(replayed).toEqual(after);
    expect(rewound).toEqual(before);
  });

  it("should rename a member when something is written in it", function () {
    const Fraktar = observable({
      party: new Set<Member>([{ name: "Elwing", hp: 5 }]),
    });
    const Elwing = Array.from(Fraktar.party)[0];

    const { patches, inversePatches, before, after, replayed, rewound } =
      record(Fraktar, (hero) => {
        Elwing.hp = 0;
        hero.party.delete(Elwing);
      });

    // Nothing is under a key: the key itself is what changed.
    expect(patches).toEqual([
      [
        { op: "remove", path: '/party/{"hp":5,"name":"Elwing"}' },
        { op: "add", path: '/party/{"hp":0,"name":"Elwing"}', value: true },
      ],
      [{ op: "remove", path: '/party/{"hp":0,"name":"Elwing"}' }],
    ]);
    expect(inversePatches).toEqual([
      [{ op: "add", path: '/party/{"hp":0,"name":"Elwing"}', value: true }],
      [
        { op: "remove", path: '/party/{"hp":0,"name":"Elwing"}' },
        { op: "add", path: '/party/{"hp":5,"name":"Elwing"}', value: true },
      ],
    ]);
    expect(replayed).toEqual(after);
    expect(rewound).toEqual(before);
  });

  it("should tell nothing of a write which does not change how a member reads", function () {
    const Fraktar = observable({ party: new Set<Record<string, unknown>>() });
    runInAction(() => {
      Fraktar.party.add({ name: "Elwing" });
    });
    const Elwing = Array.from(Fraktar.party)[0];

    const { patches, inversePatches } = record(Fraktar, () => {
      // JSON does not hold a function: the key of the member is the same.
      Elwing.shout = () => "For the Alliance!";
    });

    expect(patches).toEqual([]);
    expect(inversePatches).toEqual([]);
  });

  it("should keep the key of two members who read the same until both left", function () {
    const Fraktar = observable({
      party: new Set<Member>([
        { name: "Elwing", hp: 5 },
        { name: "Elwing", hp: 3 },
      ]),
    });
    const [first, twin] = Array.from(Fraktar.party);

    const { patches, before, after, replayed, rewound } = record(
      Fraktar,
      (hero) => {
        // Now they read the same: one key for both.
        twin.hp = 5;
        hero.party.delete(first);
        hero.party.delete(twin);
      }
    );

    expect(patches).toEqual([
      [{ op: "remove", path: '/party/{"hp":3,"name":"Elwing"}' }],
      [{ op: "remove", path: '/party/{"hp":5,"name":"Elwing"}' }],
    ]);
    expect(replayed).toEqual(after);
    expect(rewound).toEqual(before);
  });

  it("should tell once what is written deep in a member, however it is reached", function () {
    const sword = observable({ damage: 3 });
    const Fraktar = observable({
      party: new Set([
        { name: "Elwing", hands: { left: sword, right: sword } },
      ]),
    });

    const { patches, before, after, replayed, rewound } = record(
      Fraktar,
      () => {
        sword.damage = 9;
      }
    );

    // Two ways lead to the sword inside the member: the member is renamed once.
    expect(patches.length).toBe(1);
    expect(patches[0].map(({ op }) => op)).toEqual(["remove", "add"]);
    expect(replayed).toEqual(after);
    expect(rewound).toEqual(before);
  });

  it("should tell on the outer set what is written in a set kept by a member", function () {
    const Fraktar = observable({
      party: new Set([{ name: "Elwing", effects: new Set(["blessed"]) }]),
    });
    const Elwing = Array.from(Fraktar.party)[0];

    const { patches, before, after, replayed, rewound } = record(
      Fraktar,
      () => {
        Elwing.effects.add("burning");
      }
    );

    expect(patches).toEqual([
      [
        {
          op: "remove",
          path: '/party/{"effects":{"blessed":true},"name":"Elwing"}',
        },
        {
          op: "add",
          path: '/party/{"effects":{"blessed":true,"burning":true},"name":"Elwing"}',
          value: true,
        },
      ],
    ]);
    expect(replayed).toEqual(after);
    expect(rewound).toEqual(before);
  });

  it("should count both members who share a guild when the guild is renamed", function () {
    const guild = observable({ name: "Warfog" });
    const Fraktar = observable({
      party: new Set<{ guild: { name: string }; rank: number }>([
        { guild, rank: 1 },
        { guild, rank: 2 },
      ]),
    });

    const { patches, before, rewound } = record(Fraktar, (hero) => {
      // Reads as the second member does, for now.
      hero.party.add({ guild: { name: "Warfog" }, rank: 2 });
      guild.name = "Horde";
    });

    // The key was already there: the newcomer adds nothing.
    expect(patches.length).toBe(1);
    expect(rewound).toEqual(before);
  });

  it("should count once the member who is written in, in a party held at two places", function () {
    const Fraktar = observable({
      party: new Set([{ rank: 1 }, { rank: 9 }]),
      guests: new Set<{ rank: number }>(),
    });
    runInAction(() => {
      Fraktar.guests = Fraktar.party;
    });
    const [first, second] = Array.from(Fraktar.party);

    const { patches, after, replayed } = record(Fraktar, (hero) => {
      hero.party.delete(second);
      first.rank = 9;
    });

    expect(patches[0]).toEqual([
      { op: "remove", path: '/party/{"rank":9}' },
      { op: "remove", path: '/guests/{"rank":9}' },
    ]);
    expect(replayed).toEqual(after);
  });

  it("should count a hero who is in two parties in each of them", function () {
    const Fraktar = observable({
      vanguard: new Set([{ rank: 1 }]),
      rearguard: new Set<{ rank: number }>(),
    });
    const [first] = Array.from(Fraktar.vanguard);
    runInAction(() => {
      Fraktar.rearguard.add(first);
      Fraktar.rearguard.add({ rank: 9 });
    });
    const second = Array.from(Fraktar.rearguard)[1];

    const { patches, after, replayed } = record(Fraktar, (hero) => {
      hero.rearguard.delete(second);
      first.rank = 9;
    });

    expect(patches[0]).toEqual([
      { op: "remove", path: '/rearguard/{"rank":9}' },
    ]);
    expect(replayed).toEqual(after);
  });

  it("should tell a member who joined as he was then, whatever is written in him once the step is read", function () {
    const Fraktar = observable({ party: new Set<{ name: string }>() });
    const recorder = createStepRecorder(Fraktar);
    recorder.start();
    runInAction(() => {
      Fraktar.party.add({ name: "Elwing" });
    });
    const read = recorder.read();
    // Somebody else, while the step is saved.
    runInAction(() => {
      Array.from(Fraktar.party)[0].name = "Elwing the second";
    });

    expect(read.patches).toEqual([
      [{ op: "add", path: '/party/{"name":"Elwing"}', value: true }],
    ]);
  });

  it("should tell a member the step writes in right after he joined as he ends up", function () {
    const Fraktar = observable({ party: new Set<{ name: string }>() });

    const { patches, after, replayed } = record(Fraktar, (hero) => {
      hero.party.add({ name: "Elwing" });
      // MobX tells what the set was given, not what it made of it: this
      // write is the same one for whoever listens.
      Array.from(hero.party)[0].name = "Elwing the second";
    });

    expect(patches).toEqual([
      [{ op: "add", path: '/party/{"name":"Elwing the second"}', value: true }],
    ]);
    expect(replayed).toEqual(after);
  });

  it("should count its members again once it is back from where nothing is told", function () {
    const Fraktar = observable<{ party?: Set<{ rank: number }> }>({
      party: new Set([{ rank: 0 }]),
    });
    const party = Fraktar.party as Set<{ rank: number }>;
    const [member] = Array.from(party);

    const { patches, before, after, replayed, rewound } = record(
      Fraktar,
      (hero) => {
        member.rank = 1;
        hero.party = undefined;
        // Out of the model: this one is told nowhere.
        member.rank = 5;
        hero.party = party;
        member.rank = 6;
      }
    );

    expect(patches[0]).toEqual([
      { op: "remove", path: '/party/{"rank":0}' },
      { op: "add", path: '/party/{"rank":1}', value: true },
    ]);
    expect(replayed).toEqual(after);
    expect(rewound).toEqual(before);
  });
});

describe("a boxed value", function () {
  it("should be told where the box is: a box is not a place of its own", function () {
    const Fraktar = observable<Record<string, any>>({
      hp: observable.box(3),
      stats: observable.box({ mp: 2 }),
      shout: observable.box<unknown>(undefined),
    });

    const { patches, inversePatches, before, after, replayed, rewound } =
      record(Fraktar, (hero) => {
        hero.hp.set(10);
        hero.stats.get().mp = 5;
        hero.stats.set({ mp: 0 });
        hero.shout.set(() => "For the Horde!");
      });

    expect(patches).toEqual([
      [{ op: "replace", path: "/hp", value: 10 }],
      [{ op: "replace", path: "/stats/mp", value: 5 }],
      [{ op: "replace", path: "/stats", value: { mp: 0 } }],
    ]);
    expect(inversePatches).toEqual([
      [{ op: "replace", path: "/stats", value: { mp: 5 } }],
      [{ op: "replace", path: "/stats/mp", value: 2 }],
      [{ op: "replace", path: "/hp", value: 3 }],
    ]);
    expect(replayed).toEqual(after);
    expect(rewound).toEqual(before);
  });

  it("should tell what a field holds once the box it was in is put there", function () {
    const Fraktar = observable<Record<string, any>>({ hp: 3 });

    const { patches, before, after, replayed, rewound } = record(
      Fraktar,
      (hero) => {
        const mana = observable.box(2);
        hero.mp = mana;
        mana.set(5);
        hero.armor = observable.box(1);
      }
    );

    expect(patches).toEqual([
      [{ op: "add", path: "/mp", value: 2 }],
      [{ op: "replace", path: "/mp", value: 5 }],
      [{ op: "add", path: "/armor", value: 1 }],
    ]);
    expect(replayed).toEqual(after);
    expect(rewound).toEqual(before);
  });

  it("should be told when it is the hero himself", function () {
    const Fraktar = observable.box<unknown>({ hp: 3 });

    const { patches, inversePatches } = record(Fraktar, (hero) => {
      hero.set(undefined);
    });

    // Not an item of a list: nothing is left where it was.
    expect(patches).toEqual([[{ op: "remove", path: "" }]]);
    expect(inversePatches).toEqual([
      [{ op: "add", path: "", value: { hp: 3 } }],
    ]);
  });
});

describe("the party, heroes who know each other", function () {
  it("should tell at each of its places what is written in a shared guild", function () {
    const guild = observable({ name: "Warfog" });
    const party = observable({ Fraktar: { guild }, Elwing: { guild } });

    const { patches, before, after, replayed, rewound } = record(
      party,
      (members) => {
        members.Fraktar.guild.name = "Horde";
      }
    );

    // One write, so one patch.
    expect(patches).toEqual([
      [
        { op: "replace", path: "/Fraktar/guild/name", value: "Horde" },
        { op: "replace", path: "/Elwing/guild/name", value: "Horde" },
      ],
    ]);
    expect(replayed).toEqual(after);
    expect(rewound).toEqual(before);
  });

  it("should tell a hero who stands twice in the line at both places", function () {
    const Fraktar = observable({ name: "Fraktar", hp: 3 });
    const party = observable({
      line: [Fraktar, { name: "Elwing", hp: 5 }, Fraktar],
    });

    const { patches, before, after, replayed, rewound } = record(
      party,
      (members) => {
        members.line.unshift({ name: "Thrall", hp: 9 });
        Fraktar.hp = 0;
        members.line.splice(0, 2);
        Fraktar.hp = 1;
      }
    );

    expect(patches[1]).toEqual([
      { op: "replace", path: "/line/1/hp", value: 0 },
      { op: "replace", path: "/line/3/hp", value: 0 },
    ]);
    expect(patches[3]).toEqual([
      { op: "replace", path: "/line/1/hp", value: 1 },
    ]);
    expect(replayed).toEqual(after);
    expect(rewound).toEqual(before);
  });

  it("should stop where a member points back to the party, as a JSON copy does", function () {
    const party = observable<any>({
      leader: "Fraktar",
      next: { leader: "Elwing" },
    });
    runInAction(() => {
      party.next.next = party;
      party.next.rival = { name: "Dreadbond", rival: party.next };
    });

    const { patches, before, after, replayed, rewound } = record(
      party,
      (members) => {
        members.next.next.leader = "Thrall";
        members.next.rival.rival.leader = "Elwing the second";
      }
    );

    expect(patches).toEqual([
      [{ op: "replace", path: "/leader", value: "Thrall" }],
      [{ op: "replace", path: "/next/leader", value: "Elwing the second" }],
    ]);
    expect(replayed).toEqual(after);
    expect(rewound).toEqual(before);
  });

  it("should not be replayed when a member of the party holds the party: its name is another one in the patch", function () {
    const party = observable.set<{ name: string; party?: unknown }>();
    const Elwing = observable<{ name: string; party?: unknown }>({
      name: "Elwing",
    });
    runInAction(() => {
      Elwing.party = party;
      party.add(Elwing);
    });
    const Fraktar = observable({ party });
    const before = jsonCopy(Fraktar);
    const recorder = createStepRecorder(Fraktar);
    recorder.start();
    runInAction(() => {
      Elwing.name = "Elwing the second";
    });
    const { patches } = recorder.read();

    // A JSON copy stops at the party it started from. The patch names the
    // member from the member, and stops one turn later.
    expect(before).toEqual({
      party: { '{"name":"Elwing","party":"[Circular]"}': true },
    });
    expect(patches[0][0]).toEqual({
      op: "remove",
      path: '/party/{"name":"Elwing","party":{"\\"[Circular]\\"":true}}',
    });
    expect(() => patches.reduce(applyPatch, jsonCopy(before))).toThrowError(
      /nothing is at \/party/
    );
  });
});

describe("the patches of a record", function () {
  it("should copy nothing of the hero until they are read", function () {
    const Fraktar = observable({ chest: { gold: 5 } });
    const old = Fraktar.chest;
    const recorder = createStepRecorder(Fraktar);
    recorder.start();
    runInAction(() => {
      Fraktar.chest = { gold: 100 };
    });
    // MobX tells when somebody it follows looks at the gold of a chest.
    const looks: number[] = [];
    [old, Fraktar.chest].forEach((chest) =>
      onBecomeObserved(chest, "gold", () => looks.push(chest.gold))
    );
    const follow = (look: () => void) => autorun(look)();

    let read = recorder.read();
    follow(() => {
      read = recorder.read();
    });

    expect(looks).toEqual([]);

    // Each way copies what it puts, and only that.
    follow(() => read.patches);
    expect(read.patches).toEqual([
      [{ op: "replace", path: "/chest", value: { gold: 100 } }],
    ]);
    expect(looks).toEqual([100]);
    follow(() => read.inversePatches);
    expect(read.inversePatches).toEqual([
      [{ op: "replace", path: "/chest", value: { gold: 5 } }],
    ]);
    expect(looks).toEqual([100, 5]);
  });

  it("should be written once, however often they are read", function () {
    const Fraktar = observable({ hp: 3 });
    const recorder = createStepRecorder(Fraktar);
    recorder.start();
    runInAction(() => {
      Fraktar.hp = 10;
    });
    const read = recorder.read();

    expect(read.patches).toBe(read.patches);
    expect(read.inversePatches).toBe(read.inversePatches);
  });

  it("should not tell what is written after they were asked for", function () {
    const Fraktar = observable({ hp: 3, inventory: ["sword"] });
    const recorder = createStepRecorder(Fraktar);
    recorder.start();
    runInAction(() => {
      Fraktar.inventory.push("shield");
    });
    const read = recorder.read();
    runInAction(() => {
      Fraktar.hp = 10;
      Fraktar.inventory.shift();
    });

    // Asked for after the shield, read after the rest: only the shield, and
    // at the place it had then.
    expect(read.patches).toEqual([
      [{ op: "add", path: "/inventory/1", value: "shield" }],
    ]);
    expect(read.inversePatches).toEqual([
      [{ op: "remove", path: "/inventory/1" }],
    ]);
  });

  it("should not be read once the record is over", function () {
    const Fraktar = observable({ hp: 3 });
    const recorder = createStepRecorder(Fraktar);
    recorder.start();
    runInAction(() => {
      Fraktar.hp = 10;
    });
    const read = recorder.read();
    recorder.stop();

    // The model has moved on: nothing could tell what it held anymore.
    expect(() => read.patches).toThrowError(
      /The patches of a step are read while its reactions run/
    );
    expect(() => read.inversePatches).toThrowError(
      /The patches of a step are read while its reactions run/
    );
  });

  it("should stay what they were when they were read before the record is over", function () {
    const Fraktar = observable({ hp: 3 });
    const recorder = createStepRecorder(Fraktar);
    recorder.start();
    runInAction(() => {
      Fraktar.hp = 10;
    });
    const read = recorder.read();
    const { patches } = read;
    recorder.stop();
    runInAction(() => {
      Fraktar.hp = 0;
    });

    expect(read.patches).toBe(patches);
    expect(patches).toEqual([[{ op: "replace", path: "/hp", value: 10 }]]);
  });

  it("should be none when no record runs", function () {
    const recorder = createStepRecorder(observable({ hp: 3 }));

    expect(recorder.read()).toEqual({ patches: [], inversePatches: [] });
  });

  it("should not be read once the record was taken back", function () {
    const Fraktar = observable({ hp: 3 });
    const recorder = createStepRecorder(Fraktar);
    recorder.start();
    runInAction(() => {
      Fraktar.hp = 5;
    });
    const read = recorder.read();
    recorder.undo();

    expect(() => read.patches).toThrowError(
      "[RAVIOLI] The patches of a step are read while its reactions run. " +
        "A reaction which is not awaited reads them before it waits on anything."
    );
  });

  it("should not be read once another record runs", function () {
    const Fraktar = observable({ hp: 3 });
    const recorder = createStepRecorder(Fraktar);
    recorder.start();
    runInAction(() => {
      Fraktar.hp = 5;
    });
    const read = recorder.read();
    recorder.stop();
    recorder.start();

    expect(() => read.patches).toThrowError(/read while its reactions run/);
  });
});

describe("several writes in one node, in one record", function () {
  it("should tell two items pushed at once each at its own place", function () {
    const Fraktar = observable({
      inventory: [] as Array<{ id: string; quantity: number }>,
    });

    const { patches, before, after, replayed, rewound } = record(
      Fraktar,
      (hero) => {
        hero.inventory.push(
          { id: "sword", quantity: 1 },
          { id: "shield", quantity: 1 }
        );
        hero.inventory[1].quantity = 3;
      }
    );

    expect(patches[1]).toEqual(
      [[{ op: "replace", path: "/inventory/1/quantity", value: 3 }]][0]
    );
    expect(replayed).toEqual(after);
    expect(rewound).toEqual(before);
  });

  it("should tell each of many items written in one list, one of them held twice", function () {
    const Fraktar = observable({
      inventory: Array.from({ length: 12 }, (_, id) => ({ id, uses: 0 })),
    });
    const twice = Fraktar.inventory[3];
    runInAction(() => {
      Fraktar.inventory.push(twice);
    });

    const { patches, before, after, replayed, rewound } = record(
      Fraktar,
      (hero) => {
        hero.inventory.slice(0, 12).forEach((item) => {
          item.uses++;
        });
      }
    );

    expect(patches.length).toBe(12);
    expect(patches[3]).toEqual([
      { op: "replace", path: "/inventory/3/uses", value: 1 },
      { op: "replace", path: "/inventory/12/uses", value: 1 },
    ]);
    expect(patches[11]).toEqual([
      { op: "replace", path: "/inventory/11/uses", value: 1 },
    ]);
    expect(replayed).toEqual(after);
    expect(rewound).toEqual(before);
  });

  it("should tell each of many items at the place it had then, the list losing one meanwhile", function () {
    const Fraktar = observable({
      inventory: Array.from({ length: 21 }, (_, id) => ({ id, uses: 0 })),
    });

    const { patches, after, replayed } = record(Fraktar, (hero) => {
      hero.inventory.slice(11).forEach((item) => {
        item.uses = 1;
      });
      hero.inventory.shift();
      hero.inventory.slice(10).forEach((item) => {
        item.uses = 2;
      });
    });

    expect(patches.slice(0, 10).map(([{ path }]) => path)).toEqual(
      Array.from({ length: 10 }, (_, at) => `/inventory/${at + 11}/uses`)
    );
    expect(patches.slice(11).map(([{ path }]) => path)).toEqual(
      Array.from({ length: 10 }, (_, at) => `/inventory/${at + 10}/uses`)
    );
    expect(replayed).toEqual(after);
  });

  it("should tell a sheet which is put in the camp as it was then, without its field named by a symbol", function () {
    const north = Symbol("north");
    const sheet = observable<Record<string | symbol, number>>({
      hp: 3,
      [north]: 1,
    });
    const Fraktar = observable<{ camp: { sheet?: object } }>({ camp: {} });

    const { patches } = record(Fraktar, (hero) => {
      hero.camp.sheet = sheet;
      sheet[north] = 2;
    });

    expect(patches).toEqual([
      [{ op: "add", path: "/camp/sheet", value: { hp: 3 } }],
    ]);
  });

  it("should tell a quest log which is put in the camp as it was then, under a key which is a symbol", function () {
    const north = Symbol("north");
    const quests = observable(new Map<unknown, number>([[north, 1]]));
    const Fraktar = observable<{ camp: { quests?: object } }>({ camp: {} });

    const { patches } = record(Fraktar, (hero) => {
      hero.camp.quests = quests;
      quests.set(north, 2);
    });

    expect(patches[0]).toEqual([
      { op: "add", path: "/camp/quests", value: { "Symbol(north)": 1 } },
    ]);
  });

  it("should tell a splice from the length the list had then, not later", function () {
    const Fraktar = observable({ inventory: ["sword", "shield", "bow"] });

    const { patches, before, after, replayed, rewound } = record(
      Fraktar,
      (hero) => {
        // Two for two: nothing is left of what the list held.
        hero.inventory.splice(1, 2, "axe", "rope");
        hero.inventory.push("torch");
      }
    );

    expect(patches).toEqual([
      [
        { op: "remove", path: "/inventory/1" },
        { op: "remove", path: "/inventory/1" },
        { op: "add", path: "/inventory/1", value: "axe" },
        { op: "add", path: "/inventory/2", value: "rope" },
      ],
      [{ op: "add", path: "/inventory/3", value: "torch" }],
    ]);
    expect(replayed).toEqual(after);
    expect(rewound).toEqual(before);
  });

  it("should tell two members of a set who take the same name one after the other", function () {
    const Fraktar = observable({
      party: new Set([{ name: "Rex" }, { name: "Bob" }]),
    });
    const [first, second] = Array.from(Fraktar.party);

    const { patches, before, after, replayed, rewound } = record(
      Fraktar,
      () => {
        first.name = "Tom";
        second.name = "Tom";
      }
    );

    expect(patches).toEqual([
      [
        { op: "remove", path: '/party/{"name":"Rex"}' },
        { op: "add", path: '/party/{"name":"Tom"}', value: true },
      ],
      // The key is already there, for the first of them.
      [{ op: "remove", path: '/party/{"name":"Bob"}' }],
    ]);
    expect(replayed).toEqual(after);
    expect(rewound).toEqual(before);
  });

  it("should tell a member right when its set left and came back meanwhile", function () {
    const Fraktar = observable<Record<string, any>>({
      party: new Set([{ name: "Rex", tricks: [] as string[] }]),
    });
    const Rex = Array.from<any>(Fraktar.party)[0];

    const { before, after, replayed, rewound } = record(Fraktar, (hero) => {
      Rex.name = "Rexy";
      const party = hero.party;
      delete hero.party;
      // Out of the model: no patch tells this, and Rex reads otherwise.
      Rex.tricks.push("sit");
      hero.party = party;
      Rex.name = "Rex";
    });

    expect(replayed).toEqual(after);
    expect(rewound).toEqual(before);
  });

  it("should tell a box which holds nothing as the member it reads as", function () {
    const Fraktar = observable({ effects: new Set<unknown>(["blessed"]) });

    const { patches, before, after, replayed, rewound } = record(
      Fraktar,
      (hero) => {
        hero.effects.add(observable.box(undefined));
      }
    );

    // What a JSON copy names it by: it has no JSON of its own.
    expect(after).toEqual({ effects: { blessed: true, undefined: true } });
    expect(patches).toEqual([
      [{ op: "add", path: "/effects/undefined", value: true }],
    ]);
    expect(replayed).toEqual(after);
    expect(rewound).toEqual(before);
  });

  it("should tell a set which holds heroes and plain effects alike", function () {
    const Fraktar = observable({
      party: new Set<unknown>([{ name: "Rex" }, "blessed"]),
    });
    const Rex = Array.from(Fraktar.party)[0] as { name: string };

    const { before, after, replayed, rewound } = record(Fraktar, (hero) => {
      Rex.name = "Rexy";
      hero.party.delete("blessed");
      Rex.name = "Rex";
      hero.party.add("blessed");
    });

    expect(replayed).toEqual(after);
    expect(rewound).toEqual(before);
  });

  it("should tell a box by what it held then, written twice", function () {
    const Fraktar = observable<Record<string, any>>({
      shout: observable.box<unknown>(undefined),
    });

    const { patches, inversePatches } = record(Fraktar, (hero) => {
      hero.shout.set("For the Horde!");
      hero.shout.set("For the Alliance!");
    });

    // Not there, then there: an add and a replace, not two replaces.
    expect(patches).toEqual([
      [{ op: "add", path: "/shout", value: "For the Horde!" }],
      [{ op: "replace", path: "/shout", value: "For the Alliance!" }],
    ]);
    expect(inversePatches).toEqual([
      [{ op: "replace", path: "/shout", value: "For the Horde!" }],
      [{ op: "remove", path: "/shout" }],
    ]);
  });

  it("should tell nothing of a field named by a symbol on a sheet which moves", function () {
    const sigil = Symbol("sigil");
    const Fraktar = observable<Record<string, any>>({ pet: { name: "Rex" } });

    const { patches, before, after, replayed, rewound } = record(
      Fraktar,
      (hero) => {
        const pet = hero.pet;
        pet[sigil] = "warfog";
        delete hero.pet;
        hero.mount = pet;
      }
    );

    expect(patches).toEqual([
      [{ op: "remove", path: "/pet" }],
      [{ op: "add", path: "/mount", value: { name: "Rex" } }],
    ]);
    expect(replayed).toEqual(after);
    expect(rewound).toEqual(before);
  });
});

describe("a quest log whose keys are not all texts", function () {
  it("should not be told when one of two keys reading the same leaves", function () {
    const Fraktar = observable({
      quests: new Map<unknown, string>([
        [1, "one"],
        ["1", "text one"],
      ]),
    });
    const recorder = createStepRecorder(Fraktar);
    recorder.start();
    runInAction(() => {
      Fraktar.quests.delete(1);
    });

    expect(() => recorder.read().patches).toThrowError(
      /two keys of a Map read "1" in a JSON copy/
    );
  });

  it("should tell a quest under a text when another key is a number", function () {
    const Fraktar = observable({
      quests: new Map<unknown, string>([[7, "seven dwarves"]]),
    });

    const { patches } = record(Fraktar, (hero) => {
      hero.quests.set("dragon", "the lair");
    });

    expect(patches).toEqual([
      [{ op: "add", path: "/quests/dragon", value: "the lair" }],
    ]);
  });

  it("should tell what is written under a key which is a symbol", function () {
    const north = Symbol("north");
    const Fraktar = observable({
      quests: new Map<unknown, { progress: number }>([
        [north, { progress: 1 }],
      ]),
    });

    const { patches, before, after, replayed, rewound } = record(
      Fraktar,
      (hero) => {
        hero.quests.get(north)!.progress = 2;
      }
    );

    expect(patches).toEqual([
      [{ op: "replace", path: "/quests/Symbol(north)/progress", value: 2 }],
    ]);
    expect(replayed).toEqual(after);
    expect(rewound).toEqual(before);
  });

  it("should tell where a quest still is once it left the key which is not a number", function () {
    const dragon = observable({ progress: 1 });
    const Fraktar = observable({
      quests: new Map<unknown, { progress: number }>([[NaN, dragon]]),
      current: dragon,
    });

    const { patches, before, after, replayed, rewound } = record(
      Fraktar,
      (hero) => {
        hero.quests.set(NaN, { progress: 100 });
        // The quest is the current one only, from now on.
        hero.current.progress = 2;
      }
    );

    expect(patches).toEqual([
      [{ op: "replace", path: "/quests/NaN", value: { progress: 100 } }],
      [{ op: "replace", path: "/current/progress", value: 2 }],
    ]);
    expect(replayed).toEqual(after);
    expect(rewound).toEqual(before);
  });

  it("should tell a quest under a number when it is written again", function () {
    const Fraktar = observable({
      quests: new Map([[1, { progress: 1 }]]),
    });

    const { patches, after, replayed } = record(Fraktar, (hero) => {
      hero.quests.set(1, { progress: 2 });
    });

    expect(patches).toEqual([
      [{ op: "replace", path: "/quests/1", value: { progress: 2 } }],
    ]);
    expect(replayed).toEqual(after);
  });

  it("should tell a quest under a number which is written in, then replaced", function () {
    const Fraktar = observable({
      quests: new Map([[1, { progress: 1 }]]),
    });
    const dragon = Fraktar.quests.get(1) as { progress: number };

    const { patches, after, replayed } = record(Fraktar, (hero) => {
      dragon.progress = 2;
      hero.quests.set(1, { progress: 3 });
    });

    expect(patches).toEqual([
      [{ op: "replace", path: "/quests/1/progress", value: 2 }],
      [{ op: "replace", path: "/quests/1", value: { progress: 3 } }],
    ]);
    expect(replayed).toEqual(after);
  });

  it("should tell a quest which leaves under a number and comes back under the same text", function () {
    const Fraktar = observable({
      quests: new Map<unknown, number>([[1, 5]]),
    });

    const { patches, before, after, replayed, rewound } = record(
      Fraktar,
      (hero) => {
        hero.quests.delete(1);
        hero.quests.set("1", 6);
      }
    );

    // One key at a time reads "1": nothing to refuse.
    expect(patches).toEqual([
      [{ op: "remove", path: "/quests/1" }],
      [{ op: "add", path: "/quests/1", value: 6 }],
    ]);
    expect(replayed).toEqual(after);
    expect(rewound).toEqual(before);
  });

  it("should tell a quest which leaves under a text and comes back under the same number", function () {
    const Fraktar = observable({ quests: new Map<unknown, number>() });

    const { patches, after, replayed } = record(Fraktar, (hero) => {
      hero.quests.set("1", 5);
      hero.quests.delete("1");
      hero.quests.set(1, 6);
    });

    expect(patches).toEqual([
      [{ op: "add", path: "/quests/1", value: 5 }],
      [{ op: "remove", path: "/quests/1" }],
      [{ op: "add", path: "/quests/1", value: 6 }],
    ]);
    expect(replayed).toEqual(after);
  });

  it("should tell a quest under the key null under the text null", function () {
    const Fraktar = observable({ quests: new Map<unknown, number>() });

    const { patches, after, replayed } = record(Fraktar, (hero) => {
      hero.quests.set(null, 1);
    });

    expect(patches).toEqual([[{ op: "add", path: "/quests/null", value: 1 }]]);
    expect(replayed).toEqual(after);
  });

  it("should not be told when it is put in another order while two keys read the same", function () {
    const Fraktar = observable({
      quests: observable.map<unknown, string>([
        [1, "one"],
        ["1", "text one"],
      ]),
    });
    const recorder = createStepRecorder(Fraktar);
    recorder.start();
    runInAction(() => {
      // Nothing is written, and a JSON copy shows the other quest.
      Fraktar.quests.replace([
        ["1", "text one"],
        [1, "one"],
      ]);
    });

    expect(() => recorder.read().patches).toThrowError(
      "[RAVIOLI] The patches of this step can not be written: two keys of " +
        'a Map read "1" in a JSON copy.'
    );
  });

  it("should be told when it is put in another order, no two keys reading the same", function () {
    const Fraktar = observable({
      quests: observable.map<unknown, string>([
        [1, "one"],
        ["2", "text two"],
      ]),
    });

    const { patches, after, replayed } = record(Fraktar, (hero) => {
      hero.quests.replace([
        ["2", "text two"],
        [1, "one"],
      ]);
      hero.quests.set(1, "one more");
    });

    // The order of its keys is not something a JSON copy has.
    expect(patches).toEqual([
      [{ op: "replace", path: "/quests/1", value: "one more" }],
    ]);
    expect(replayed).toEqual(after);
  });

  it("should not be told when a member of a set holds it and one of two keys reading the same leaves", function () {
    const Fraktar = observable({
      party: new Set([
        {
          quests: new Map<unknown, string>([
            [1, "one"],
            ["1", "text one"],
          ]),
        },
      ]),
    });
    const recorder = createStepRecorder(Fraktar);
    recorder.start();
    runInAction(() => {
      Array.from(Fraktar.party)[0].quests.delete(1);
    });

    // The member is named by its JSON, where the two keys are one.
    expect(() => recorder.read().patches).toThrowError(
      /two keys of a Map read "1" in a JSON copy/
    );
  });

  it("should be given back whole when it left the hero and one of two keys reading the same is written then", function () {
    const Fraktar = observable<{ quests: Map<unknown, unknown> | null }>({
      quests: new Map<unknown, unknown>([
        ["true", 3],
        [true, { progress: 3 }],
      ]),
    });

    const { inversePatches, before, rewound } = record(Fraktar, (hero) => {
      const quests = hero.quests as Map<unknown, unknown>;
      hero.quests = null;
      // Nobody is told of this one: the quest log is the mutator's by then.
      quests.set("true", 9);
    });

    // As a JSON copy shows it: the last of the two keys.
    expect(inversePatches).toEqual([
      [
        {
          op: "replace",
          path: "/quests",
          value: { true: { progress: 3 } },
        },
      ],
    ]);
    expect(rewound).toEqual(before);
  });

  it("should not be given back when it left the hero and one of two keys reading the same leaves it then", function () {
    const Fraktar = observable<{ quests: Map<unknown, unknown> | null }>({
      quests: new Map<unknown, unknown>([
        ["true", 3],
        [true, { progress: 3 }],
      ]),
    });
    const quests = Fraktar.quests as Map<unknown, unknown>;
    const recorder = createStepRecorder(Fraktar);
    recorder.start();
    runInAction(() => {
      Fraktar.quests = null;
      quests.clear();
    });
    const read = recorder.read();

    expect(read.patches).toEqual([
      [{ op: "replace", path: "/quests", value: null }],
    ]);
    // Which of the two stood last, and so which one a JSON copy showed, is
    // not known anymore.
    expect(() => read.inversePatches).toThrowError(
      /two keys of a Map read "true" in a JSON copy/
    );
  });
});

describe("the cost of telling a step", function () {
  /**
   * How long writing the patches of what a mutator does, both ways, keeps
   * the processor: milliseconds of its time, not of the clock, which also
   * counts what the machine does beside.
   */
  function time<T extends object>(Fraktar: T, mutator: (hero: T) => void) {
    const recorder = createStepRecorder(Fraktar);
    recorder.start();
    runInAction(() => mutator(Fraktar));
    const read = recorder.read();
    const start = process.cpuUsage();
    const operations = read.patches.length + read.inversePatches.length;
    recorder.stop();
    const { user, system } = process.cpuUsage(start);
    return { operations, spent: (user + system) / 1000 };
  }

  it("should follow the members a set of heroes loses, not their square", function () {
    const Fraktar = observable({
      party: new Set(Array.from({ length: 4000 }, (_, id) => ({ id }))),
    });

    const { operations, spent } = time(Fraktar, (hero) => hero.party.clear());

    expect(operations).toBe(8000);
    // A fraction of a second. Counting the members again at each one took
    // twenty: far apart enough, however busy the machine is.
    expect(spent).toBeLessThan(5000);
  }, 120000);

  it("should follow the items a list loses one by one, not their square", function () {
    const Fraktar = observable({
      bag: Array.from({ length: 20000 }, (_, id) => ({ id })),
    });

    const { operations, spent } = time(Fraktar, (hero) => {
      while (hero.bag.length) {
        hero.bag.pop();
      }
    });

    expect(operations).toBe(40000);
    // A fraction of a second: far from their square, however busy the machine is.
    expect(spent).toBeLessThan(5000);
  }, 120000);

  it("should give a long list back whole when it was emptied at once", function () {
    const Fraktar = observable({
      coins: Array.from({ length: 3000 }, (_, coin) => coin),
    });

    const { patches, inversePatches, before, rewound } = record(
      Fraktar,
      (hero) => {
        hero.coins.push(3000);
        (hero.coins as IObservableArray<number>).clear();
      }
    );

    expect(patches).toEqual([
      [{ op: "add", path: "/coins/3000", value: 3000 }],
      [{ op: "replace", path: "/coins", value: [] }],
    ]);
    expect(inversePatches[1]).toEqual([{ op: "remove", path: "/coins/3000" }]);
    expect(rewound).toEqual(before);
  });

  it("should give a very long list back whole, without spreading it", function () {
    const Fraktar = observable({
      coins: Array.from({ length: 300000 }, (_, coin) => coin),
    });
    const recorder = createStepRecorder(Fraktar);
    recorder.start();
    runInAction(() => {
      Fraktar.coins.push(300000);
      (Fraktar.coins as IObservableArray<number>).clear();
    });

    // Spread in one call, that many items are more than a call takes.
    expect(recorder.read().patches).toEqual([
      [{ op: "add", path: "/coins/300000", value: 300000 }],
      [{ op: "replace", path: "/coins", value: [] }],
    ]);
  });

  it("should take a long splice which leaves a tail back whole", function () {
    const Fraktar = observable({
      bag: Array.from({ length: 2000 }, (_, id) => ({ id })),
    });

    const { patches, after, replayed } = record(Fraktar, (hero) => {
      hero.bag[1999].id = -1;
      hero.bag.splice(0, 1500);
    });

    expect(patches[0]).toEqual([
      { op: "replace", path: "/bag/1999/id", value: -1 },
    ]);
    expect(replayed).toEqual(after);
  });
});
