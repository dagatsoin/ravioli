import {
  autorun,
  isObservableArray,
  isObservableMap,
  isObservableObject,
  isObservableSet,
  makeAutoObservable,
  observable,
} from "mobx";
import { reconcile } from "../../lib/derivate";

describe("the hero sheet", function () {
  it("should update, add and remove its fields", function () {
    const Fraktar = observable<Record<string, unknown>>({
      hp: 3,
      isPoisoned: true,
    });

    reconcile(Fraktar, { hp: 10, name: "Fraktar" });

    expect(JSON.parse(JSON.stringify(Fraktar))).toEqual({
      hp: 10,
      name: "Fraktar",
    });
  });

  it("should keep the identity of the nested sheets", function () {
    const Fraktar = observable({ stats: { hp: 3 }, purse: { gold: 0 } });
    const stats = Fraktar.stats;

    reconcile(Fraktar, { stats: { hp: 10 }, purse: { gold: 5 } });

    expect(Fraktar.stats).toBe(stats);
    expect(stats.hp).toBe(10);
  });

  it("should keep an observer of a nested sheet attached", function () {
    const Fraktar = observable({ stats: { hp: 3 } });
    const stats = Fraktar.stats;
    const healthBar: number[] = [];
    const dispose = autorun(() => healthBar.push(stats.hp));

    reconcile(Fraktar, { stats: { hp: 10 } });

    expect(healthBar).toEqual([3, 10]);
    dispose();
  });

  it("should notify once for a whole reconciliation", function () {
    const Fraktar = observable({ hp: 3, mp: 2 });
    let renders = 0;
    const dispose = autorun(() => {
      Fraktar.hp;
      Fraktar.mp;
      renders++;
    });

    reconcile(Fraktar, { hp: 10, mp: 8 });

    expect(renders).toBe(2);
    dispose();
  });

  it("should replace a field whose shape changed", function () {
    const Fraktar = observable<Record<string, unknown>>({ pet: { hp: 3 } });

    reconcile(Fraktar, { pet: null });
    expect(Fraktar.pet).toBeNull();

    reconcile(Fraktar, { pet: { hp: 1 } });
    expect(isObservableObject(Fraktar.pet)).toBe(true);
  });

  it("should leave a computed alone", function () {
    const Fraktar = observable({
      hp: 2,
      get isAlive() {
        return this.hp > 0;
      },
    });

    reconcile(Fraktar, { hp: 0 });

    expect(Fraktar.hp).toBe(0);
    expect(Fraktar.isAlive).toBe(false);
  });
});

describe("the inventory", function () {
  it("should grow, shrink and keep the items it keeps", function () {
    const Fraktar = observable({
      inventory: [{ id: "sword" }, { id: "shield" }],
    });
    const firstSlot = Fraktar.inventory[0];

    reconcile(Fraktar, {
      inventory: [{ id: "axe" }, { id: "shield" }, { id: "potion" }],
    });
    expect(Fraktar.inventory[0]).toBe(firstSlot);
    expect(firstSlot.id).toBe("axe");
    expect(Fraktar.inventory.map((item) => item.id)).toEqual([
      "axe",
      "shield",
      "potion",
    ]);

    reconcile(Fraktar, { inventory: [{ id: "potion" }] });
    expect(Fraktar.inventory.length).toBe(1);
    expect(Fraktar.inventory[0]).toBe(firstSlot);
  });

  it("should stay an observable array", function () {
    const Fraktar = observable({ inventory: ["sword", "shield"] });

    reconcile(Fraktar, { inventory: ["axe"] });

    expect(isObservableArray(Fraktar.inventory)).toBe(true);
  });
});

describe("the quest log", function () {
  it("should update, add and abandon quests", function () {
    const Fraktar = observable({
      quests: new Map([["dragon", { progress: 1 }]]),
    });
    const dragon = Fraktar.quests.get("dragon");

    reconcile(Fraktar, {
      quests: new Map([
        ["dragon", { progress: 3 }],
        ["goblins", { progress: 0 }],
      ]),
    });

    expect(isObservableMap(Fraktar.quests)).toBe(true);
    expect(Fraktar.quests.get("dragon")).toBe(dragon);
    expect(Fraktar.quests.get("dragon")!.progress).toBe(3);
    expect(Fraktar.quests.get("goblins")!.progress).toBe(0);

    reconcile(Fraktar, { quests: new Map([["goblins", { progress: 0 }]]) });
    expect(Fraktar.quests.has("dragon")).toBe(false);
  });
});

describe("the status effects", function () {
  it("should replace its members", function () {
    const Fraktar = observable({ effects: new Set(["poisoned", "blessed"]) });
    const effects = Fraktar.effects;

    reconcile(Fraktar, { effects: new Set(["blessed", "burning"]) });

    expect(Fraktar.effects).toBe(effects);
    expect(Array.from(Fraktar.effects)).toEqual(["blessed", "burning"]);
  });
});

describe("a boxed value", function () {
  it("should be set in place", function () {
    const hp = observable.box(3);
    const dispose = autorun(() => hp.get());

    reconcile(hp, 10);

    expect(hp.get()).toBe(10);
    dispose();
  });
});

describe("an equipment class", function () {
  class Weapon {
    constructor(public damage: number) {}
  }

  class Armor {
    public defense: number;
    constructor(defense: number) {
      this.defense = defense;
      makeAutoObservable(this);
    }
  }

  it("should be replaced when MobX keeps it opaque", function () {
    // MobX does not convert a plain class instance, so it is a value: replaced.
    const Fraktar = observable({ weapon: new Weapon(3) });

    reconcile(Fraktar, { weapon: new Weapon(9) });

    expect(Fraktar.weapon.damage).toBe(9);
  });

  it("should be reconciled in place when it is observable and of the same class", function () {
    const Fraktar = observable({ armor: new Armor(3) });
    const armor = Fraktar.armor;
    const defenses: number[] = [];
    const dispose = autorun(() => defenses.push(armor.defense));

    reconcile(Fraktar, { armor: new Armor(9) });

    expect(Fraktar.armor).toBe(armor);
    expect(defenses).toEqual([3, 9]);
    dispose();
  });

  it("should be replaced by a plain object", function () {
    const Fraktar = observable<{ armor: any }>({ armor: new Armor(3) });

    reconcile(Fraktar, { armor: { defense: 9 } });

    expect(Fraktar.armor instanceof Armor).toBe(false);
    expect(Fraktar.armor.defense).toBe(9);
  });
});

describe("the party", function () {
  it("should terminate when a member points back to the party", function () {
    const party = observable<any>({ leader: "Fraktar", next: { leader: "Elwing" } });
    const source: any = { leader: "Fraktar", next: { leader: "Elwing" } };
    source.next.next = source;

    reconcile(party, source);

    expect(party.leader).toBe("Fraktar");
    expect(party.next.leader).toBe("Elwing");
    expect(party.next.next).toBe(party);
  });

  it("should keep two members sharing the same guild", function () {
    const party = observable<any>({
      Fraktar: { guild: { name: "" } },
      Elwing: { guild: { name: "" } },
    });
    const guild = { name: "Warfog" };

    reconcile(party, { Fraktar: { guild }, Elwing: { guild } });

    expect(party.Fraktar.guild).toBe(party.Elwing.guild);
    expect(party.Fraktar.guild.name).toBe("Warfog");
  });
});

describe("a field which gets a shape it did not have", function () {
  it("should become an observable array", function () {
    const Fraktar = observable<{ inventory: any }>({ inventory: null });

    reconcile(Fraktar, { inventory: ["sword", "shield"] });

    expect(isObservableArray(Fraktar.inventory)).toBe(true);
    expect(Fraktar.inventory.slice()).toEqual(["sword", "shield"]);
  });

  it("should become an observable map", function () {
    const Fraktar = observable<{ quests: any }>({ quests: null });

    reconcile(Fraktar, { quests: new Map([["dragon", { progress: 1 }]]) });

    expect(isObservableMap(Fraktar.quests)).toBe(true);
    expect(Fraktar.quests.get("dragon").progress).toBe(1);
  });

  it("should become an observable set", function () {
    const Fraktar = observable<{ effects: any }>({ effects: null });

    reconcile(Fraktar, { effects: new Set(["poisoned"]) });

    expect(isObservableSet(Fraktar.effects)).toBe(true);
    expect(Array.from(Fraktar.effects)).toEqual(["poisoned"]);
  });
});

describe("a boxed value in the sheet", function () {
  it("should be set in place, the box stays", function () {
    const hp = observable.box(3);
    const Fraktar = observable({ hp });

    reconcile(Fraktar, { hp: 10 });

    expect(Fraktar.hp).toBe(hp);
    expect(hp.get()).toBe(10);
  });
});

describe("a computed of the sheet", function () {
  it("should not be written when the new state carries its name", function () {
    const Fraktar = observable({
      hp: 2,
      get isAlive() {
        return this.hp > 0;
      },
    });

    // A state which was read from the representation carries the derived values too.
    reconcile(Fraktar, { hp: 0, isAlive: true });

    expect(Fraktar.hp).toBe(0);
    expect(Fraktar.isAlive).toBe(false);
  });
});

describe("a target which is not observable", function () {
  it("should be left alone", function () {
    jest.spyOn(console, "error").mockImplementation(() => {});
    const Fraktar = { hp: 3 };

    reconcile(Fraktar, { hp: 10 });

    expect(Fraktar.hp).toBe(3);
    jest.restoreAllMocks();
  });
});

describe("a new state which is observable itself", function () {
  it("should be read through its box", function () {
    const hp = observable.box(3);

    reconcile(hp, observable.box(10));

    expect(hp.get()).toBe(10);
  });

  it("should update the quest log and the status effects in place", function () {
    const Fraktar = observable({
      quests: new Map([["dragon", { progress: 1 }]]),
      effects: new Set(["poisoned"]),
    });
    const quests = Fraktar.quests;
    const effects = Fraktar.effects;

    // The maps and sets of an observable state are not Map nor Set anymore.
    reconcile(
      Fraktar,
      observable({
        quests: new Map([["dragon", { progress: 3 }]]),
        effects: new Set(["blessed"]),
      })
    );

    expect(Fraktar.quests).toBe(quests);
    expect(Fraktar.quests.get("dragon")!.progress).toBe(3);
    expect(Fraktar.effects).toBe(effects);
    expect(Array.from(Fraktar.effects)).toEqual(["blessed"]);
  });
});
