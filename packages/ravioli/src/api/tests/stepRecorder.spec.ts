import {
  IObservableArray,
  ObservableSet,
  autorun,
  configure,
  extendObservable,
  intercept,
  makeAutoObservable,
  makeObservable,
  observable,
  observe,
  remove,
  runInAction,
  set,
  toJS,
} from "mobx";
import { createStepRecorder } from "../../lib/stepRecorder";

/**
 * Record what a mutator does to the hero, then take it back.
 */
function mutateThenUndo<T extends object>(
  Fraktar: T,
  mutator: (hero: T) => void
) {
  const recorder = createStepRecorder(Fraktar);
  recorder.start();
  runInAction(() => mutator(Fraktar));
  recorder.undo();
}

describe("the hero sheet", function () {
  it("should get back a field which was updated", function () {
    const Fraktar = observable({ hp: 3, name: "Fraktar" });

    mutateThenUndo(Fraktar, (hero) => {
      hero.hp = 10;
    });

    expect(toJS(Fraktar)).toEqual({ hp: 3, name: "Fraktar" });
  });

  it("should get back a field which was not a number", function () {
    const Fraktar = observable({ luck: NaN });

    mutateThenUndo(Fraktar, (hero) => {
      hero.luck = 7;
    });

    expect(Fraktar.luck).toBeNaN();
  });

  it("should lose a field which was added", function () {
    const Fraktar = observable<Record<string, unknown>>({ hp: 3 });

    mutateThenUndo(Fraktar, (hero) => {
      hero.isPoisoned = true;
    });

    expect(Object.keys(Fraktar)).toEqual(["hp"]);
  });

  it("should get back a field which was removed, at its place", function () {
    const Fraktar = observable<Record<string, unknown>>({
      hp: 3,
      mp: 2,
      name: "Fraktar",
      title: "the brave",
    });

    mutateThenUndo(Fraktar, (hero) => {
      delete hero.mp;
    });

    // MobX appends a field which comes back.
    expect(JSON.stringify(Fraktar)).toBe(
      '{"hp":3,"mp":2,"name":"Fraktar","title":"the brave"}'
    );
  });

  it("should get back a field whose name reads as a number", function () {
    // Such fields come first and in order, whenever they are added.
    const slots = observable<Record<string, unknown>>({
      1: "sword",
      5: "shield",
      9: "potion",
      owner: "Fraktar",
    });

    mutateThenUndo(slots, (bag) => {
      delete bag[5];
      delete bag.owner;
    });

    expect(JSON.stringify(slots)).toBe(
      '{"1":"sword","5":"shield","9":"potion","owner":"Fraktar"}'
    );
  });

  it("should lose a field which every object answers to by its name", function () {
    const Fraktar = observable<Record<string, unknown>>({ hp: 3 });

    mutateThenUndo(Fraktar, (hero) => {
      // Read from a text, as the name of a field can be.
      Object.assign(hero, JSON.parse('{ "constructor": "the mason" }'));
    });

    expect(Object.keys(Fraktar)).toEqual(["hp"]);
  });

  it("should take the writes back last first", function () {
    const Fraktar = observable<Record<string, unknown>>({ hp: 3 });

    mutateThenUndo(Fraktar, (hero) => {
      hero.hp = 5;
      hero.buff = "blessed";
      hero.hp = 8;
      delete hero.buff;
      hero.hp = 1;
    });

    expect(toJS(Fraktar)).toEqual({ hp: 3 });
  });

  it("should get back a field named by a symbol", function () {
    const sigil = Symbol("sigil");
    const Fraktar = observable<Record<string | symbol, unknown>>({ hp: 3 });
    runInAction(() => {
      Fraktar[sigil] = "warfog";
    });

    mutateThenUndo(Fraktar, (hero) => {
      delete hero[sigil];
    });

    expect(Fraktar[sigil]).toBe("warfog");
  });

  it("should get back what was written under a field named by a symbol", function () {
    const sigil = Symbol("sigil");
    const Fraktar = observable<Record<string | symbol, any>>({ hp: 3 });
    runInAction(() => {
      Fraktar[sigil] = { house: "Warfog" };
    });

    mutateThenUndo(Fraktar, (hero) => {
      hero[sigil].house = "Horde";
    });

    expect(Fraktar[sigil].house).toBe("Warfog");
  });

  it("should get back a field named by a symbol before the next one", function () {
    const sigil = Symbol("sigil");
    const oath = Symbol("oath");
    const Fraktar = observable<Record<string | symbol, unknown>>({ hp: 3 });
    runInAction(() => {
      Fraktar[sigil] = "warfog";
      Fraktar[oath] = "never retreat";
    });

    mutateThenUndo(Fraktar, (hero) => {
      delete hero[sigil];
    });

    expect(Object.getOwnPropertySymbols(Fraktar).slice(-2)).toEqual([
      sigil,
      oath,
    ]);
  });

  it("should get back a field at its place when MobX was told to do without a proxy", function () {
    const Fraktar = observable({ hp: 3, mp: 2, xp: 1 }, {}, { proxy: false });

    mutateThenUndo(Fraktar, (hero) => {
      remove(hero, "hp");
    });

    expect(Object.keys(Fraktar)).toEqual(["hp", "mp", "xp"]);
    expect(Fraktar.hp).toBe(3);
  });
});

describe("a field which comes back", function () {
  it("should leave the other fields as they were, whoever listens to them", function () {
    const Fraktar = observable<Record<string, any>>({
      title: "the brave",
      stats: { hp: 3 },
      name: "Fraktar",
    });
    let writes = 0;
    observe(Fraktar, "stats", () => writes++);
    observe(Fraktar, "name", () => writes++);

    mutateThenUndo(Fraktar, (hero) => {
      delete hero.title;
    });

    expect(Object.keys(Fraktar)).toEqual(["title", "stats", "name"]);
    // The fields behind it were put behind it again without a write in any.
    expect(writes).toBe(0);
    runInAction(() => {
      Fraktar.name = "Elwing";
    });
    expect(writes).toBe(1);
  });

  it("should leave a field kept by reference kept by reference", function () {
    const Fraktar = observable<Record<string, any>>(
      { title: "the brave", sigil: null },
      { sigil: observable.ref }
    );

    mutateThenUndo(Fraktar, (hero) => {
      delete hero.title;
    });

    const sigil = { house: "Warfog" };
    runInAction(() => {
      Fraktar.sigil = sigil;
    });
    // MobX would have made an observable copy of it.
    expect(Fraktar.sigil).toBe(sigil);
  });
});

describe("a nested sheet", function () {
  it("should get its own fields back", function () {
    const Fraktar = observable({ stats: { hp: 3, purse: { gold: 5 } } });

    mutateThenUndo(Fraktar, (hero) => {
      hero.stats.hp = 10;
      hero.stats.purse.gold = 0;
    });

    expect(toJS(Fraktar)).toEqual({ stats: { hp: 3, purse: { gold: 5 } } });
  });

  it("should come back itself when it was replaced, with its observers", function () {
    const Fraktar = observable({ stats: { hp: 3 } });
    const stats = Fraktar.stats;
    const healthBar: number[] = [];
    const dispose = autorun(() => healthBar.push(stats.hp));

    mutateThenUndo(Fraktar, (hero) => {
      hero.stats = { hp: 10 };
    });

    // The node itself, not a copy of it.
    expect(Fraktar.stats).toBe(stats);

    runInAction(() => {
      Fraktar.stats.hp = 4;
    });
    expect(healthBar).toEqual([3, 4]);
    dispose();
  });

  it("should come back itself when it was removed", function () {
    const Fraktar = observable<{ hp: number; pet?: { name: string } }>({
      hp: 3,
      pet: { name: "Rex" },
    });
    const pet = Fraktar.pet;

    mutateThenUndo(Fraktar, (hero) => {
      delete hero.pet;
    });

    expect(Fraktar.pet).toBe(pet);
  });

  it("should go away when it was added, whatever was written in it since", function () {
    const Fraktar = observable<{ hp: number; pet?: { name: string } }>({
      hp: 3,
    });

    mutateThenUndo(Fraktar, (hero) => {
      hero.pet = { name: "Rex" };
      hero.pet.name = "Rexy";
    });

    expect(toJS(Fraktar)).toEqual({ hp: 3 });
  });

  it("should get back what was written in it after it was removed", function () {
    const Fraktar = observable<{ hp: number; pet?: { name: string } }>({
      hp: 3,
      pet: { name: "Rex" },
    });

    mutateThenUndo(Fraktar, (hero) => {
      const pet = hero.pet!;
      delete hero.pet;
      // The mutator kept the node and goes on writing in it.
      pet.name = "Stray";
    });

    expect(toJS(Fraktar)).toEqual({ hp: 3, pet: { name: "Rex" } });
  });

  it("should be listened to when it was added by an earlier record", function () {
    const Fraktar = observable<{ hp: number; pet?: { name: string } }>({
      hp: 3,
    });
    const recorder = createStepRecorder(Fraktar);
    recorder.start();
    runInAction(() => {
      Fraktar.pet = { name: "Rex" };
    });
    recorder.stop();

    recorder.start();
    runInAction(() => {
      Fraktar.pet!.name = "Rexy";
    });
    recorder.undo();

    expect(toJS(Fraktar)).toEqual({ hp: 3, pet: { name: "Rex" } });
  });
});

describe("a sheet which left the hero in an earlier record", function () {
  it("should keep what its new owner writes in it", function () {
    const Fraktar = observable<{ hp: number; pet: { name: string } | null }>({
      hp: 3,
      pet: { name: "Rex" },
    });
    const pet = Fraktar.pet!;
    const recorder = createStepRecorder(Fraktar);
    recorder.start();
    runInAction(() => {
      Fraktar.pet = null;
    });
    recorder.stop();

    recorder.start();
    runInAction(() => {
      Fraktar.hp = 1;
      // Not Fraktar's anymore: whoever writes this is not his step.
      pet.name = "Elwing's Rex";
    });
    recorder.undo();

    expect(Fraktar.hp).toBe(3);
    expect(pet.name).toBe("Elwing's Rex");
  });

  it("should keep what is written in what it holds", function () {
    const Fraktar = observable<{
      hp: number;
      pet: { collar: { tag: string } } | null;
    }>({
      hp: 3,
      pet: { collar: { tag: "Rex" } },
    });
    const collar = Fraktar.pet!.collar;
    const recorder = createStepRecorder(Fraktar);
    recorder.start();
    runInAction(() => {
      Fraktar.pet = null;
    });
    recorder.stop();

    recorder.start();
    runInAction(() => {
      collar.tag = "Stray";
    });
    recorder.undo();

    expect(collar.tag).toBe("Stray");
  });

  it("should be the hero's again when it comes back, with what it holds", function () {
    const Fraktar = observable<{
      hp: number;
      pet: { collar: { tag: string } } | null;
    }>({
      hp: 3,
      pet: { collar: { tag: "Rex" } },
    });
    const pet = Fraktar.pet!;
    const recorder = createStepRecorder(Fraktar);
    recorder.start();
    runInAction(() => {
      Fraktar.pet = null;
    });
    recorder.stop();
    recorder.start();
    runInAction(() => {
      Fraktar.pet = pet;
    });
    recorder.stop();

    recorder.start();
    runInAction(() => {
      pet.collar.tag = "Stray";
    });
    recorder.undo();

    expect(pet.collar.tag).toBe("Rex");
  });

  it("should be let go of at once when no record runs", function () {
    const Fraktar = observable<{ pet: { collar: { tag: string } } | null }>({
      pet: { collar: { tag: "Rex" } },
    });
    const collar = Fraktar.pet!.collar;
    const recorder = createStepRecorder(Fraktar);
    // A rollback, for example, writes in the model outside of any step.
    runInAction(() => {
      Fraktar.pet = null;
    });

    recorder.start();
    runInAction(() => {
      collar.tag = "Stray";
    });
    recorder.undo();

    expect(collar.tag).toBe("Stray");
  });

  it("should keep the order its new owner gives its fields", function () {
    const Fraktar = observable<{
      gold: number;
      sheet?: Record<string, number>;
    }>({
      gold: 0,
      sheet: { hp: 3, mp: 2, xp: 1 },
    });
    const sheet = Fraktar.sheet as Record<string, number>;
    const recorder = createStepRecorder(Fraktar);
    recorder.start();
    runInAction(() => {
      Fraktar.sheet = undefined;
    });
    recorder.stop();

    recorder.start();
    runInAction(() => {
      Fraktar.gold = 100;
      // Its new owner, meanwhile.
      delete sheet.hp;
      sheet.hp = 3;
    });
    recorder.undo();

    expect(Fraktar.gold).toBe(0);
    expect(Object.keys(sheet)).toEqual(["mp", "xp", "hp"]);
  });
});

describe("the inventory", function () {
  it("should lose an item which was pushed", function () {
    const Fraktar = observable({ inventory: ["sword"] });

    mutateThenUndo(Fraktar, (hero) => {
      hero.inventory.push("shield");
    });

    expect(Fraktar.inventory.slice()).toEqual(["sword"]);
  });

  it("should get back an item which was popped or shifted", function () {
    const Fraktar = observable({ inventory: ["sword", "shield", "potion"] });

    mutateThenUndo(Fraktar, (hero) => {
      hero.inventory.pop();
      hero.inventory.shift();
    });

    expect(Fraktar.inventory.slice()).toEqual(["sword", "shield", "potion"]);
  });

  it("should get back what a splice took and lose what it put", function () {
    const Fraktar = observable({
      inventory: ["sword", "shield", "potion", "rope"],
    });

    mutateThenUndo(Fraktar, (hero) => {
      hero.inventory.splice(1, 2, "axe", "bow", "torch");
    });

    expect(Fraktar.inventory.slice()).toEqual([
      "sword",
      "shield",
      "potion",
      "rope",
    ]);
  });

  it("should get its order back", function () {
    const Fraktar = observable({
      inventory: ["sword", "axe", "shield", "bow"],
    });

    mutateThenUndo(Fraktar, (hero) => {
      hero.inventory.sort();
      hero.inventory.reverse();
    });

    expect(Fraktar.inventory.slice()).toEqual([
      "sword",
      "axe",
      "shield",
      "bow",
    ]);
  });

  it("should get back a slot which was written by its index", function () {
    const Fraktar = observable({ inventory: ["sword", "shield"] });

    mutateThenUndo(Fraktar, (hero) => {
      hero.inventory[0] = "axe";
    });

    expect(Fraktar.inventory.slice()).toEqual(["sword", "shield"]);
  });

  it("should get back a slot which held what was not a number", function () {
    const Fraktar = observable({ rolls: [NaN, 2] });

    mutateThenUndo(Fraktar, (hero) => {
      hero.rolls[0] = 6;
    });

    expect(Fraktar.rolls[0]).toBeNaN();
    expect(Fraktar.rolls[1]).toBe(2);
  });

  it("should get back what it held when it was emptied or replaced", function () {
    const Fraktar = observable({ inventory: ["sword", "shield"] });

    mutateThenUndo(Fraktar, (hero) => {
      hero.inventory.length = 0;
      hero.inventory.push("axe");
      (hero.inventory as IObservableArray<string>).replace(["bow", "torch"]);
      (hero.inventory as IObservableArray<string>).clear();
    });

    expect(Fraktar.inventory.slice()).toEqual(["sword", "shield"]);
  });

  it("should get back the very items it held, changes in them undone", function () {
    const Fraktar = observable({
      inventory: [
        { id: "sword", quantity: 1 },
        { id: "potion", quantity: 3 },
      ],
    });
    const potion = Fraktar.inventory[1];

    mutateThenUndo(Fraktar, (hero) => {
      hero.inventory[1].quantity = 2;
      hero.inventory.splice(1, 1);
      hero.inventory.push({ id: "shield", quantity: 1 });
    });

    expect(Fraktar.inventory[1]).toBe(potion);
    expect(toJS(Fraktar.inventory)).toEqual([
      { id: "sword", quantity: 1 },
      { id: "potion", quantity: 3 },
    ]);
  });

  it("should follow an item moved from one bag to another", function () {
    const Fraktar = observable({
      bag: [{ id: "potion", quantity: 3 }],
      chest: [] as Array<{ id: string; quantity: number }>,
    });
    const potion = Fraktar.bag[0];

    mutateThenUndo(Fraktar, (hero) => {
      const item = hero.bag.pop()!;
      // Out of the model for a moment, and written meanwhile.
      item.quantity = 1;
      hero.chest.push(item);
    });

    expect(Fraktar.bag[0]).toBe(potion);
    expect(toJS(Fraktar)).toEqual({
      bag: [{ id: "potion", quantity: 3 }],
      chest: [],
    });
  });

  it("should take a large reorder back without spreading it", function () {
    const coins: number[] = [];
    for (let coin = 200000; coin > 0; coin--) {
      coins.push(coin);
    }
    const Fraktar = observable({ coins });

    // Two hundred thousand arguments would not fit in a call.
    mutateThenUndo(Fraktar, (hero) => {
      hero.coins.sort((a, b) => a - b);
    });

    expect(Fraktar.coins[0]).toBe(200000);
    expect(Fraktar.coins.length).toBe(200000);
  });
});

describe("the quest log", function () {
  it("should lose a quest which was added and get back one which was updated", function () {
    const Fraktar = observable({
      quests: new Map([["dragon", { progress: 1 }]]),
    });
    const dragon = Fraktar.quests.get("dragon");

    mutateThenUndo(Fraktar, (hero) => {
      hero.quests.set("goblins", { progress: 0 });
      hero.quests.set("dragon", { progress: 3 });
    });

    expect(Array.from(Fraktar.quests.keys())).toEqual(["dragon"]);
    expect(Fraktar.quests.get("dragon")).toBe(dragon);
    expect(dragon!.progress).toBe(1);
  });

  it("should get back a quest which was abandoned, at its place", function () {
    const Fraktar = observable({
      quests: new Map([
        ["dragon", { progress: 1 }],
        ["goblins", { progress: 0 }],
        ["princess", { progress: 2 }],
      ]),
    });
    const goblins = Fraktar.quests.get("goblins");

    mutateThenUndo(Fraktar, (hero) => {
      hero.quests.delete("goblins");
    });

    expect(Array.from(Fraktar.quests.keys())).toEqual([
      "dragon",
      "goblins",
      "princess",
    ]);
    expect(Fraktar.quests.get("goblins")).toBe(goblins);
  });

  it("should get back a quest whose name is not a text", function () {
    const Fraktar = observable({
      quests: new Map<unknown, string>([
        [1, "one"],
        ["1", "text one"],
      ]),
    });

    mutateThenUndo(Fraktar, (hero) => {
      hero.quests.delete(1);
      hero.quests.set("1", "another text");
    });

    expect(Array.from(Fraktar.quests.entries())).toEqual([
      [1, "one"],
      ["1", "text one"],
    ]);
  });

  it("should get back a quest whose name is not a number", function () {
    const Fraktar = observable({
      quests: new Map<unknown, string>([
        [NaN, "lost"],
        ["dragon", "slay"],
      ]),
    });

    mutateThenUndo(Fraktar, (hero) => {
      hero.quests.delete(NaN);
      hero.quests.set(NaN, "found");
      hero.quests.delete(NaN);
    });

    expect(Array.from(Fraktar.quests.entries())).toEqual([
      [NaN, "lost"],
      ["dragon", "slay"],
    ]);
  });

  it("should get back the order a replace changed", function () {
    const Fraktar = observable({
      quests: observable.map([
        ["dragon", 1],
        ["goblins", 0],
        ["princess", 2],
      ]),
    });

    mutateThenUndo(Fraktar, (hero) => {
      // The only way MobX gives to sort a map: nothing is removed, and
      // nobody is told.
      hero.quests.replace(
        new Map([
          ["princess", 2],
          ["goblins", 0],
          ["dragon", 1],
        ])
      );
    });

    expect(Array.from(Fraktar.quests.keys())).toEqual([
      "dragon",
      "goblins",
      "princess",
    ]);
  });

  it("should get back the order a replace changed along with a quest", function () {
    const Fraktar = observable({
      quests: observable.map([
        ["dragon", 1],
        ["goblins", 0],
        ["princess", 2],
      ]),
    });

    mutateThenUndo(Fraktar, (hero) => {
      hero.quests.replace(
        new Map([
          ["troll", 0],
          ["princess", 3],
          ["goblins", 0],
          ["dragon", 1],
        ])
      );
    });

    expect(Array.from(Fraktar.quests.entries())).toEqual([
      ["dragon", 1],
      ["goblins", 0],
      ["princess", 2],
    ]);
  });

  it("should keep the order a replace gave before the record", function () {
    const Fraktar = observable({
      quests: observable.map([
        ["dragon", 1],
        ["goblins", 0],
      ]),
    });
    const recorder = createStepRecorder(Fraktar);
    runInAction(() => {
      Fraktar.quests.replace(
        new Map([
          ["goblins", 0],
          ["dragon", 1],
        ])
      );
    });

    recorder.start();
    runInAction(() => {
      Fraktar.quests.set("dragon", 2);
    });
    recorder.undo();

    expect(Array.from(Fraktar.quests.entries())).toEqual([
      ["goblins", 0],
      ["dragon", 1],
    ]);
  });

  it("should get every quest back after a clear, at the cost of one write each", function () {
    const quests = new Map<string, number>();
    for (let quest = 0; quest < 300; quest++) {
      quests.set(`quest ${quest}`, quest);
    }
    const Fraktar = observable({ quests });
    const recorder = createStepRecorder(Fraktar);
    recorder.start();
    runInAction(() => Fraktar.quests.clear());
    let writes = 0;
    observe(Fraktar.quests, () => writes++);

    recorder.undo();

    expect(Array.from(Fraktar.quests.keys())).toEqual(
      Array.from(quests.keys())
    );
    // Putting each one back at its place by moving the ones behind it took
    // the square of that.
    expect(writes).toBe(300);
  });

  it("should not be put in order again when the last quest comes back", function () {
    const Fraktar = observable({
      quests: new Map([
        ["dragon", 1],
        ["goblins", 0],
      ]),
    });
    const recorder = createStepRecorder(Fraktar);
    recorder.start();
    runInAction(() => Fraktar.quests.delete("goblins"));
    let writes = 0;
    observe(Fraktar.quests, () => writes++);

    recorder.undo();

    expect(Array.from(Fraktar.quests.keys())).toEqual(["dragon", "goblins"]);
    expect(writes).toBe(1);
  });

  it("should get back what was written in a quest", function () {
    const Fraktar = observable({
      quests: new Map([["dragon", { progress: 1 }]]),
    });

    mutateThenUndo(Fraktar, (hero) => {
      hero.quests.get("dragon")!.progress = 3;
    });

    expect(Fraktar.quests.get("dragon")!.progress).toBe(1);
  });

  it("should not hear of a replace which is borrowed from another map", function () {
    const Fraktar = observable({
      quests: observable.map([
        ["dragon", 1],
        ["goblins", 0],
      ]),
    });
    const { replace } = Object.getPrototypeOf(observable.map());

    mutateThenUndo(Fraktar, (hero) => {
      // Not hero.quests.replace(…): the one every map inherits, called on
      // this one. Nobody is told, and nothing stands in between.
      replace.call(hero.quests, [
        ["goblins", 0],
        ["dragon", 1],
      ]);
    });

    // Said taken back, and the order is the one of the step.
    expect(Array.from(Fraktar.quests.keys())).toEqual(["goblins", "dragon"]);
  });
});

describe("a quest log many heroes share", function () {
  it("should be listened to once, however many heroes hold it", function () {
    const quests = observable.map([
      ["dragon", 1],
      ["goblins", 0],
    ]);
    // A hero per request, for example, over the same quests.
    const heroes = Array.from({ length: 15000 }, () => observable({ quests }));
    const recorders = heroes.map((hero) => createStepRecorder(hero));
    const last = recorders[recorders.length - 1];

    last.start();
    runInAction(() => {
      // One more layer around replace for each hero, and this call ran out
      // of stack.
      quests.replace([
        ["goblins", 0],
        ["dragon", 1],
      ]);
    });
    last.undo();

    expect(Array.from(quests.keys())).toEqual(["dragon", "goblins"]);
  });

  it("should give its order back to each hero who holds it", function () {
    const quests = observable.map([
      ["dragon", 1],
      ["goblins", 0],
    ]);
    const [first, second] = [0, 1].map(() =>
      createStepRecorder(observable({ quests }))
    );

    first.start();
    second.start();
    runInAction(() => {
      quests.replace([
        ["goblins", 0],
        ["dragon", 1],
      ]);
    });
    first.stop();
    second.undo();

    expect(Array.from(quests.keys())).toEqual(["dragon", "goblins"]);
  });
});

describe("the status effects", function () {
  it("should lose an effect which was added", function () {
    const Fraktar = observable({ effects: new Set(["poisoned"]) });

    mutateThenUndo(Fraktar, (hero) => {
      hero.effects.add("blessed");
    });

    expect(Array.from(Fraktar.effects)).toEqual(["poisoned"]);
  });

  it("should get back an effect which was removed, at its place", function () {
    const Fraktar = observable({
      effects: new Set(["poisoned", "blessed", "burning"]),
    });

    mutateThenUndo(Fraktar, (hero) => {
      hero.effects.delete("blessed");
    });

    expect(Array.from(Fraktar.effects)).toEqual([
      "poisoned",
      "blessed",
      "burning",
    ]);
  });

  it("should get every effect back when they were cleared or replaced", function () {
    const Fraktar = observable({
      effects: new Set(["poisoned", "blessed", "burning"]),
    });

    mutateThenUndo(Fraktar, (hero) => {
      hero.effects.clear();
      (hero.effects as unknown as ObservableSet<string>).replace(["frozen"]);
    });

    expect(Array.from(Fraktar.effects)).toEqual([
      "poisoned",
      "blessed",
      "burning",
    ]);
  });
});

describe("the party, a set of heroes", function () {
  type Member = { name: string; hp: number };

  it("should lose a member who joined", function () {
    const Fraktar = observable({ party: new Set<Member>() });

    mutateThenUndo(Fraktar, (hero) => {
      // The set holds an observable made of this one, not this one.
      hero.party.add({ name: "Elwing", hp: 5 });
    });

    expect(Fraktar.party.size).toBe(0);
  });

  it("should get back what was written in a member who joined in an earlier record", function () {
    const Fraktar = observable({ party: new Set<Member>() });
    const recorder = createStepRecorder(Fraktar);
    recorder.start();
    runInAction(() => {
      Fraktar.party.add({ name: "Elwing", hp: 5 });
    });
    recorder.stop();
    const Elwing = Array.from(Fraktar.party)[0];

    recorder.start();
    runInAction(() => {
      Elwing.hp = 0;
    });
    recorder.undo();

    expect(Elwing.hp).toBe(5);
  });

  it("should get back the very member who left", function () {
    const Fraktar = observable({
      party: new Set<Member>([{ name: "Elwing", hp: 5 }]),
    });
    const Elwing = Array.from(Fraktar.party)[0];

    mutateThenUndo(Fraktar, (hero) => {
      Elwing.hp = 0;
      hero.party.delete(Elwing);
    });

    expect(Array.from(Fraktar.party)[0]).toBe(Elwing);
    expect(Elwing.hp).toBe(5);
  });

  it("should lose a member who was observable before joining", function () {
    const Fraktar = observable({ party: new Set<Member>() });
    const Elwing = observable({ name: "Elwing", hp: 5 });

    mutateThenUndo(Fraktar, (hero) => {
      hero.party.add(Elwing);
    });

    expect(Fraktar.party.size).toBe(0);
  });

  it("should get back the member who left right after another one joined", function () {
    const Fraktar = observable({ party: new Set([{ name: "Elwing" }]) });
    const [elwing] = Array.from(Fraktar.party);

    mutateThenUndo(Fraktar, (hero) => {
      hero.party.add({ name: "Thrall" });
      hero.party.delete(elwing);
      hero.party.add({ name: "Jaina" });
    });

    expect(Array.from(Fraktar.party)).toEqual([{ name: "Elwing" }]);
    expect(Array.from(Fraktar.party)[0]).toBe(elwing);
  });

  it("should lose the members who joined in a row, whatever each one is", function () {
    const Fraktar = observable({ party: new Set<unknown>() });

    mutateThenUndo(Fraktar, (hero) => {
      hero.party.add({ name: "Thrall" });
      hero.party.add("a ghost");
      hero.party.add({ name: "Jaina" });
    });

    expect(Fraktar.party.size).toBe(0);
  });
});

describe("a boxed value", function () {
  it("should get back what it held", function () {
    const Fraktar = observable({ hp: observable.box(3) });

    mutateThenUndo(Fraktar, (hero) => {
      hero.hp.set(10);
    });

    expect(Fraktar.hp.get()).toBe(3);
  });

  it("should get back what was not a number", function () {
    const Fraktar = observable({ mana: observable.box(NaN) });

    mutateThenUndo(Fraktar, (hero) => {
      hero.mana.set(1);
    });

    expect(Fraktar.mana.get()).toBeNaN();
  });

  it("should have what it holds listened to", function () {
    const Fraktar = observable({ stats: observable.box({ hp: 3 }) });

    mutateThenUndo(Fraktar, (hero) => {
      hero.stats.get().hp = 10;
    });

    expect(Fraktar.stats.get().hp).toBe(3);
  });

  it("should get back the very sheet it held, changes in it undone", function () {
    const Fraktar = observable({ stats: observable.box({ hp: 3 }) });
    const stats = Fraktar.stats.get();

    mutateThenUndo(Fraktar, (hero) => {
      hero.stats.set({ hp: 9 });
      stats.hp = 0;
    });

    expect(Fraktar.stats.get()).toBe(stats);
    expect(stats.hp).toBe(3);
  });
});

describe("an equipment which is an observable class instance", function () {
  class Armor {
    public defense: number;
    constructor(defense: number) {
      this.defense = defense;
      makeAutoObservable(this);
    }
  }

  it("should get its fields back", function () {
    const Fraktar = observable({ armor: new Armor(3) });

    mutateThenUndo(Fraktar, (hero) => {
      hero.armor.defense = 9;
    });

    expect(Fraktar.armor.defense).toBe(3);
  });
});

describe("a way back which is refused", function () {
  /**
   * A hero whose curses can not be lifted: whoever listens to them refuses.
   */
  function createCursed(refuse: () => null) {
    const Fraktar = observable({ gold: 0, curses: ["greed"], hp: 3 });
    intercept(Fraktar.curses, (change) =>
      change.type === "splice" && change.removedCount ? refuse() : change
    );
    return Fraktar;
  }

  it("should leave the model as the writes left it when it throws", function () {
    const Fraktar = createCursed(() => {
      throw new Error("a curse can not be lifted");
    });
    const recorder = createStepRecorder(Fraktar);
    recorder.start();
    runInAction(() => {
      Fraktar.gold = 100;
      Fraktar.curses.push("pride");
      Fraktar.hp = 1;
    });

    expect(() => recorder.undo()).toThrowError("a curse can not be lifted");

    // All or nothing: not the hp back with the gold and the curse left.
    expect(toJS(Fraktar)).toEqual({
      gold: 100,
      curses: ["greed", "pride"],
      hp: 1,
    });
  });

  it("should leave the model as the writes left it when it says nothing", function () {
    // An interceptor can cancel a write without a word.
    const Fraktar = createCursed(() => null);
    const recorder = createStepRecorder(Fraktar);
    recorder.start();
    runInAction(() => {
      Fraktar.gold = 100;
      Fraktar.curses.push("pride");
    });

    expect(() => recorder.undo()).toThrowError(
      "a write in the model was refused"
    );
    expect(toJS(Fraktar)).toEqual({
      gold: 100,
      curses: ["greed", "pride"],
      hp: 3,
    });
  });

  /**
   * The way back of what a mutator does, once a guard is posted on the hero.
   */
  function undoGuarded<T extends object>(
    Fraktar: T,
    mutator: (hero: T) => void,
    post: (hero: T) => void
  ) {
    const recorder = createStepRecorder(Fraktar);
    recorder.start();
    runInAction(() => mutator(Fraktar));
    post(Fraktar);
    return () => recorder.undo();
  }
  const refused = "a write in the model was refused";

  it("should be seen when a field which was updated is not given back", function () {
    const Fraktar = observable({ title: "the brave" });

    const undo = undoGuarded(
      Fraktar,
      (hero) => {
        hero.title = "the broken";
      },
      (hero) => intercept(hero, () => null)
    );

    expect(undo).toThrowError(refused);
    expect(Fraktar.title).toBe("the broken");
  });

  it("should be seen when a field which was added is not taken away", function () {
    const Fraktar = observable<{ hp: number; title?: string }>({ hp: 3 });

    const undo = undoGuarded(
      Fraktar,
      (hero) => set(hero, "title", "the brave"),
      (hero) => intercept(hero, () => null)
    );

    expect(undo).toThrowError(refused);
    expect(Fraktar.title).toBe("the brave");
  });

  it("should be seen when a field which held nothing is not given back", function () {
    const Fraktar = observable<{ hp: number; title?: string }>({
      hp: 3,
      title: undefined,
    });

    const undo = undoGuarded(
      Fraktar,
      (hero) => remove(hero, "title"),
      (hero) => intercept(hero, () => null)
    );

    expect(undo).toThrowError(refused);
    expect(Object.keys(Fraktar)).toEqual(["hp"]);
  });

  it("should be seen when a member who joined is not taken away", function () {
    const Fraktar = observable({ effects: new Set(["blessed"]) });

    const undo = undoGuarded(
      Fraktar,
      (hero) => hero.effects.add("burning"),
      (hero) => intercept(hero.effects, () => null)
    );

    expect(undo).toThrowError(refused);
    expect(Fraktar.effects.has("burning")).toBe(true);
  });

  it("should be seen when a member who left is not given back", function () {
    const Fraktar = observable({ effects: new Set(["blessed"]) });

    const undo = undoGuarded(
      Fraktar,
      (hero) => hero.effects.delete("blessed"),
      (hero) => intercept(hero.effects, () => null)
    );

    expect(undo).toThrowError(refused);
    expect(Fraktar.effects.has("blessed")).toBe(false);
  });

  it("should be seen when a boxed value is not given back", function () {
    const Fraktar = observable({ mana: observable.box(2) });

    const undo = undoGuarded(
      Fraktar,
      (hero) => hero.mana.set(0),
      (hero) => intercept(hero.mana, () => null)
    );

    expect(undo).toThrowError(refused);
    expect(Fraktar.mana.get()).toBe(0);
  });

  it("should be seen when the items which come back are changed on the way", function () {
    const Fraktar = observable({ bag: ["sword"] });

    const undo = undoGuarded(
      Fraktar,
      (hero) => {
        hero.bag[0] = "axe";
      },
      (hero) =>
        intercept(hero.bag, (change) => {
          // The way back writes with a splice, whatever the write was.
          if (change.type === "splice") {
            change.added = ["rust"];
          }
          return change;
        })
    );

    expect(undo).toThrowError(refused);
  });
});

describe("a listener which throws on the way back", function () {
  beforeEach(function () {
    jest.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(function () {
    jest.restoreAllMocks();
  });

  it("should not keep the model from coming back whole", function () {
    const Fraktar = observable({ gold: 0, inventory: ["sword"], hp: 3 });
    const recorder = createStepRecorder(Fraktar);
    recorder.start();
    runInAction(() => {
      Fraktar.gold = 100;
      Fraktar.inventory.push("shield");
      Fraktar.hp = 1;
    });
    // It is called once the write is done: the write stands.
    observe(Fraktar.inventory, () => {
      throw new Error("the bag is torn");
    });

    recorder.undo();

    expect(toJS(Fraktar)).toEqual({ gold: 0, inventory: ["sword"], hp: 3 });
  });
});

describe("what MobX does not observe", function () {
  class Weapon {
    constructor(public damage: number) {}
  }

  it("should keep a hero who holds a date from being taken back", function () {
    const Fraktar = observable({ hp: 3, bornAt: new Date(0) });
    const recorder = createStepRecorder(Fraktar);
    recorder.start();
    runInAction(() => {
      Fraktar.hp = 10;
      // Nobody is told of this write, so nobody could take it back.
      Fraktar.bornAt.setTime(86400000);
    });

    expect(() => recorder.undo()).toThrowError(
      "the model holds a Date at /bornAt, which MobX does not observe: " +
        "nothing tells what was written in it"
    );
    expect(Fraktar.hp).toBe(10);
  });

  it("should keep a hero who was given a class instance from being taken back", function () {
    const Fraktar = observable<{ hp: number; weapon?: Weapon }>({ hp: 3 });
    const recorder = createStepRecorder(Fraktar);
    recorder.start();
    runInAction(() => {
      Fraktar.weapon = new Weapon(3);
    });
    recorder.stop();

    recorder.start();
    runInAction(() => {
      Fraktar.hp = 10;
    });

    expect(() => recorder.undo()).toThrowError(
      "the model holds an object which is not observable at /weapon, which " +
        "MobX does not observe: nothing tells what was written in it"
    );
  });

  it("should keep a hero who holds a plain object by reference from it", function () {
    const Fraktar = observable(
      { hp: 3, sigil: { house: "Warfog" } },
      { sigil: observable.ref }
    );
    const recorder = createStepRecorder(Fraktar);
    recorder.start();
    runInAction(() => {
      Fraktar.hp = 10;
      // Kept as it is: MobX does not see this either.
      Fraktar.sigil.house = "Horde";
    });

    expect(() => recorder.undo()).toThrowError(
      /the model holds an object which is not observable/
    );
    expect(Fraktar.hp).toBe(10);
  });

  it("should keep a hero whose class leaves a field out from it", function () {
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
      party.leader.hp = 2;
      // MobX was not told of this field: nobody hears this write.
      party.leader.hits++;
    });

    expect(() => recorder.undo()).toThrowError(
      "the model holds a field which is not observable at /leader/hits, " +
        "which MobX does not observe: nothing tells what was written in it"
    );
    expect(party.leader.hp).toBe(2);
  });

  it("should keep a hero one field of whom is left as it is from it", function () {
    const Fraktar = observable({ hp: 3, cache: 0 }, { cache: false });
    const recorder = createStepRecorder(Fraktar);
    recorder.start();
    runInAction(() => {
      Fraktar.hp = 10;
      Fraktar.cache = 1;
    });

    expect(() => recorder.undo()).toThrowError(
      /the model holds a field which is not observable/
    );
    expect(Fraktar.hp).toBe(10);
  });

  it("should take back a hero who only has what he can do beside his fields", function () {
    class Hero {
      hp = 3;
      shout = () => "For the Horde!";
      constructor() {
        makeObservable(this, { hp: observable });
      }
    }
    const party = observable({ leader: new Hero() });

    mutateThenUndo(party, ({ leader }) => {
      leader.hp = 2;
    });

    expect(party.leader.hp).toBe(3);
  });

  it("should keep a hero whose quests are named by an object from it", function () {
    const dragon = { name: "dragon" };
    const Fraktar = observable({ hp: 3, quests: new Map([[dragon, 1]]) });
    const recorder = createStepRecorder(Fraktar);
    recorder.start();
    runInAction(() => {
      Fraktar.hp = 10;
      // A key is kept as it is given.
      dragon.name = "wyvern";
    });

    expect(() => recorder.undo()).toThrowError(
      "the model holds an object used as the key of a Map at /quests, " +
        "which MobX does not observe: nothing tells what was written in it"
    );
    expect(Fraktar.hp).toBe(10);
  });

  it("should keep a hero whose scores are kept by player from it, a player being one of his own", function () {
    const ann = observable({ name: "ann" });
    const Fraktar = observable({
      hp: 3,
      scores: new Map([[ann, 10]]),
    });
    const recorder = createStepRecorder(Fraktar);
    recorder.start();
    runInAction(() => {
      Fraktar.hp = 10;
      // MobX tells of this write, to whoever listens to the player: nobody
      // does, a key is not something a map holds.
      ann.name = "bob";
    });

    expect(() => recorder.undo()).toThrowError(
      /the model holds an object used as the key of a Map/
    );
    expect(Fraktar.hp).toBe(10);
  });

  it("should keep a hero whose scores are kept by player from it, the player being in his party too", function () {
    const ann = observable({ name: "ann" });
    const Fraktar = observable({
      party: [ann],
      scores: new Map([[ann, 10]]),
    });
    const recorder = createStepRecorder(Fraktar);
    recorder.start();
    runInAction(() => {
      Fraktar.party[0].name = "bob";
    });

    // The player would come back, but the key reads otherwise in a JSON
    // copy and no patch tells it.
    expect(() => recorder.undo()).toThrowError(
      /the model holds an object used as the key of a Map/
    );
  });

  it("should keep a hero who names a quest by an object during the record from it", function () {
    const Fraktar = observable({ hp: 3, quests: new Map<object, number>() });
    const recorder = createStepRecorder(Fraktar);
    recorder.start();
    runInAction(() => {
      Fraktar.quests.set({ name: "dragon" }, 1);
    });

    expect(() => recorder.undo()).toThrowError(
      /the model holds an object used as the key of a Map/
    );
  });

  it("should take a hero back again once no quest is named by an object", function () {
    const dragon = { name: "dragon" };
    const Fraktar = observable({ hp: 3, quests: new Map([[dragon, 1]]) });
    const recorder = createStepRecorder(Fraktar);
    recorder.start();
    runInAction(() => {
      Fraktar.quests.delete(dragon);
    });
    recorder.stop();

    recorder.start();
    runInAction(() => {
      Fraktar.hp = 10;
    });
    recorder.undo();

    expect(Fraktar.hp).toBe(3);
  });

  /**
   * A hero whose class does not give `target` a value: MobX is told of every
   * field which is there when the hero is made, and this one is not.
   */
  class Archer {
    hp = 3;
    target?: string;
    constructor() {
      makeAutoObservable(this);
    }
  }

  it("should keep a hero who is given a field his class left out from it", function () {
    const party = observable({ leader: new Archer() });
    const recorder = createStepRecorder(party);
    recorder.start();
    runInAction(() => {
      party.leader.hp--;
      // Born in the step: nobody is told, of this write nor of the next.
      party.leader.target = "orc";
    });

    expect(() => recorder.undo()).toThrowError(
      /the model holds a field which is not observable/
    );
    expect(party.leader.hp).toBe(2);
  });

  it("should keep a hero who was given such a field in an earlier record from it", function () {
    const party = observable({ leader: new Archer() });
    const recorder = createStepRecorder(party);
    recorder.start();
    runInAction(() => {
      party.leader.target = "orc";
    });
    recorder.stop();

    recorder.start();
    runInAction(() => {
      party.leader.hp--;
      party.leader.target = "troll";
    });

    expect(() => recorder.undo()).toThrowError(
      /the model holds a field which is not observable/
    );
  });

  it("should keep a hero who trades a field MobX knows for one it does not from it", function () {
    configure({ useProxies: "never" });
    const Fraktar = observable<{ hp?: number; mp: number; target?: string }>({
      hp: 3,
      mp: 2,
    });
    configure({ useProxies: "always" });
    const recorder = createStepRecorder(Fraktar);
    recorder.start();
    runInAction(() => {
      // As many fields as before, and one of them is nobody's business.
      remove(Fraktar, "hp");
      Fraktar.target = "orc";
    });

    expect(() => recorder.undo()).toThrowError(
      /the model holds a field which is not observable at \/target/
    );
  });

  it("should take a hero back again once such a field is gone", function () {
    const party = observable({ leader: new Archer() });
    const recorder = createStepRecorder(party);
    recorder.start();
    runInAction(() => {
      party.leader.target = "orc";
    });
    recorder.stop();
    delete party.leader.target;

    recorder.start();
    runInAction(() => {
      party.leader.hp--;
    });
    recorder.undo();

    expect(party.leader.hp).toBe(3);
  });

  it("should keep a hero made without a proxy who is given a field from it", function () {
    configure({ useProxies: "never" });
    const Fraktar = observable<{ hp: number; target?: string }>({ hp: 3 });
    configure({ useProxies: "always" });
    const recorder = createStepRecorder(Fraktar);
    recorder.start();
    runInAction(() => {
      Fraktar.hp--;
      // Without a proxy, MobX is not told of an assignment to a new field.
      Fraktar.target = "orc";
    });

    expect(() => recorder.undo()).toThrowError(
      /the model holds a field which is not observable/
    );
  });

  it("should take back a hero made without a proxy as any other", function () {
    configure({ useProxies: "never" });
    const Fraktar = observable<{ hp: number; title?: string }>({ hp: 3 });
    configure({ useProxies: "always" });

    mutateThenUndo(Fraktar, (hero) => {
      hero.hp--;
      // MobX is told of this one.
      extendObservable(hero, { title: "the brave" });
    });

    expect(toJS(Fraktar)).toEqual({ hp: 3 });
  });

  it("should keep a hero with a proxy who was given a field MobX does not observe from it", function () {
    const Fraktar = observable<{ hp: number; target?: string }>({ hp: 3 });
    const recorder = createStepRecorder(Fraktar);
    recorder.start();
    // Through the proxy, MobX is told of the field, and leaves it alone.
    Object.defineProperty(Fraktar, "target", {
      value: "troll",
      writable: true,
      enumerable: true,
      configurable: true,
    });
    recorder.stop();

    recorder.start();
    runInAction(() => {
      Fraktar.hp--;
      // Nobody is told of this one.
      Fraktar.target = "orc";
    });

    expect(() => recorder.undo()).toThrowError(
      /the model holds a field which is not observable at \/target/
    );
    expect(toJS(Fraktar)).toEqual({ hp: 2, target: "orc" });
  });

  it("should take a hero with a proxy back again once such a field is gone", function () {
    const Fraktar = observable<{ hp: number; target?: string }>({ hp: 3 });
    const recorder = createStepRecorder(Fraktar);
    Object.defineProperty(Fraktar, "target", {
      value: "troll",
      writable: true,
      enumerable: true,
      configurable: true,
    });
    delete Fraktar.target;

    recorder.start();
    runInAction(() => {
      Fraktar.hp--;
    });
    recorder.undo();

    expect(toJS(Fraktar)).toEqual({ hp: 3 });
  });

  it("should still say nothing of a field which is not listed, given through a proxy, nor once it is gone", function () {
    const Fraktar = observable({ hp: 3 });
    const recorder = createStepRecorder(Fraktar);
    Object.defineProperty(Fraktar, "hits", {
      value: 0,
      writable: true,
      enumerable: false,
      configurable: true,
    });
    const hero = Fraktar as { hp: number; hits?: number };
    delete hero.hits;

    recorder.start();
    runInAction(() => {
      hero.hp--;
    });
    recorder.undo();

    expect(toJS(hero)).toEqual({ hp: 3 });
  });

  it("should say nothing of a field which is not listed among the others", function () {
    const Fraktar = observable({ hp: 3 });
    // Hidden from whoever goes through the fields of the hero.
    Object.defineProperty(Fraktar, "hits", {
      value: 0,
      writable: true,
      enumerable: false,
      configurable: true,
    });
    const hero = Fraktar as { hp: number; hits: number };

    mutateThenUndo(hero, (wounded) => {
      wounded.hp--;
      wounded.hits++;
    });

    // Out of reach, as a private field is: said taken back, and it is not.
    expect(hero.hp).toBe(3);
    expect(hero.hits).toBe(1);
  });

  it("should say nothing of what a function of the hero keeps on itself", function () {
    const shout = Object.assign(() => "For the Horde!", { times: 0 });
    const Fraktar = observable({ hp: 3, shout }, { shout: false });

    mutateThenUndo(Fraktar, (hero) => {
      hero.hp--;
      hero.shout.times++;
    });

    // What a hero can do is not a field: nothing looks into it.
    expect(Fraktar.hp).toBe(3);
    expect(Fraktar.shout.times).toBe(1);
  });

  it("should say nothing of a field the class keeps private", function () {
    // As a browser runs it: this package is compiled for ES5, which has no
    // private field.
    const Hero = new Function(
      "makeObservable",
      "observable",
      `return class Hero {
        hp = 3;
        #hits = 0;
        constructor() { makeObservable(this, { hp: observable }); }
        hit() { this.hp--; this.#hits++; }
        get hits() { return this.#hits; }
      }`
    )(makeObservable, observable);
    const party = observable({ leader: new Hero() });

    mutateThenUndo(party, ({ leader }) => leader.hit());

    // Nothing can see such a field from outside, so nothing is refused: the
    // hero is said taken back, and his private count is not.
    expect(party.leader.hp).toBe(3);
    expect(party.leader.hits).toBe(1);
  });

  it("should keep a hero who lost his date during the record from it", function () {
    const Fraktar = observable<{ hp: number; bornAt?: Date | string }>({
      hp: 3,
      bornAt: new Date(0),
    });
    const recorder = createStepRecorder(Fraktar);
    recorder.start();
    runInAction(() => {
      (Fraktar.bornAt as Date).setTime(86400000);
      Fraktar.bornAt = "1970-01-02";
    });

    // The date would come back as it was written, not as it was.
    expect(() => recorder.undo()).toThrowError(/the model holds a Date/);
  });

  it("should take a hero back again once the date left him", function () {
    const Fraktar = observable<{ hp: number; bornAt?: Date; pet?: object }>({
      hp: 3,
      bornAt: new Date(0),
      pet: { bornAt: new Date(0) },
    });
    const recorder = createStepRecorder(Fraktar);
    recorder.start();
    runInAction(() => {
      delete Fraktar.bornAt;
      // The date of the pet leaves with the pet.
      delete Fraktar.pet;
    });
    recorder.stop();

    recorder.start();
    runInAction(() => {
      Fraktar.hp = 10;
    });
    recorder.undo();

    expect(Fraktar.hp).toBe(3);
  });

  it("should still count the date of a hero whose relic left, came back and left again", function () {
    const Fraktar = observable({
      bornAt: new Date(0),
      hp: 3,
      bag: [{ forgedAt: new Date(0) }],
    });
    const relic = Fraktar.bag[0];
    const recorder = createStepRecorder(Fraktar);
    const mutators: Array<() => void> = [
      () => Fraktar.bag.pop(),
      () => Fraktar.bag.push(relic),
      () => Fraktar.bag.pop(),
    ];
    mutators.forEach((mutator) => {
      recorder.start();
      runInAction(mutator);
      recorder.stop();
    });

    recorder.start();
    runInAction(() => {
      Fraktar.hp = 1;
    });

    // The relic took its own date with it each time, and not the hero's.
    expect(() => recorder.undo()).toThrowError(/the model holds a Date/);
  });

  /**
   * What the way back answers when the hero holds this.
   */
  function refusal(Fraktar: object) {
    const recorder = createStepRecorder(Fraktar);
    recorder.start();
    try {
      recorder.undo();
    } catch (error) {
      return (error as Error).message;
    }
    return "taken back";
  }
  const told = (what: string) =>
    `the model holds ${what}, which MobX does not observe: nothing tells ` +
    "what was written in it";

  it("should say where it is in a list, by its place", function () {
    const Fraktar = observable({ relics: ["ring", new Date(0)] });

    expect(refusal(Fraktar)).toBe(told("a Date at /relics/1"));
  });

  it("should say where it is under a quest, by the name of the quest", function () {
    const Fraktar = observable({
      quests: new Map([["north/east", { startedAt: new Date(0) }]]),
    });

    // As a JSON pointer writes a slash.
    expect(refusal(Fraktar)).toBe(
      told("a Date at /quests/north~1east/startedAt")
    );
  });

  it("should say where it is in a member of a set, which has no place of its own", function () {
    const Fraktar = observable({ party: new Set([{ joinedAt: new Date(0) }]) });

    expect(refusal(Fraktar)).toBe(told("a Date at /party/*/joinedAt"));
  });

  it("should say where it is in a box, which is where the box is", function () {
    const Fraktar = observable({ bornAt: observable.box(new Date(0)) });

    expect(refusal(Fraktar)).toBe(told("a Date at /bornAt"));
  });

  it("should say it is at the root when the hero is a box which holds it", function () {
    const Fraktar = observable.box(new Date(0));

    expect(refusal(Fraktar)).toBe(told("a Date at its root"));
  });

  it("should say it is at the root when the hero is a map which has it as a key", function () {
    const Fraktar = observable.map([[{ name: "dragon" }, 1]]);

    expect(refusal(Fraktar)).toBe(
      told("an object used as the key of a Map at its root")
    );
  });

  it("should find it behind heroes who know each other", function () {
    const Fraktar = observable<Record<string, unknown>>({ name: "Fraktar" });
    const Elwing = observable<Record<string, unknown>>({ friend: Fraktar });
    runInAction(() => {
      Fraktar.friend = Elwing;
      Elwing.metAt = new Date(0);
    });

    expect(refusal(Fraktar)).toBe(told("a Date at /friend/metAt"));
  });

  it("should name alone what left the hero during the record", function () {
    const Fraktar = observable<{ hp: number; bornAt?: Date }>({
      hp: 3,
      bornAt: new Date(0),
    });
    const recorder = createStepRecorder(Fraktar);
    recorder.start();
    runInAction(() => {
      delete Fraktar.bornAt;
    });

    expect(() => recorder.undo()).toThrowError(told("a Date"));
  });

  it("should name the first of two things it does not observe", function () {
    const Fraktar = observable<{ hp: number; bornAt?: Date; weapon?: Weapon }>({
      hp: 3,
    });
    const recorder = createStepRecorder(Fraktar);
    recorder.start();
    runInAction(() => {
      Fraktar.bornAt = new Date(0);
      Fraktar.weapon = new Weapon(3);
    });

    expect(() => recorder.undo()).toThrowError(/the model holds a Date/);
  });

  it("should still refuse what was made observable where it was", function () {
    const sigil = { house: "Warfog" };
    const Fraktar = observable<{ hp: number; sigil?: object }>(
      { hp: 3, sigil },
      { sigil: observable.ref }
    );
    const recorder = createStepRecorder(Fraktar);
    // Behind MobX's back: the hero held it before anybody listened to it.
    extendObservable(sigil, { motto: "never retreat" });

    recorder.start();
    runInAction(() => {
      delete Fraktar.sigil;
    });
    recorder.stop();
    recorder.start();
    runInAction(() => {
      Fraktar.hp = 10;
    });

    expect(() => recorder.undo()).toThrowError(
      /the model holds an object which is not observable/
    );
  });
});

describe("the party, heroes who know each other", function () {
  it("should be listened to when a member points back to the party", function () {
    const party = observable<any>({
      leader: "Fraktar",
      next: { leader: "Elwing" },
    });
    runInAction(() => {
      party.next.next = party;
    });

    mutateThenUndo(party, (members) => {
      members.next.next.leader = "Dreadbond";
    });

    expect(party.leader).toBe("Fraktar");
  });

  it("should take back once what is written in a guild two members share", function () {
    const guild = observable({ name: "Warfog", members: 2 });
    const party = observable({ Fraktar: { guild }, Elwing: { guild } });

    mutateThenUndo(party, (members) => {
      members.Fraktar.guild.members++;
    });

    expect(party.Elwing.guild.members).toBe(2);
  });

  it("should get back what is written in two strays who only know each other", function () {
    const party = observable<any>({ pets: [{ name: "Rex" }] });
    const Rex = party.pets[0];
    runInAction(() => {
      Rex.friend = { name: "Tom", friend: Rex };
    });

    mutateThenUndo(party, (members) => {
      // They leave together, each one still held by the other.
      members.pets.pop();
      Rex.friend.name = "Tom the stray";
    });

    expect(party.pets[0].friend.name).toBe("Tom");
  });

  it("should keep a hero who stands twice in the line where he stood", function () {
    const Fraktar = observable({ name: "Fraktar", hp: 3 });
    const party = observable({
      line: [Fraktar, { name: "Elwing", hp: 5 }, Fraktar],
    });

    mutateThenUndo(party, (members) => {
      members.line.unshift({ name: "Thrall", hp: 9 });
      members.line.splice(1, 1);
      members.line.shift();
      members.line[1].hp = 0;
    });

    expect(party.line.map(({ name }) => name)).toEqual([
      "Fraktar",
      "Elwing",
      "Fraktar",
    ]);
    expect(Fraktar.hp).toBe(3);
  });
});

describe("a record", function () {
  it("should hold nothing of what happens before it starts or after it stops", function () {
    const Fraktar = observable({ hp: 3 });
    const recorder = createStepRecorder(Fraktar);

    runInAction(() => {
      Fraktar.hp = 4;
    });
    recorder.start();
    runInAction(() => {
      Fraktar.hp = 5;
    });
    recorder.stop();
    runInAction(() => {
      Fraktar.hp = 6;
    });

    // Nothing is left to take back.
    recorder.undo();
    expect(Fraktar.hp).toBe(6);
  });

  it("should be the only one running", function () {
    const recorder = createStepRecorder(observable({ hp: 3 }));

    recorder.start();

    expect(() => recorder.start()).toThrowError(
      "[RAVIOLI] A record is already running."
    );
  });

  it("should leave room for another once it was taken back", function () {
    const Fraktar = observable({ hp: 3 });
    const recorder = createStepRecorder(Fraktar);
    recorder.start();
    runInAction(() => {
      Fraktar.hp = 5;
    });
    recorder.undo();

    recorder.start();
    runInAction(() => {
      Fraktar.hp = 8;
    });
    recorder.undo();

    expect(Fraktar.hp).toBe(3);
  });

  it("should be taken back in one go for the observers", function () {
    const Fraktar = observable({ hp: 3, inventory: ["sword"] });
    let renders = 0;
    const dispose = autorun(() => {
      Fraktar.hp;
      Fraktar.inventory.length;
      renders++;
    });
    const recorder = createStepRecorder(Fraktar);

    recorder.start();
    runInAction(() => {
      Fraktar.hp = 10;
      Fraktar.inventory.push("shield");
    });
    recorder.undo();

    // The first render, the writes, the return.
    expect(renders).toBe(3);
    dispose();
  });

  it("should let go of the lists the hero replaced, whatever they held", function () {
    type Relic = { name: string; foundAt: Date };
    const Fraktar = observable<{ hp: number; bag: Relic[]; shelf?: Relic[] }>({
      hp: 3,
      bag: [{ name: "relic", foundAt: new Date(0) }],
    });
    const old = Fraktar.bag as IObservableArray<Relic>;
    const relic = old[0];
    const recorder = createStepRecorder(Fraktar);
    const write = (mutator: () => void) => {
      recorder.start();
      runInAction(mutator);
      recorder.stop();
    };
    // The same relic, in a new list: the old one is nobody's anymore.
    write(() => {
      Fraktar.bag = Fraktar.bag.filter(() => true);
    });
    // The old list comes back, with the relic.
    write(() => {
      Fraktar.shelf = old;
    });
    // The relic leaves both lists: the hero holds no date anymore.
    write(() => {
      old.remove(relic);
      (Fraktar.bag as IObservableArray<Relic>).remove(relic);
    });

    recorder.start();
    runInAction(() => {
      Fraktar.hp = 10;
    });
    // The relic would still be counted his, had the old list been kept as
    // one of its places while it was away.
    recorder.undo();

    expect(Fraktar.hp).toBe(3);
  });
});

describe("nodes which leave the model together", function () {
  it("should be let go of when they hold each other", function () {
    const Elwing = observable<any>({ name: "Elwing", friend: null });
    const Thrall = observable<any>({ name: "Thrall", friend: Elwing });
    const party = observable<any>({ leader: null });
    runInAction(() => {
      Elwing.friend = Thrall;
      party.leader = Elwing;
    });
    const recorder = createStepRecorder(party);
    recorder.start();
    runInAction(() => {
      party.leader = null;
    });
    recorder.stop();

    // Somebody else's from now on, both of them.
    recorder.start();
    runInAction(() => {
      Thrall.name = "Thrall the stray";
    });
    recorder.undo();

    expect(Thrall.name).toBe("Thrall the stray");
  });

  it("should not take with them a node the model still holds", function () {
    const sword = observable({ damage: 3 });
    const Fraktar = observable<any>({
      hands: { left: { item: sword } },
      rack: [sword],
    });
    const recorder = createStepRecorder(Fraktar);
    recorder.start();
    runInAction(() => {
      // The sword leaves with the hands, and stays on the rack.
      Fraktar.hands = null;
    });
    recorder.stop();

    recorder.start();
    runInAction(() => {
      sword.damage = 9;
    });
    recorder.undo();

    expect(sword.damage).toBe(3);
  });
});

describe("the same item in two bags", function () {
  it("should stay in the one a splice of the other does not touch", function () {
    const potion = observable({ doses: 3 });
    const Fraktar = observable({ bag: [potion], chest: [potion] });

    mutateThenUndo(Fraktar, (hero) => {
      hero.bag.unshift(observable({ doses: 1 }));
      hero.chest.pop();
      potion.doses = 0;
    });

    expect(Fraktar.bag[0]).toBe(potion);
    expect(Fraktar.chest[0]).toBe(potion);
    expect(potion.doses).toBe(3);
  });
});

describe("the cost of recording a step", function () {
  it("should be what MobX itself spends on a long list, give or take", function () {
    const toBag = () =>
      observable({ bag: Array.from({ length: 40000 }, (_, id) => ({ id })) });
    // What it takes of the processor, in milliseconds: the clock also
    // counts what the machine does beside.
    const time = (hero: { bag: unknown[] }) => {
      const start = process.cpuUsage();
      runInAction(() => {
        for (let item = 0; item < 1000; item++) {
          hero.bag.shift();
        }
      });
      const { user, system } = process.cpuUsage(start);
      return (user + system) / 1000;
    };
    const alone = time(toBag());

    const Fraktar = toBag();
    const recorder = createStepRecorder(Fraktar);
    recorder.start();
    const recorded = time(Fraktar);
    recorder.stop();

    // Keeping the index of each item right at every shift took two hundred
    // times what MobX spends. Far from it, however busy the machine is.
    expect(recorded).toBeLessThan(alone * 50 + 1000);
  }, 120000);
});

describe("an object without a prototype, kept by reference", function () {
  it("should keep a hero from being taken back as any other", function () {
    const Fraktar = observable(
      { hp: 3, sigil: Object.create(null) },
      { sigil: observable.ref }
    );
    const recorder = createStepRecorder(Fraktar);
    recorder.start();
    runInAction(() => {
      Fraktar.hp = 10;
    });

    expect(() => recorder.undo()).toThrowError(
      /the model holds an object which is not observable/
    );
  });
});

describe("somebody who listened to a node before the recorder, and writes in it when told", function () {
  const refused =
    "a listener wrote in a node of the model while it was told of a write " +
    "in it: the two writes were heard in the wrong order";

  /**
   * What the way back of a mutator answers, on a hero somebody listens to.
   */
  function refusal<T extends object>(Fraktar: T, mutator: (hero: T) => void) {
    const recorder = createStepRecorder(Fraktar);
    recorder.start();
    runInAction(() => mutator(Fraktar));
    try {
      recorder.undo();
    } catch (error) {
      return (error as Error).message;
    }
    return "taken back";
  }

  it("should keep a hero whose effects are taken away as they come from being taken back", function () {
    const Fraktar = observable({ effects: new Set(["blessed"]) });
    observe(Fraktar.effects, (change) => {
      if (change.type === "add") {
        Fraktar.effects.delete(change.newValue);
      }
    });

    // The recorder is told of the effect which goes before the one which
    // comes: taken back in that order, the effect would stay.
    expect(refusal(Fraktar, (hero) => hero.effects.add("cursed"))).toBe(
      refused
    );
  });

  it("should keep a hero whose quests are abandoned as they are taken from it", function () {
    const Fraktar = observable({ quests: new Map([["dragon", 1]]) });
    observe(Fraktar.quests, (change) => {
      if (change.type === "add") {
        Fraktar.quests.delete(change.name);
      }
    });

    expect(refusal(Fraktar, (hero) => hero.quests.set("goblins", 0))).toBe(
      refused
    );
  });

  it("should keep a hero whose bag is emptied of what is put in it from it", function () {
    const Fraktar = observable({ bag: ["sword"] });
    observe(Fraktar.bag as IObservableArray<string>, (change) => {
      if (change.type === "splice" && change.addedCount) {
        Fraktar.bag.pop();
      }
    });

    expect(refusal(Fraktar, (hero) => hero.bag.push("potion"))).toBe(refused);
  });

  it("should keep a hero whose health is capped as it is written from it", function () {
    const Fraktar = observable({ hp: 3 });
    observe(Fraktar, "hp", ({ newValue }) => {
      if (newValue > 5) {
        Fraktar.hp = 5;
      }
    });

    expect(
      refusal(Fraktar, (hero) => {
        hero.hp = 9;
      })
    ).toBe(refused);
  });

  it("should keep a hero whose mana is capped as it is written from it", function () {
    const Fraktar = observable({ mana: observable.box(2) });
    observe(Fraktar.mana, ({ newValue }) => {
      if (newValue > 5) {
        Fraktar.mana.set(5);
      }
    });

    expect(refusal(Fraktar, (hero) => hero.mana.set(9))).toBe(refused);
  });

  it("should keep a hero whose party sends away who joins it from it", function () {
    const Fraktar = observable({
      party: new Set<{ name: string; isBanned?: boolean }>([
        { name: "Elwing" },
      ]),
    });
    observe(Fraktar.party, (change) => {
      if (change.type === "add" && change.newValue.isBanned) {
        Fraktar.party.delete(Array.from(Fraktar.party)[1]);
      }
    });

    expect(
      refusal(Fraktar, (hero) =>
        hero.party.add({ name: "Thrall", isBanned: true })
      )
    ).toBe(refused);
  });

  it("should keep the hero from it from then on: what the recorder knows of him is not sure anymore", function () {
    const Fraktar = observable({ hp: 3, effects: new Set(["blessed"]) });
    const dispose = observe(Fraktar.effects, (change) => {
      if (change.type === "add") {
        Fraktar.effects.delete(change.newValue);
      }
    });
    const recorder = createStepRecorder(Fraktar);
    recorder.start();
    runInAction(() => Fraktar.effects.add("cursed"));
    recorder.stop();
    dispose();

    recorder.start();
    runInAction(() => {
      Fraktar.hp = 10;
    });

    expect(() => recorder.undo()).toThrowError(refused);
  });

  it("should take back a hero somebody listens to and writes elsewhere", function () {
    const Fraktar = observable({ hp: 3, log: [] as string[] });
    observe(Fraktar, "hp", ({ newValue }) => {
      if (newValue > 5) {
        Fraktar.log.push("healed");
      }
    });

    mutateThenUndo(Fraktar, (hero) => {
      hero.hp = 9;
    });

    expect(toJS(Fraktar)).toEqual({ hp: 3, log: [] });
  });
});

describe("a hero whose recorder nobody holds anymore", function () {
  /**
   * Stands for the weak reference of the engine: the test says which
   * recorders are gone, where the engine would wait for its next collection.
   */
  const gone = new Set<object>();
  class Forgetful {
    constructor(private held: object) {}
    deref() {
      return gone.has(this.held) ? undefined : this.held;
    }
  }
  const engine = Object.getOwnPropertyDescriptor(
    globalThis,
    "WeakRef"
  ) as PropertyDescriptor;

  beforeEach(function () {
    gone.clear();
    Object.defineProperty(globalThis, "WeakRef", {
      ...engine,
      value: Forgetful,
    });
  });

  afterEach(function () {
    Object.defineProperty(globalThis, "WeakRef", engine);
  });

  it("should not be listened to anymore", function () {
    const Fraktar = observable({ hp: 3, quests: new Map([["dragon", 1]]) });
    const recorder = createStepRecorder(Fraktar);
    recorder.start();
    gone.add(recorder);

    runInAction(() => {
      Fraktar.hp = 5;
      Fraktar.quests.delete("dragon");
    });
    gone.clear();
    recorder.undo();

    // Nothing was heard, so nothing is taken back.
    expect(Fraktar.hp).toBe(5);
    expect(Fraktar.quests.size).toBe(0);
  });

  it("should have his quest log replaced as any other map is", function () {
    const quests = observable.map([
      ["dragon", 1],
      ["goblins", 0],
    ]);
    const recorder = createStepRecorder(observable({ quests }));
    recorder.start();
    gone.add(recorder);

    runInAction(() => {
      quests.replace([
        ["goblins", 0],
        ["dragon", 1],
      ]);
    });
    gone.clear();
    recorder.undo();

    // Nobody kept the order it had.
    expect(Array.from(quests.keys())).toEqual(["goblins", "dragon"]);
  });

  it("should leave what he shared to the heroes who still have a recorder", function () {
    const quests = observable.map([
      ["dragon", 1],
      ["goblins", 0],
    ]);
    const [first, second, third] = [0, 1, 2].map(() =>
      createStepRecorder(observable({ quests }))
    );
    gone.add(first);
    gone.add(third);

    second.start();
    runInAction(() => {
      quests.set("dragon", 2);
      quests.replace([
        ["goblins", 0],
        ["dragon", 2],
      ]);
    });
    second.undo();

    expect(Array.from(quests.entries())).toEqual([
      ["dragon", 1],
      ["goblins", 0],
    ]);
  });
});

describe("a hero on an engine which knows no weak reference", function () {
  const engine = Object.getOwnPropertyDescriptor(
    globalThis,
    "WeakRef"
  ) as PropertyDescriptor;

  beforeEach(function () {
    Reflect.deleteProperty(globalThis, "WeakRef");
  });

  afterEach(function () {
    Object.defineProperty(globalThis, "WeakRef", engine);
  });

  it("should be taken back as on any other", function () {
    const Fraktar = observable({ hp: 3, quests: new Map([["dragon", 1]]) });

    mutateThenUndo(Fraktar, (hero) => {
      hero.hp = 10;
      hero.quests.delete("dragon");
    });

    expect(toJS(Fraktar)).toEqual({ hp: 3, quests: new Map([["dragon", 1]]) });
  });
});
