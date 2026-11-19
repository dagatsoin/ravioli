// What the container costs on a model of N nodes, with and without what 1.8
// adds. Build first (yarn build), then:
//
//   yarn measure                  one awaited reaction, which reads no patch
//   MODE=none yarn measure        no reaction at all: nothing is listened to
//   MODE=journal yarn measure     an awaited reaction which reads the patches
//   MODE=return yarn measure      an awaited reaction which fails: each step
//                                 is taken back
//   NODES=200000 yarn measure     a bigger model (default 50000)
//
// The figures quoted in the commit messages and in the roadmap come from here.
const { observable, runInAction } = require("mobx");
const { createContainer } = require("../dist");

const NODES = Number(process.env.NODES) || 50000;
const MODE = process.env.MODE || "save";
const now = () => Number(process.hrtime.bigint()) / 1e6;
const heap = () => {
  global.gc();
  global.gc();
  return Math.round(process.memoryUsage().heapUsed / 1e6);
};
const say = (what, ms) =>
  console.log(`  ${what}: ${ms < 1 ? `${(ms * 1000).toFixed(0)} µs` : `${ms.toFixed(1)} ms`}`);

function createHero(state) {
  let factory = createContainer()
    .addAcceptor("live", { mutator: (data, adventure) => adventure(data) })
    .addActions({ live: "live" });
  if (MODE !== "none") {
    factory = factory.addStepReaction({
      awaitAsync: true,
      runOnInit: false,
      do: ({ delta }) => {
        if (MODE === "journal") {
          return delta.patches.length + delta.inversePatches.length;
        }
        if (MODE === "return") {
          return Promise.reject(new Error("the database is down"));
        }
      },
    });
  }
  return factory.create(state);
}

// Four nodes per item: the item, its tags, its meta, and what holds it.
function createModel() {
  const items = NODES / 4;
  const toItem = (id) => ({ id, name: `n${id}`, tags: ["a"], meta: { id } });
  return {
    list: Array.from({ length: items / 2 }, (_, id) => toItem(id)),
    byId: new Map(Array.from({ length: items / 2 }, (_, id) => [`k${id}`, toItem(id)])),
    party: new Set(Array.from({ length: 1000 }, (_, id) => ({ id }))),
    counter: 0,
  };
}

let taken = 0;
// The step, and its return when the save fails.
function live(hero, adventure) {
  taken++;
  return hero.attempt.live(adventure);
}

async function each(what, steps, adventure, hero) {
  for (let step = 0; step < 20; step++) {
    await live(hero, (data) => adventure(data, step));
  }
  const start = now();
  for (let step = 20; step < steps + 20; step++) {
    await live(hero, (data) => adventure(data, step));
  }
  say(`${what}, a step`, (now() - start) / steps);
}

async function once(what, state, adventure) {
  const hero = createHero(state);
  const start = now();
  await live(hero, adventure);
  say(what, now() - start);
}

(async () => {
  console.info = () => {};
  // Each return is said there.
  console.error = () => {};
  console.log(`${NODES} nodes, mode ${MODE}`);
  const before = heap();
  const start = now();
  const hero = createHero(createModel());
  say("creation", now() - start);
  console.log(`  memory: ${heap() - before} MB`);

  await each("one field of one item", 2000, (data, step) => {
    data.list[step % 100].name = `x${step}`;
  }, hero);
  await each("push an item at the end, or pop it", 500, (data, step) => {
    if (step % 2) data.list.pop();
    else data.list.push({ id: -step, name: "new", tags: [], meta: {} });
  }, hero);
  await each("shift the first item and push it back", 100, (data) => {
    data.list.push(data.list.shift());
  }, hero);
  await each("map: delete a key and set it back", 200, (data, step) => {
    const key = `k${step % 50}`;
    const item = data.byId.get(key);
    data.byId.delete(key);
    data.byId.set(key, item);
  }, hero);
  await each("sort the list", 5, (data, step) => {
    data.list.sort((a, b) => (step % 2 ? a.id - b.id : b.id - a.id));
  }, hero);
  await each("set of 1000 objects: add an object, or delete it", 500, (data, step) => {
    if (step % 2) data.party.delete(Array.from(data.party).pop());
    else data.party.add({ id: -step });
  }, hero);
  await each("set of 1000 objects: write in a member", 500, (data, step) => {
    data.party.forEach((member) => {
      if (member.id === 7) member.name = `x${step}`;
    });
  }, hero);
  // What is left behind: a step which keeps what it recorded, a node which
  // left the model and is still listened to.
  console.log(`  memory after ${taken} steps: ${heap() - before} MB`);

  // The same items in a new list at each step, as an acceptor written the
  // immutable way does. The lists which were replaced must not pile up.
  const bag = createHero({ bag: Array.from({ length: 5 }, (_, id) => ({ id, uses: 0 })) });
  const replace = async (steps) => {
    const start = now();
    for (let step = 0; step < steps; step++) {
      await live(bag, (data) => {
        data.bag = data.bag.filter(() => true);
        data.bag.forEach((item) => item.uses++);
      });
    }
    return (now() - start) / steps;
  };
  say("a list replaced by one of the same items, the first 200 steps, a step", await replace(200));
  await replace(10000);
  say("the same, 10000 steps later, a step", await replace(200));

  // A map which outlives its containers: one container per request over the
  // same reference data. None is kept: they must be collected, and writing
  // in the map must cost the same.
  const shared = observable.map([["a", 1], ["b", 2]]);
  const kept = heap();
  for (let made = 0; made < 5000; made++) {
    createHero({ store: shared, big: new Array(1000).fill(0) });
  }
  // What is held weakly is let go of once the task which made it is over.
  await new Promise((resolve) => setImmediate(resolve));
  console.log(`  5000 containers made over one map, none kept: ${heap() - kept} MB more`);
  const written = now();
  runInAction(() => shared.set("a", 2));
  say("a write in that map", now() - written);
  const replaced = now();
  runInAction(() => shared.replace([["b", 2], ["a", 2]]));
  say("the map replaced", now() - replaced);

  console.log("one step, on a collection of its own");
  const toObjects = (length) => Array.from({ length }, (_, id) => ({ id }));
  for (const size of [8000, 32000]) {
    await once(`a set of ${size} objects, cleared`, { party: new Set(toObjects(size)) }, (data) =>
      data.party.clear()
    );
  }
  for (const size of [8000, 32000]) {
    await once(`a set of ${size} objects, one removed`, { party: new Set(toObjects(size)) }, (data) =>
      data.party.delete(Array.from(data.party)[0])
    );
  }
  for (const size of [8000, 32000]) {
    await once(`an empty set, ${size} objects added`, { party: new Set() }, (data) => {
      for (let id = 0; id < size; id++) data.party.add({ id });
    });
  }
  for (const size of [20000, 80000]) {
    await once(`a list of ${size} objects, popped one by one`, { list: toObjects(size) }, (data) => {
      for (let item = 0; item < size; item++) data.list.pop();
    });
  }
  for (const size of [20000, 80000]) {
    await once(`a list of ${size} objects, 2000 shifts`, { list: toObjects(size) }, (data) => {
      for (let item = 0; item < 2000; item++) data.list.shift();
    });
  }
  // What MobX alone spends on the same shifts.
  const list = observable(toObjects(80000));
  const shifts = now();
  for (let item = 0; item < 2000; item++) list.shift();
  say("MobX alone, a list of 80000 objects, 2000 shifts", now() - shifts);
})();
