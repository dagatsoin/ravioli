import * as mobx from "mobx";
import {
  Delta,
  Patch,
  Step,
  StepDelta,
  applyPatch,
  createContainer,
  jsonCopy,
} from "../..";
import { Write, persist, settle } from "./helpers";

type Sheet = {
  name: string;
  stats: { hp: number; purse: { gold: number } };
  inventory: Array<{ id: string; quantity: number }>;
  quests: Map<string, { progress: number }>;
  effects: Set<string>;
  party: Set<{ name: string }>;
  pet?: { name: string };
  title?: string;
};

/**
 * One entry of the journal: what a step did.
 */
type Entry = { stepId: number; patches: Patch[]; inversePatches: Patch[] };

/**
 * A hero of every shape: nested sheets, a list, a map and two sets. A step
 * reaction writes the patches of each step in a journal.
 */
function createFraktar(journal: Entry[]) {
  const Fraktar = createContainer<Sheet>()
    .addAcceptor("setHP", {
      mutator: (data, hp: number) => {
        data.stats.hp = hp;
      },
    })
    .addAcceptor("rename", {
      mutator: (data, name: string) => {
        data.name = name;
      },
    })
    .addAcceptor("addItem", {
      mutator: (data, id: string) => {
        data.inventory.push({ id, quantity: 1 });
      },
    })
    .addAcceptor("adventure", {
      mutator: (data) => {
        data.stats.hp = 1;
        data.stats.purse = { gold: 100 };
        delete data.title;
        data.pet = { name: "Rex" };
        data.inventory[0].quantity = 0;
        data.inventory.push({ id: "shield", quantity: 1 });
        data.inventory.splice(0, 1);
        data.inventory.reverse();
        data.quests.get("dragon")!.progress = 3;
        data.quests.delete("goblins");
        data.quests.set("lich", { progress: 0 });
        data.effects.delete("poisoned");
        data.effects.add("burning");
        data.party.forEach((member) => {
          member.name = member.name.toUpperCase();
        });
        data.party.add({ name: "Thrall" });
      },
    })
    .addControlStatePredicate("IS_ALIVE", ({ data }) => data.stats.hp > 0)
    .addActions({
      setHP: "setHP",
      rename: "rename",
      addItem: "addItem",
      adventure: "adventure",
    })
    .addStepReaction({
      debugName: "journal",
      runOnInit: false,
      do: ({ delta }) => {
        journal.push({
          stepId: Fraktar.stepId,
          patches: delta.patches,
          inversePatches: delta.inversePatches,
        });
      },
    })
    .create({
      name: "Fraktar",
      title: "the brave",
      stats: { hp: 10, purse: { gold: 5 } },
      inventory: [
        { id: "sword", quantity: 1 },
        { id: "potion", quantity: 3 },
        { id: "rope", quantity: 1 },
      ],
      quests: new Map([
        ["dragon", { progress: 1 }],
        ["goblins", { progress: 0 }],
        ["princess", { progress: 2 }],
      ]),
      effects: new Set(["poisoned", "blessed"]),
      party: new Set([{ name: "Elwing" }]),
    });

  return Fraktar;
}

beforeEach(function () {
  jest.spyOn(console, "info").mockImplementation(() => {});
  jest.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(function () {
  jest.restoreAllMocks();
});

describe("the patches of a step", function () {
  it("should be given to the reactions, one per write in the model", function () {
    const journal: Entry[] = [];
    const Fraktar = createFraktar(journal);

    Fraktar.compose(({ setHP, rename }) => [
      setHP(5),
      rename("Fraktar the wounded"),
    ]);

    expect(journal.length).toBe(1);
    expect(journal[0].patches).toEqual([
      [{ op: "replace", path: "/stats/hp", value: 5 }],
      [{ op: "replace", path: "/name", value: "Fraktar the wounded" }],
    ]);
  });

  it("should come with what undoes them, last write first", function () {
    const journal: Entry[] = [];
    const Fraktar = createFraktar(journal);

    Fraktar.compose(({ setHP, rename }) => [
      setHP(5),
      rename("Fraktar the wounded"),
    ]);

    expect(journal[0].inversePatches).toEqual([
      [{ op: "replace", path: "/name", value: "Fraktar" }],
      [{ op: "replace", path: "/stats/hp", value: 10 }],
    ]);
  });

  it("should tell the model data only", function () {
    const journal: Entry[] = [];
    const Fraktar = createFraktar(journal);

    // The hero dies: the step id ticks and IS_ALIVE goes away.
    Fraktar.actions.setHP(0);

    expect(Fraktar.controlStates).toEqual([]);
    // Neither is in the patches. They are in the delta, where they were.
    expect(journal[0].patches).toEqual([
      [{ op: "replace", path: "/stats/hp", value: 0 }],
    ]);
  });

  it("should hold copies: a later step does not rewrite them", function () {
    const journal: Entry[] = [];
    const Fraktar = createFraktar(journal);

    Fraktar.actions.addItem("shield");
    Fraktar.actions.adventure();

    // The shield was moved in the bag since.
    expect(journal[0].patches).toEqual([
      [
        {
          op: "add",
          path: "/inventory/3",
          value: { id: "shield", quantity: 1 },
        },
      ],
    ]);
  });

  it("should lead a JSON copy from before the step to after it, on every shape", function () {
    const journal: Entry[] = [];
    const Fraktar = createFraktar(journal);
    const before = jsonCopy(Fraktar.representationRef.current);

    Fraktar.actions.adventure();

    const after = jsonCopy(Fraktar.representationRef.current);
    expect(after).not.toEqual(before);
    expect(journal[0].patches.reduce(applyPatch, jsonCopy(before))).toEqual(
      after
    );
  });

  it("should be undone by the inverse patches, on every shape", function () {
    const journal: Entry[] = [];
    const Fraktar = createFraktar(journal);
    const before = jsonCopy(Fraktar.representationRef.current);

    Fraktar.actions.adventure();

    const after = jsonCopy(Fraktar.representationRef.current);
    expect(journal[0].inversePatches.reduce(applyPatch, after)).toEqual(before);
  });

  it("should write a map as an object and a set as its members", function () {
    const journal: Entry[] = [];
    const Fraktar = createFraktar(journal);

    Fraktar.actions.adventure();

    // The last seven writes of the adventure, each one its own patch.
    expect(journal[0].patches.slice(-7)).toEqual([
      [{ op: "replace", path: "/quests/dragon/progress", value: 3 }],
      [{ op: "remove", path: "/quests/goblins" }],
      [{ op: "add", path: "/quests/lich", value: { progress: 0 } }],
      [{ op: "remove", path: "/effects/poisoned" }],
      [{ op: "add", path: "/effects/burning", value: true }],
      [
        { op: "remove", path: '/party/{"name":"Elwing"}' },
        { op: "add", path: '/party/{"name":"ELWING"}', value: true },
      ],
      [{ op: "add", path: '/party/{"name":"Thrall"}', value: true }],
    ]);
  });
});

describe("a journal of the steps", function () {
  it("should replay the hero from its first copy", function () {
    const journal: Entry[] = [];
    const Fraktar = createFraktar(journal);
    const first = jsonCopy(Fraktar.representationRef.current);

    Fraktar.actions.setHP(7);
    Fraktar.actions.addItem("shield");
    Fraktar.actions.adventure();
    Fraktar.actions.rename("Fraktar the reckless");

    const replayed = journal.reduce(
      (copy, entry) => entry.patches.reduce(applyPatch, copy),
      first
    );

    expect(journal.map(({ stepId }) => stepId)).toEqual([1, 2, 3, 4]);
    expect(replayed).toEqual(jsonCopy(Fraktar.representationRef.current));
  });

  it("should walk the hero back to any step", function () {
    const journal: Entry[] = [];
    const Fraktar = createFraktar(journal);

    Fraktar.actions.setHP(7);
    const afterTheFirstStep = jsonCopy(Fraktar.representationRef.current);
    Fraktar.actions.addItem("shield");
    Fraktar.actions.adventure();

    // The last entry first, each one undone by its inverse patches.
    const walkedBack = journal
      .slice(1)
      .reverse()
      .reduce(
        (copy, entry) => entry.inversePatches.reduce(applyPatch, copy),
        jsonCopy(Fraktar.representationRef.current)
      );

    expect(walkedBack).toEqual(afterTheFirstStep);
  });

  it("should not hold a step the model refused", function () {
    const journal: Entry[] = [];
    const Fraktar = createFraktar(journal);

    // No acceptor is bound to it: no step, so nothing to write down.
    Fraktar.compose([[{ type: "curse", payload: undefined } as any]]);
    Fraktar.actions.setHP(5);

    expect(journal.map(({ stepId }) => stepId)).toEqual([1]);
  });
});

describe("the moment the patches are read", function () {
  type Model = { hp: number; inventory: string[] };

  function createHero(read: (delta: StepDelta<any, any>) => unknown) {
    return createContainer<Model>()
      .addAcceptor("setHP", {
        mutator: (data, hp: number) => {
          data.hp = hp;
        },
      })
      .addActions({ setHP: "setHP" })
      .addStepReaction({ runOnInit: false, do: ({ delta }) => read(delta) })
      .create({ hp: 10, inventory: [] });
  }

  it("should be while the reactions of the step run, even after a wait", async function () {
    const writes: Write[] = [];
    const journal: Patch[][] = [];
    const Fraktar = createContainer<Model>()
      .addAcceptor("setHP", {
        mutator: (data, hp: number) => {
          data.hp = hp;
        },
      })
      .addActions({ setHP: "setHP" })
      .addStepReaction({
        awaitAsync: true,
        runOnInit: false,
        do: async ({ delta }) => {
          await new Promise<void>((done, fail) => writes.push({ done, fail }));
          // The step waits for this reaction: nothing moved meanwhile.
          journal.push(delta.patches);
        },
      })
      .create({ hp: 10, inventory: [] });

    Fraktar.actions.setHP(5);
    Fraktar.actions.setHP(1);
    writes[0].done();
    await settle();

    expect(journal).toEqual([[[{ op: "replace", path: "/hp", value: 5 }]]]);
  });

  it("should not be once the step is over: the model moved on", function () {
    const kept: Array<StepDelta<any, any>> = [];
    const Fraktar = createHero((delta) => kept.push(delta));

    Fraktar.actions.setHP(5);

    expect(() => kept[0].patches).toThrowError(
      "[RAVIOLI] The patches of a step are read while its reactions run. " +
        "A reaction which is not awaited reads them before it waits on anything."
    );
    expect(() => kept[0].inversePatches).toThrowError(
      /The patches of a step are read while its reactions run/
    );
  });

  it("should leave patches which were read as they are once the step is over", function () {
    const kept: Array<StepDelta<any, any>> = [];
    const Fraktar = createHero((delta) => {
      delta.patches;
      kept.push(delta);
    });

    Fraktar.actions.setHP(5);
    Fraktar.actions.setHP(1);

    expect(kept[0].patches).toEqual([
      [{ op: "replace", path: "/hp", value: 5 }],
    ]);
  });
});

describe("a step nobody reads the patches of", function () {
  /**
   * A chest MobX keeps as it is, and which notes each look at its gold.
   */
  function createChest(gold: number, looks: number[]): object {
    return Object.defineProperty({}, "gold", {
      enumerable: true,
      get: () => {
        looks.push(gold);
        return gold;
      },
    });
  }

  it("should copy nothing of the model", function () {
    const looks: number[] = [];
    const steps: number[] = [];
    const Fraktar = createContainer<{ chest: object }>()
      .addAcceptor("loot", {
        mutator: (data, chest: object) => {
          data.chest = chest;
        },
      })
      .addActions({ loot: "loot" })
      // It is handed the delta, and does not read the patches.
      .addStepReaction({
        runOnInit: false,
        do: ({ delta }) => steps.push(delta.acceptedMutations.length),
      })
      .create(
        mobx.observable(
          { chest: createChest(5, looks) },
          { chest: mobx.observable.ref }
        )
      );

    Fraktar.actions.loot(createChest(100, looks));

    expect(steps).toEqual([1]);
    expect(looks).toEqual([]);
  });
});

describe("a container which has no reaction", function () {
  it("should not listen to its model: nobody could read what it would record", function () {
    // The three ways MobX gives to hear of a write.
    const observe = jest.spyOn(mobx, "observe");
    const intercept = jest.spyOn(mobx, "intercept");
    const spy = jest.spyOn(mobx, "spy");

    const Fraktar = createContainer<{ hp: number; inventory: string[] }>()
      .addAcceptor("setHP", {
        mutator: (data, hp: number) => {
          data.hp = hp;
        },
      })
      .addActions({ setHP: "setHP" })
      .create({ hp: 10, inventory: [] });
    Fraktar.actions.setHP(5);

    expect(observe).not.toHaveBeenCalled();
    expect(intercept).not.toHaveBeenCalled();
    expect(spy).not.toHaveBeenCalled();
    expect(Fraktar.representationRef.current.hp).toBe(5);
  });
});

describe("the patches of a step which is taken back", function () {
  it("should be the ones the return undoes", async function () {
    const journal: Entry[] = [];
    const writes: Write[] = [];
    const Fraktar = createContainer<{ hp: number; inventory: string[] }>()
      .addAcceptor("loot", {
        mutator: (data, item: string) => {
          data.hp -= 1;
          data.inventory.push(item);
        },
      })
      .addActions({ loot: "loot" })
      .addStepReaction({
        debugName: "journal",
        runOnInit: false,
        do: ({ delta }) => {
          journal.push({
            stepId: Fraktar.stepId,
            patches: delta.patches,
            inversePatches: delta.inversePatches,
          });
        },
      })
      .addStepReaction(persist(writes))
      .create({ hp: 10, inventory: ["sword"] });
    const before = jsonCopy(Fraktar.representationRef.current);

    Fraktar.actions.loot("potion");
    const after = jsonCopy(Fraktar.representationRef.current);
    writes[0].fail(new Error("the database is down"));
    await settle();

    // The journal and the return come from the same record.
    expect(jsonCopy(Fraktar.representationRef.current)).toEqual(before);
    expect(journal[0].inversePatches.reduce(applyPatch, after)).toEqual(before);
  });

  it("should not tell what a reaction wrote in the model behind the acceptors", function () {
    const journal: Patch[][] = [];
    const Fraktar = createContainer<{ hp: number; inventory: string[] }>()
      .addAcceptor("setHP", {
        mutator: (data, hp: number) => {
          data.hp = hp;
        },
      })
      .addActions({ setHP: "setHP" })
      // Not what a reaction is for, but nothing stops it.
      .addStepReaction({
        runOnInit: false,
        do: ({ data }) => {
          data.inventory.push("stolen ring");
        },
      })
      .addStepReaction({
        debugName: "journal",
        runOnInit: false,
        do: ({ delta }) => {
          journal.push(delta.patches);
        },
      })
      .create({ hp: 10, inventory: [] });

    Fraktar.actions.setHP(5);

    // The patches are those of the step, as the acceptors made it.
    expect(journal[0]).toEqual([[{ op: "replace", path: "/hp", value: 5 }]]);
  });
});

describe("the patches outside of a step", function () {
  type Model = { hp: number };
  type SetHP = { type: "setHP"; payload: number };

  /**
   * A hero whose reaction keeps a copy of each delta it is given, the patches
   * read on the spot.
   */
  function createRecorded(deltas: Array<StepDelta<SetHP, never>>) {
    return createContainer<Model>()
      .addAcceptor("setHP", {
        mutator: (data, hp: number) => {
          data.hp = hp;
        },
      })
      .addActions({ setHP: "setHP" })
      .addStepReaction({
        do: ({ delta }) =>
          deltas.push({
            acceptedMutations: delta.acceptedMutations.slice(),
            proposal: Object.assign(delta.proposal.slice(), {
              stepId: delta.proposal.stepId,
            }),
            controlStates: delta.controlStates.slice(),
            previousControlStates: delta.previousControlStates.slice(),
            patches: delta.patches,
            inversePatches: delta.inversePatches,
          }),
      })
      .create({ hp: 10 });
  }

  it("should be empty at creation and after a reset: no step happened", function () {
    const deltas: Array<StepDelta<SetHP, never>> = [];
    const Fraktar = createRecorded(deltas);

    expect(deltas[0].patches).toEqual([]);
    expect(deltas[0].inversePatches).toEqual([]);

    Fraktar.actions.setHP(5);
    Fraktar.reset({ hp: 10 });

    expect(deltas[2].patches).toEqual([]);
    expect(deltas[2].inversePatches).toEqual([]);
  });

  it("should be the ones of the step a rollback is given", function () {
    const deltas: Array<StepDelta<SetHP, never>> = [];
    const Fraktar = createRecorded(deltas);

    Fraktar.actions.setHP(5);
    Fraktar.actions.setHP(1);
    Fraktar.rollback({ data: { hp: 5 }, delta: deltas[1] });

    // The arrival at the step is replayed as it was recorded.
    expect(deltas[3].patches).toEqual([
      [{ op: "replace", path: "/hp", value: 5 }],
    ]);
    expect(deltas[3].inversePatches).toEqual([
      [{ op: "replace", path: "/hp", value: 10 }],
    ]);
  });

  it("should be none when the step a rollback is given was built without them", function () {
    const deltas: Array<StepDelta<SetHP, never>> = [];
    const Fraktar = createRecorded(deltas);
    // As anybody wrote a step before the patches existed.
    const step: Step<Model, SetHP, never> = {
      data: { hp: 5 },
      delta: {
        acceptedMutations: [{ type: "setHP", payload: 5 }],
        proposal: Object.assign([{ type: "setHP" as const, payload: 5 }], {
          stepId: 0,
        }),
        controlStates: [],
        previousControlStates: [],
      },
    };

    Fraktar.rollback(step);

    expect(Fraktar.representationRef.current.hp).toBe(5);
    expect(deltas[1].patches).toEqual([]);
    expect(deltas[1].inversePatches).toEqual([]);
  });

  it("should be recorded again for the step which follows a rollback", function () {
    const deltas: Array<StepDelta<SetHP, never>> = [];
    const Fraktar = createRecorded(deltas);

    Fraktar.actions.setHP(5);
    Fraktar.rollback({ data: { hp: 2 }, delta: deltas[1] });
    Fraktar.actions.setHP(8);

    // What the rollback wrote in the model is not a step: it is in no patch.
    expect(deltas[3].patches).toEqual([
      [{ op: "replace", path: "/hp", value: 8 }],
    ]);
    expect(deltas[3].inversePatches).toEqual([
      [{ op: "replace", path: "/hp", value: 2 }],
    ]);
  });
});

describe("a step started by a reaction", function () {
  it("should have patches of its own", function () {
    const journal: Patch[][] = [];
    const Fraktar = createContainer<{ hp: number; inventory: string[] }>()
      .addAcceptor("setHP", {
        mutator: (data, hp: number) => {
          data.hp = hp;
        },
      })
      .addAcceptor("addItem", {
        mutator: (data, item: string) => {
          data.inventory.push(item);
        },
      })
      .addActions({ setHP: "setHP", addItem: "addItem" })
      .addStepReaction({
        runOnInit: false,
        do: ({ delta }) => journal.push(delta.patches),
      })
      .addStepReaction({
        debugName: "loot",
        runOnInit: false,
        when: ({ delta }) =>
          delta.acceptedMutations.some(({ type }) => type === "setHP"),
        do: ({ actions }) => actions.addItem("potion"),
      })
      .create({ hp: 10, inventory: [] });

    Fraktar.actions.setHP(5);

    expect(journal).toEqual([
      [[{ op: "replace", path: "/hp", value: 5 }]],
      [[{ op: "add", path: "/inventory/0", value: "potion" }]],
    ]);
  });
});

describe("the steps which follow a step which was taken back", function () {
  /**
   * A hero who writes down each step in a journal, with a copy of the model
   * right after it, and whose first write to the database fails.
   */
  function createChronicler<T>(state: T) {
    const journal: Patch[][] = [];
    const copies: unknown[] = [];
    const writes: Write[] = [];
    const Fraktar = createContainer<T>()
      .addAcceptor("live", {
        mutator: (data, adventure: (hero: T) => void) => adventure(data),
      })
      .addActions({ live: "live" })
      .addStepReaction({
        runOnInit: false,
        do: ({ data, delta }) => {
          journal.push(delta.patches);
          copies.push(jsonCopy(data));
        },
      })
      .addStepReaction(persist(writes))
      .create(state);
    return { Fraktar, journal, copies, writes };
  }

  it("should be told when a list was given again as a new list", async function () {
    const { Fraktar, journal, writes } = createChronicler({
      todos: [
        { title: "sharpen the sword", done: false, tags: [] as string[] },
        { title: "feed Rex", done: true, tags: [] as string[] },
      ],
    });

    Fraktar.actions.live((hero) => {
      hero.todos = hero.todos.filter(({ done }) => !done);
    });
    writes[0].fail(new Error("the database is down"));
    await settle();
    Fraktar.actions.live((hero) => {
      hero.todos[1].tags.push("urgent");
    });

    expect(journal[1]).toEqual([
      [{ op: "add", path: "/todos/1/tags/0", value: "urgent" }],
    ]);
  });

  it("should be told once, where a card which was moved came back", async function () {
    const { Fraktar, journal, writes } = createChronicler({
      todo: [
        { id: 1, owner: { name: "Elwing", title: "dr", tags: [] as string[] } },
      ],
      done: [] as Array<{ id: number; owner: object }>,
    });

    Fraktar.actions.live((board) => {
      const card = board.todo.pop()!;
      card.owner = { name: "Thrall", title: "", tags: [] };
      board.done.push(card);
    });
    writes[0].fail(new Error("the database is down"));
    await settle();
    Fraktar.actions.live((board) => {
      board.todo[0].owner.tags.push("urgent");
    });

    // The owner who came back is at the card once, as before.
    expect(journal[1]).toEqual([
      [{ op: "add", path: "/todo/0/owner/tags/0", value: "urgent" }],
    ]);
  });

  it("should be told where a node which left and came back in one step is", async function () {
    const { Fraktar, journal, writes } = createChronicler<any>({
      left: { stats: { purse: { gold: 5 } } },
      right: { stats: null },
    });

    Fraktar.actions.live((hero) => {
      const stats = hero.left.stats;
      hero.left.stats = null;
      hero.right.stats = stats;
    });
    writes[0].done();
    await settle();
    Fraktar.actions.live((hero) => {
      hero.right.stats.purse.gold = 9;
    });

    expect(journal[1]).toEqual([
      [{ op: "replace", path: "/right/stats/purse/gold", value: 9 }],
    ]);
  });
});

describe("a delta which is gone through, as a 1.7 program does", function () {
  /**
   * A hero whose reaction keeps the delta it is given, and reads nothing.
   */
  function createKeeper() {
    const kept: Array<StepDelta<{ type: "setHP"; payload: number }, never>> =
      [];
    const Fraktar = createContainer<{ hp: number }>()
      .addAcceptor("setHP", {
        mutator: (data, hp: number) => {
          data.hp = hp;
        },
      })
      .addActions({ setHP: "setHP" })
      .addStepReaction({ do: ({ delta }) => kept.push(delta) })
      .create({ hp: 10 });
    return { Fraktar, kept };
  }

  it("should not list the patches, at creation or after a step", function () {
    const { Fraktar, kept } = createKeeper();

    Fraktar.actions.setHP(5);

    const fields = [
      "acceptedMutations",
      "proposal",
      "controlStates",
      "previousControlStates",
    ];
    expect(Object.keys(kept[0])).toEqual(fields);
    expect(Object.keys(kept[1])).toEqual(fields);
  });

  it("should be written down, copied and compared once the step is over", function () {
    const { Fraktar, kept } = createKeeper();

    Fraktar.actions.setHP(5);
    Fraktar.actions.setHP(1);

    // Nothing of this reads the patches, which can not be read anymore.
    expect(JSON.parse(JSON.stringify(kept[1])).acceptedMutations).toEqual([
      { type: "setHP", payload: 5 },
    ]);
    expect({ ...kept[1] }.acceptedMutations).toEqual([
      { type: "setHP", payload: 5 },
    ]);
    expect(kept[1]).toEqual({
      acceptedMutations: [{ type: "setHP", payload: 5 }],
      proposal: Object.assign([{ type: "setHP", payload: 5 }], { stepId: 0 }),
      controlStates: [],
      previousControlStates: [],
    });
  });

  it("should be given to a rollback as it is, the patches then read as none", function () {
    const { Fraktar, kept } = createKeeper();
    Fraktar.actions.setHP(5);
    Fraktar.actions.setHP(1);

    // A copy of the delta, as a program which stores its steps makes.
    Fraktar.rollback({ data: { hp: 5 }, delta: { ...kept[1] } });

    expect(Fraktar.representationRef.current.hp).toBe(5);
    expect(kept[3].patches).toEqual([]);
  });
});

describe("a program which writes its own patches on the delta, as it did in 1.7", function () {
  it("should find them where it wrote them, and so should the next reaction", function () {
    const read: unknown[] = [];
    const Fraktar = createContainer<{ hp: number }>()
      .addAcceptor("setHP", {
        mutator: (data, hp: number) => {
          data.hp = hp;
        },
      })
      .addActions({ setHP: "setHP" })
      .addStepReaction({
        runOnInit: false,
        do: ({ delta, data }) => {
          delta.patches = [[{ op: "replace", path: "/life", value: data.hp }]];
        },
      })
      .addStepReaction({
        runOnInit: false,
        do: ({ delta }) => read.push(delta.patches, Object.keys(delta)),
      })
      .create({ hp: 10 });

    Fraktar.actions.setHP(5);

    expect(read).toEqual([
      [[{ op: "replace", path: "/life", value: 5 }]],
      // Listed from then on, as any field a program adds.
      [
        "acceptedMutations",
        "proposal",
        "controlStates",
        "previousControlStates",
        "patches",
      ],
    ]);
  });

  it("should leave the other way as the step wrote it", function () {
    const read: unknown[] = [];
    const Fraktar = createContainer<{ hp: number }>()
      .addAcceptor("setHP", {
        mutator: (data, hp: number) => {
          data.hp = hp;
        },
      })
      .addActions({ setHP: "setHP" })
      .addStepReaction({
        runOnInit: false,
        do: ({ delta }) => {
          delta.inversePatches = [];
          read.push(delta.inversePatches, delta.patches);
        },
      })
      .create({ hp: 10 });

    Fraktar.actions.setHP(5);

    expect(read).toEqual([[], [[{ op: "replace", path: "/hp", value: 5 }]]]);
  });
});

describe("a delta built by hand, as a test of a reaction does", function () {
  it("should be given its patches as well, none for example, to call a reaction", function () {
    const journal: Patch[][] = [];
    const factory = createContainer<{ hp: number }>()
      .addAcceptor("setHP", {
        mutator: (data, hp: number) => {
          data.hp = hp;
        },
      })
      .addActions({ setHP: "setHP" });
    const persist: Parameters<typeof factory.addStepReaction>[0] = {
      runOnInit: false,
      // No fallback: a reaction is always given the patches.
      do: ({ delta }) => {
        journal.push(delta.patches);
      },
    };
    const Fraktar = factory.addStepReaction(persist).create({ hp: 10 });
    const byHand: StepDelta<{ type: "setHP"; payload: number }, never> = {
      acceptedMutations: [],
      proposal: Object.assign([], { stepId: 4 }),
      controlStates: [],
      previousControlStates: [],
      patches: [],
      inversePatches: [],
    };

    persist.do({
      delta: byHand,
      data: { hp: 10 },
      representation: { hp: 10 },
      actions: Fraktar.actions,
      compose: Fraktar.compose,
    });

    expect(journal).toEqual([[]]);
  });

  it("should not need any to be rolled back to", function () {
    const journal: Patch[][] = [];
    const Fraktar = createContainer<{ hp: number }>()
      .addStepReaction({
        runOnInit: false,
        do: ({ delta }) => {
          journal.push(delta.patches);
        },
      })
      .create({ hp: 10 });
    // The delta of a step, as 1.7 has it.
    const byHand: Delta<never, never> = {
      acceptedMutations: [],
      proposal: Object.assign([], { stepId: 4 }),
      controlStates: [],
      previousControlStates: [],
    };

    Fraktar.rollback({ data: { hp: 3 }, delta: byHand });

    expect(Fraktar.stepId).toBe(5);
    expect(journal).toEqual([[]]);
  });
});

describe("the patches of a step while the model holds what MobX does not observe", function () {
  it("should not be read: no patch would tell what is written in it", async function () {
    const errors: unknown[] = [];
    const Fraktar = createContainer<{ hp: number; bornAt: Date }>()
      .addAcceptor("setHP", {
        mutator: (data, hp: number) => {
          data.hp = hp;
        },
      })
      .addActions({ setHP: "setHP" })
      .addStepReaction({
        runOnInit: false,
        do: ({ delta }) => {
          try {
            delta.patches;
          } catch (error) {
            errors.push(error);
          }
        },
      })
      .create({ hp: 10, bornAt: new Date(0) });

    Fraktar.actions.setHP(5);

    expect(errors).toEqual([
      new Error(
        "[RAVIOLI] The patches of this step can not be written: the model " +
          "holds a Date at /bornAt, which MobX does not observe: nothing " +
          "tells what was written in it."
      ),
    ]);
  });
});

describe("a boxed value in a list", function () {
  it("should be told as an item, which stays when it holds nothing", function () {
    const journal: Patch[][] = [];
    const inverses: Patch[][] = [];
    const slot = mobx.observable.box<string | undefined>("sword");
    const Fraktar = createContainer<{ slots: Array<typeof slot> }>()
      .addAcceptor("empty", {
        mutator: (data) => {
          data.slots[0].set(undefined);
        },
      })
      .addActions({ empty: "empty" })
      .addStepReaction({
        runOnInit: false,
        do: ({ delta }) => {
          journal.push(delta.patches);
          inverses.push(delta.inversePatches);
        },
      })
      .create({ slots: [slot] });

    Fraktar.actions.empty();

    // Not a remove: the list still has one slot.
    expect(journal[0]).toEqual([
      [{ op: "replace", path: "/slots/0", value: null }],
    ]);
    expect(inverses[0]).toEqual([
      [{ op: "replace", path: "/slots/0", value: "sword" }],
    ]);
  });
});
