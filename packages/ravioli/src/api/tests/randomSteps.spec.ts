import {
  isBoxedObservable,
  isObservableArray,
  isObservableMap,
  isObservableObject,
  isObservableSet,
  makeAutoObservable,
  observable,
  runInAction,
} from "mobx";
import { Attempt, Patch, PatchOperation, createContainer } from "../..";
import { Write, settle } from "./helpers";

/**
 * Steps drawn at random on models of every shape. Nothing here knows how the
 * library records a step: the JSON copy, the picture and the way a patch is
 * applied are written again below, on purpose.
 *
 * After each step, the patches applied to the copy from before must give the
 * model, and the inverse patches the copy from before. Half of the steps have
 * their write fail: the model must then be exactly what it was, and the steps
 * which follow must still be told right.
 *
 * A story is a few steps or many. The nodes a step takes out of the model stay
 * in the hero's hand, where a later step finds them. Somebody writes in the
 * model while a step is saved, the patches are read at once, late, one way
 * only or not at all, and the hero is reset or rolled back in between. Now and
 * then a mutator sends an action in the middle of its step: it must be
 * refused, and change nothing.
 */

type Random = { next(): number; int(below: number): number };

/**
 * The same draws for the same seed, on every machine.
 */
function createRandom(seed: number): Random {
  let state = seed;
  const next = () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
  return { next, int: (below) => Math.floor(next() * below) };
}

const KEYS = [
  "a",
  "b",
  "c",
  "a/b",
  "x~y",
  "~1",
  "",
  "0",
  "1",
  "10",
  "-",
  "é",
  "constructor",
  "__proto__x",
];
/**
 * A map takes any key. Some read the same in a JSON copy: 1 and "1", NaN and
 * "NaN".
 */
const QUEST = Symbol("quest");
const ODD_KEYS = [1, 10, 2.5, true, null, NaN, "NaN", QUEST];
const SECRET = Symbol("secret");
const MEMBERS = ["s1", "s2", "s/3", "s~4", 5, 6, 7, "5", null, true];
const VALUES = [0, 1, -2, "x", "", true, false, null, 3.5, "a/b", "true"];

/**
 * A class MobX is told every field of, but for the owner: the constructor
 * gives it no value, so MobX does not know of it when a step writes it.
 */
class Pet {
  name = "Rex";
  level = 1;
  toys: unknown[] = ["bone"];
  owner?: unknown;
  constructor() {
    makeAutoObservable(this);
  }
}

function isNode(value: unknown): boolean {
  return (
    isBoxedObservable(value) ||
    isObservableArray(value) ||
    isObservableMap(value) ||
    isObservableSet(value) ||
    isObservableObject(value)
  );
}

/**
 * What a node holds, each with the key it is under.
 */
function entriesOf(node: any): Array<[any, any]> {
  const entries: Array<[any, any]> = [];
  if (isBoxedObservable(node)) {
    entries.push([undefined, node.get()]);
  } else if (isObservableArray(node)) {
    node.forEach((child: any, index: number) => entries.push([index, child]));
  } else if (isObservableMap(node)) {
    node.forEach((child: any, key: any) => entries.push([key, child]));
  } else if (isObservableSet(node)) {
    node.forEach((child: any) => entries.push([child, child]));
  } else {
    Object.keys(node).forEach((key) => entries.push([key, node[key]]));
  }
  return entries;
}

function nodesOf(roots: any[]): any[] {
  const seen = new Set<any>();
  const walk = (node: any) => {
    if (isNode(node) && !seen.has(node)) {
      seen.add(node);
      entriesOf(node).forEach(([, child]) => walk(child));
    }
  };
  roots.forEach(walk);
  return Array.from(seen);
}

/**
 * Every place a node is held at: [holder, key, node].
 */
function edgesOf(roots: any[]): Array<[any, any, any]> {
  const edges: Array<[any, any, any]> = [];
  nodesOf(roots).forEach((holder) =>
    entriesOf(holder).forEach(([key, child]) => {
      if (isNode(child)) {
        edges.push([holder, key, child]);
      }
    })
  );
  return edges;
}

/**
 * A JSON copy, by the conventions the README gives: a Map is an object, a
 * Set is `{ member: true }`, a member which is an object is named by its
 * JSON, keys sorted, a box is what it holds.
 */
function toJSON(value: any): any {
  if (isBoxedObservable(value)) {
    return toJSON(value.get());
  }
  if (!isNode(value)) {
    return value;
  }
  if (isObservableArray(value)) {
    return value.map((item: any) => {
      const copy = toJSON(item);
      return copy === undefined ? null : copy;
    });
  }
  const json: Record<string, any> = {};
  if (isObservableSet(value)) {
    value.forEach((member: any) => {
      json[toText(member)] = true;
    });
    return json;
  }
  entriesOf(value).forEach(([key, child]) => {
    const copy = toJSON(child);
    if (copy !== undefined) {
      json[String(key)] = copy;
    }
  });
  return json;
}

function toText(member: any): string {
  return isNode(member)
    ? JSON.stringify(sorted(toJSON(member)))
    : String(member);
}

function sorted(json: any): any {
  if (json === null || typeof json !== "object") {
    return json;
  }
  if (Array.isArray(json)) {
    return json.map(sorted);
  }
  const copy: Record<string, any> = {};
  Object.keys(json)
    .sort()
    .forEach((key) => {
      copy[key] = sorted(json[key]);
    });
  return copy;
}

/**
 * Whether a map holds two keys which read the same in a JSON copy: no patch
 * can tell them apart, and the patches of a step may then be refused.
 */
function hasTwins(nodes: any[]): boolean {
  return nodes
    .filter((node) => isObservableMap(node))
    .some((map) => {
      const texts = Array.from(map.keys()).map(String);
      return new Set(texts).size < texts.length;
    });
}

/**
 * Whether these hold what MobX does not observe: a pet which was given an
 * owner, a map which has an object for a key. No step is then taken back,
 * and no patch is read.
 */
function isBlind(nodes: any[]): boolean {
  return nodes.some(
    (node) =>
      (node instanceof Pet && "owner" in node) ||
      (isObservableMap(node) &&
        Array.from(node.keys()).some(
          (key) => key !== null && typeof key === "object"
        ))
  );
}

/**
 * Whether the model can be reset or rolled back. Not with a box nor with a
 * field named by an empty text: the 1.7 code which puts a state in the model
 * ties the first to itself and throws on the second.
 */
function canJump(root: any): boolean {
  return nodesOf([root]).every(
    (node) =>
      !isBoxedObservable(node) &&
      !(node instanceof Pet) &&
      entriesOf(node).every(([key]) => key !== "")
  );
}

/**
 * The order of the keys aside, as JSON has none.
 */
function isSameJSON(one: any, other: any): boolean {
  return JSON.stringify(sorted(one)) === JSON.stringify(sorted(other));
}

/**
 * Everything of a model: the order of its keys, the type of each value and
 * which node is where. Two pictures which read the same and hold the same
 * nodes are one model.
 */
function toPicture(root: any): { text: string; nodes: any[] } {
  const ids = new Map<any, number>();
  const lines: string[] = [];
  const walk = (value: any, path: string) => {
    if (!isNode(value)) {
      lines.push(`${path}=${typeof value}:${String(value)}`);
      return;
    }
    if (ids.has(value)) {
      lines.push(`${path}->#${ids.get(value)}`);
      return;
    }
    ids.set(value, ids.size);
    // What JSON does not hold comes back as well.
    if (isObservableObject(value) && SECRET in value) {
      walk(value[SECRET], `${path}/secret`);
    }
    const entries = entriesOf(value);
    lines.push(`${path} holds ${entries.length}`);
    entries.forEach(([key], index) => {
      const name = isObservableSet(value)
        ? index
        : `${typeof key}:${String(key)}`;
      walk(entries[index][1], `${path}/${name}`);
    });
  };
  walk(root, "");
  return { text: lines.join("\n"), nodes: Array.from(ids.keys()) };
}

/**
 * Apply one patch to a JSON document, by RFC 6902 and nothing more lenient.
 */
function applyStrictly(document: any, patch: Patch): any {
  patch.forEach(({ op, path, value }: PatchOperation) => {
    if (path === "") {
      document = JSON.parse(JSON.stringify(value));
      return;
    }
    const keys = path
      .split("/")
      .slice(1)
      .map((key) => key.replace(/~1/g, "/").replace(/~0/g, "~"));
    const last = keys.pop() as string;
    let holder = document;
    keys.forEach((key) => {
      if (!Object.prototype.hasOwnProperty.call(holder, key)) {
        throw new Error(`nothing at ${path}`);
      }
      holder = holder[key];
    });
    if (holder === null || typeof holder !== "object") {
      throw new Error(`nothing holds ${path}`);
    }
    const isThere = Object.prototype.hasOwnProperty.call(holder, last);
    if (op !== "remove" && value === undefined) {
      throw new Error(`${op} without a value at ${path}`);
    }
    const copy =
      op === "remove" ? undefined : JSON.parse(JSON.stringify(value));
    if (Array.isArray(holder)) {
      const index = Number(last);
      if (!/^(0|[1-9][0-9]*)$/.test(last) || index > holder.length) {
        throw new Error(`no place ${path}`);
      }
      if (op !== "add" && index === holder.length) {
        throw new Error(`${op} of nothing at ${path}`);
      }
      holder.splice(
        index,
        op === "add" ? 0 : 1,
        ...(op === "remove" ? [] : [copy])
      );
    } else if (op === "add") {
      holder[last] = copy;
    } else if (!isThere) {
      throw new Error(`${op} of nothing at ${path}`);
    } else if (op === "remove") {
      delete holder[last];
    } else {
      holder[last] = copy;
    }
  });
  return document;
}

/**
 * A hero's mutator: it draws what it writes, and keeps in the hand the nodes
 * it took out of the model, for this step or a later one. It notes in
 * `seen.twins` when a map held two keys which read the same, in `seen.blind`
 * when the model held what MobX does not observe, and in `seen.dim` when the
 * model or the hand did.
 */
function createMutator(
  random: Random,
  trace: string[],
  hand: any[],
  seen: { twins: boolean; blind: boolean; dim: boolean },
  interrupt: () => void
) {
  const { int, next } = random;
  const pick = <T>(list: T[]): T => list[int(list.length)];
  const key = (): any => (next() < 0.1 ? pick(ODD_KEYS) : pick(KEYS));
  /**
   * What the hero holds now, and what the hand holds, looked at after each
   * write.
   */
  const look = (root: any) => {
    const own = nodesOf([root]);
    const all = nodesOf([root].concat(hand));
    seen.twins = seen.twins || hasTwins(all);
    seen.blind = seen.blind || isBlind(own);
    seen.dim = seen.dim || isBlind(all);
  };

  function draw(depth: number, isInSet = false): any {
    const dice = next();
    if (depth <= 0 || dice < 0.3) {
      return next() < 0.08 ? undefined : pick(VALUES);
    }
    if (dice < 0.55) {
      const sheet: Record<string, any> = {};
      for (let field = int(4); field > 0; field--) {
        sheet[pick(KEYS)] = draw(depth - 1);
      }
      return sheet;
    }
    if (dice < 0.75) {
      return Array.from({ length: int(4) }, () => draw(depth - 1));
    }
    if (dice < 0.82) {
      return new Map(
        Array.from({ length: int(3) }, () => [key(), draw(depth - 1)])
      );
    }
    if (dice < 0.86) {
      return new Pet();
    }
    if (dice < 0.9 && !isInSet) {
      return observable.box(draw(depth - 1));
    }
    return new Set(Array.from({ length: int(3) }, member));
  }

  /**
   * A member of a set: a text or a number, a sheet, or a sheet which holds a
   * set of its own.
   */
  function member(): any {
    const dice = next();
    if (dice < 0.6) {
      return pick(MEMBERS);
    }
    return dice < 0.85
      ? { m: int(3) }
      : { m: int(3), squad: new Set([{ m: int(3) }, pick(MEMBERS)]) };
  }

  const reaches = (from: any, target: any) =>
    nodesOf([from]).indexOf(target) > -1;

  /**
   * Something to put under a holder: a new value, or a node the model
   * already holds, as long as it does not hold the holder.
   */
  function value(root: any, holder: any): any {
    const isInSet = isObservableSet(holder);
    if (next() < 0.12) {
      const node = pick(nodesOf([root]));
      const isBox = isBoxedObservable(node);
      if (node !== root && !reaches(node, holder) && !(isInSet && isBox)) {
        return node;
      }
    }
    return draw(2, isInSet);
  }

  function insert(holder: any, node: any): void {
    if (isBoxedObservable(holder)) {
      holder.set(node);
    } else if (isObservableArray(holder)) {
      holder.splice(int(holder.length + 1), 0, node);
    } else if (isObservableMap(holder)) {
      holder.set(key(), node);
    } else if (isObservableSet(holder)) {
      holder.add(node);
    } else {
      // A class has the fields it has.
      holder[pick(holder instanceof Pet ? Object.keys(holder) : KEYS)] = node;
    }
  }

  function remove([holder, key, node]: [any, any, any]): void {
    if (isBoxedObservable(holder)) {
      holder.set(null);
    } else if (isObservableArray(holder)) {
      holder.splice(holder.indexOf(node), 1);
    } else if (isObservableMap(holder)) {
      holder.delete(key);
    } else if (isObservableSet(holder)) {
      holder.delete(node);
    } else if (holder instanceof Pet) {
      // A class keeps its fields.
      Object.assign(holder, { [key]: "" });
    } else {
      delete holder[key];
    }
  }

  function writeList(list: any, root: any): void {
    const write = pick([
      "push",
      "pop",
      "shift",
      "unshift",
      "splice",
      "sort",
      "reverse",
      "replace",
      "item",
      "length",
      "clear",
    ]);
    trace.push(`list.${write}`);
    switch (write) {
      case "push":
        list.push(value(root, list), value(root, list));
        break;
      case "pop":
        list.pop();
        break;
      case "shift":
        list.shift();
        break;
      case "unshift":
        list.unshift(value(root, list));
        break;
      case "splice":
        list.splice(
          int(list.length + 1),
          int(3),
          ...Array.from({ length: int(3) }, () => value(root, list))
        );
        break;
      case "sort":
        list.sort((a: any, b: any) =>
          String(JSON.stringify(toJSON(a))).localeCompare(
            String(JSON.stringify(toJSON(b)))
          )
        );
        break;
      case "reverse":
        list.reverse();
        break;
      case "replace":
        list.replace(Array.from({ length: int(4) }, () => value(root, list)));
        break;
      case "item":
        if (list.length) {
          list[int(list.length)] = value(root, list);
        }
        break;
      case "length":
        list.length = int(list.length + 1);
        break;
      default:
        list.clear();
    }
  }

  /**
   * One write in a node, whatever the node is.
   */
  function write(node: any, root: any): void {
    if (isBoxedObservable(node)) {
      trace.push("box.set");
      node.set(value(root, node));
    } else if (isObservableArray(node)) {
      writeList(node, root);
    } else if (isObservableMap(node)) {
      const way =
        next() < 0.04
          ? "key"
          : pick(["set", "set", "delete", "clear", "replace", "sort"]);
      trace.push(`map.${way}`);
      if (way === "key") {
        // A node of the hero as a key, or an object which is nobody's.
        node.set(next() < 0.5 ? pick(nodesOf([root])) : { m: int(3) }, draw(1));
      } else if (way === "set") {
        node.set(key(), value(root, node));
      } else if (way === "delete") {
        node.delete(pick(Array.from(node.keys()).concat(["zz"])));
      } else if (way === "clear") {
        node.clear();
      } else if (way === "replace") {
        node.replace(new Map([[key(), draw(1)]]));
      } else {
        // The entries it has, the other way round, and sometimes one more.
        const entries = Array.from<[any, any]>(node.entries()).reverse();
        node.replace(entries.concat(next() < 0.3 ? [[key(), draw(1)]] : []));
      }
    } else if (isObservableSet(node)) {
      const way = pick(["add", "add", "delete", "clear"]);
      trace.push(`set.${way}`);
      if (way === "add") {
        node.add(member());
      } else if (way === "delete") {
        node.delete(pick(Array.from(node.values()).concat(["zz"])));
      } else {
        node.clear();
      }
    } else if (node instanceof Pet) {
      const field = next() < 0.15 ? "owner" : pick(["name", "level", "toys"]);
      trace.push(`pet.${field}`);
      Object.assign(node, { [field]: value(root, node) });
    } else {
      const way = pick(["set", "set", "set", "delete", "empty", "secret"]);
      trace.push(`sheet.${way}`);
      if (way === "set") {
        node[pick(KEYS)] = value(root, node);
      } else if (way === "delete") {
        delete node[pick(Object.keys(node).concat(["zz"]))];
      } else if (way === "empty") {
        node[pick(KEYS)] = undefined;
      } else {
        node[SECRET] = draw(1);
      }
    }
    look(root);
  }

  /**
   * A list held by a sheet or a map, given again as a new list of the same
   * items: what an acceptor written the immutable way does.
   */
  function reassign(root: any): void {
    const lists = edgesOf([root]).filter(
      ([holder, , node]) =>
        isObservableArray(node) &&
        (isObservableObject(holder) || isObservableMap(holder))
    );
    if (!lists.length) {
      return;
    }
    const [holder, key, list] = pick(lists);
    const way = pick(["filter", "reverse", "spread"]);
    trace.push(`reassign.${way}`);
    const items =
      way === "filter"
        ? list.filter(() => next() < 0.8)
        : way === "reverse"
        ? list.slice().reverse()
        : [...list, draw(2)];
    if (isObservableMap(holder)) {
      holder.set(key, items);
    } else {
      holder[key] = items;
    }
  }

  /**
   * A node replaced by one of the nodes it holds.
   */
  function promote(root: any): void {
    const edges = edgesOf([root]).filter(
      ([holder, , node]) =>
        !isObservableSet(holder) && nodesOf([node]).length > 1
    );
    if (!edges.length) {
      return;
    }
    const [holder, key, node] = pick(edges);
    const below = pick(nodesOf([node]).slice(1));
    if (reaches(below, holder)) {
      return;
    }
    trace.push("promote");
    if (isBoxedObservable(holder)) {
      holder.set(below);
    } else if (isObservableMap(holder)) {
      holder.set(key, below);
    } else {
      holder[key] = below;
    }
  }

  /**
   * A key removed, something written meanwhile, and the key put back.
   */
  function removeThenPut(root: any): void {
    const edges = edgesOf([root]).filter(
      ([holder]) => isObservableObject(holder) || isObservableMap(holder)
    );
    if (!edges.length) {
      return;
    }
    const [holder, key, node] = pick(edges);
    trace.push("removeThenPut");
    remove([holder, key, node]);
    write(pick(nodesOf([node])), root);
    if (!reaches(node, holder)) {
      if (isObservableMap(holder)) {
        holder.set(key, node);
      } else {
        holder[key] = node;
      }
    }
  }

  /**
   * A key put in a map beside one which reads the same in a JSON copy, when
   * there is such a key.
   */
  function twin(root: any): void {
    const maps = nodesOf([root]).filter(
      (node) => isObservableMap(node) && node.size
    );
    if (!maps.length) {
      return;
    }
    const map = pick(maps);
    const known = pick(Array.from<any>(map.keys()));
    const alike = ODD_KEYS.filter((odd) => String(odd) === known);
    trace.push("twin");
    map.set(
      typeof known !== "string"
        ? String(known)
        : alike.length
        ? alike[0]
        : pick(ODD_KEYS),
      draw(1)
    );
  }

  /**
   * A map which has two keys reading the same leaves the hero, then the one
   * which is a text is written: nobody is told of that write, and the map
   * must still be given back whole.
   */
  function twinOut(root: any): void {
    const edges = edgesOf([root]).filter(
      ([holder, , node]) =>
        isObservableObject(holder) &&
        !(holder instanceof Pet) &&
        isObservableMap(node) &&
        hasTwins([node])
    );
    if (!edges.length) {
      return;
    }
    const edge = pick(edges);
    const keys = Array.from<any>(edge[2].keys());
    // The texts another key reads as.
    const texts = keys.filter(
      (known) =>
        typeof known === "string" &&
        keys.some((other) => other !== known && String(other) === known)
    );
    trace.push("twin out");
    remove(edge);
    hand.push(edge[2]);
    edge[2].set(pick(texts), draw(1));
  }

  /**
   * A pet of the hero is given an owner, the field MobX does not know of.
   */
  function adopt(root: any): void {
    const pets = nodesOf([root]).filter((node) => node instanceof Pet);
    if (pets.length) {
      trace.push("adopt");
      pick(pets).owner = pick(VALUES);
    }
  }

  function mutate(root: any): void {
    for (let writes = 1 + int(5); writes > 0; writes--) {
      const dice = next();
      const edges = edgesOf([root]);
      const held = edgesOf(hand);
      if (dice < 0.15 && edges.length) {
        trace.push("take");
        const edge = pick(edges);
        remove(edge);
        hand.push(edge[2]);
      } else if (dice < 0.25 && held.length) {
        // Out of a node which is itself out of the model.
        trace.push("take from the hand");
        const edge = pick(held);
        remove(edge);
        hand.push(edge[2]);
      } else if (dice < 0.4 && hand.length) {
        trace.push("in the hand:");
        write(pick(nodesOf(hand)), root);
      } else if (dice < 0.55 && hand.length) {
        const node = pick(hand);
        const holders = nodesOf([root]).filter(
          (holder) =>
            !reaches(node, holder) &&
            !(isObservableSet(holder) && isBoxedObservable(node))
        );
        if (holders.length) {
          trace.push("put back");
          insert(pick(holders), node);
        }
      } else if (dice < 0.63) {
        reassign(root);
      } else if (dice < 0.69) {
        promote(root);
      } else if (dice < 0.75) {
        removeThenPut(root);
      } else if (dice < 0.8) {
        twin(root);
      } else if (dice < 0.85) {
        twinOut(root);
      } else if (dice < 0.87) {
        adopt(root);
      } else if (dice < 0.89) {
        // What no mutator has the right to do: send an action.
        trace.push("interrupt");
        interrupt();
      } else {
        write(pick(nodesOf([root])), root);
      }
      look(root);
    }
  }

  return {
    mutate,
    /**
     * One write by somebody else, while the step is saved.
     */
    meddle(root: any): void {
      trace.push("meanwhile:");
      write(pick(nodesOf([root])), root);
    },
  };
}

/**
 * What a reaction read of the patches of a step: when it read them, and
 * which way. A refusal is what reading them threw.
 */
type Reading = "at once" | "late" | "patches only" | "inverse only" | "never";
type Entry = {
  patches?: Patch[];
  inversePatches?: Patch[];
  refusal?: string;
};

function createState() {
  return {
    sheet: { hp: 10, purse: { gold: 5 } },
    inventory: [{ id: "sword" }, { id: "potion", doses: [1, 2] }],
    quests: new Map([["dragon", { progress: 1 }]]),
    effects: new Set(["s1"]),
    party: new Set([{ m: 1 }]),
  };
}

/**
 * Take the steps of one seed, and say everything which went wrong.
 */
async function adventure(seed: number, stories: number[]) {
  const random = createRandom(seed);
  const wrongs: string[] = [];

  for (let hero = 0; hero < stories.length; hero++) {
    const writes: Write[] = [];
    const journal: Entry[] = [];
    const trace: string[] = [];
    const hand: any[] = [];
    const seen = { twins: false, blind: false, dim: false };
    // What is answered to the actions sent from inside a step.
    const answers: Array<Promise<Attempt<any>>> = [];
    const wreck = (data: any) => {
      data.sheet = "wrecked";
    };
    const { mutate, meddle } = createMutator(random, trace, hand, seen, () => {
      if (random.next() < 0.5) {
        answers.push(Fraktar.attempt.live(wreck));
      } else {
        Fraktar.actions.live(wreck);
      }
    });
    let reading: Reading = "at once";
    const Fraktar = createContainer<any>()
      .addAcceptor("live", {
        mutator: (data, adventure: (model: any) => void) => adventure(data),
      })
      .addActions({ live: "live" })
      .addStepReaction({
        awaitAsync: true,
        runOnInit: false,
        do: ({ delta }) => {
          const entry: Entry = {};
          const read = () => {
            try {
              if (reading !== "inverse only") {
                entry.patches = delta.patches;
              }
              if (reading !== "patches only") {
                entry.inversePatches = delta.inversePatches;
              }
            } catch (error) {
              entry.refusal = (error as Error).message;
            }
          };
          journal.push(entry);
          if (reading !== "late" && reading !== "never") {
            read();
          }
          const written = new Promise<void>((done, fail) => {
            writes.push({ done, fail });
          });
          // An awaited reaction can still read them once it waited.
          return reading === "late"
            ? written.then(read, (error) => {
                read();
                throw error;
              })
            : written;
        },
      })
      .create(createState());
    const model = Fraktar.representationRef.current;

    for (let step = 0; step < stories[hero]; step++) {
      const where = `seed ${seed}, hero ${hero}, step ${step}`;
      const say = (what: string) =>
        wrongs.push(`${where} [${trace.join(", ")}]: ${what}`);
      trace.length = 0;

      // Between two steps, now and then: the hero is put on another state.
      if (random.next() < 0.06 && canJump(model)) {
        trace.push("jump");
        const pending = writes.length;
        if (random.next() < 0.5) {
          Fraktar.reset(createState());
        } else {
          Fraktar.rollback({
            data: createState(),
            delta: {
              acceptedMutations: [],
              proposal: Object.assign([], { stepId: Fraktar.stepId + 3 }),
              controlStates: [],
              previousControlStates: [],
            },
          });
        }
        // A rollback has its arrival written as a step is.
        writes.slice(pending).forEach((write) => write.done());
        await settle();
      }

      const before = JSON.stringify(toJSON(model));
      const picture = toPicture(model);
      const held = hand.slice();
      const stepId = Fraktar.stepId;
      const known = journal.length;
      seen.twins = hasTwins(nodesOf([model].concat(hand)));
      seen.blind = isBlind(nodesOf([model]));
      seen.dim = isBlind(nodesOf([model].concat(hand)));
      reading = (
        [
          "at once",
          "at once",
          "late",
          "patches only",
          "inverse only",
          "never",
        ] as const
      )[random.int(6)];

      const outcome = Fraktar.attempt.live(mutate);
      const told = journal[known];
      const after = JSON.stringify(toJSON(model));
      const write = writes[writes.length - 1];
      // Whoever reads at once reads before somebody else writes.
      const wasBlind = seen.blind;
      if (random.next() < 0.2) {
        runInAction(() => meddle(model));
      }
      const isSaved = random.next() < 0.5;
      if (isSaved) {
        write.done();
      } else {
        write.fail(new Error("the database is down"));
      }
      const attempt = await outcome;

      // Only what no patch can tell is refused, and all of it is.
      const isRead =
        told.patches !== undefined || told.inversePatches !== undefined;
      if (told.refusal !== undefined && !seen.twins && !seen.dim) {
        say(`the patches were refused, ${told.refusal}`);
      }
      if (isRead && (reading === "late" ? seen.blind : wasBlind)) {
        say("the patches were read while the model held what nobody observes");
      }
      if (told.patches !== undefined) {
        try {
          const replayed = told.patches.reduce(
            applyStrictly,
            JSON.parse(before)
          );
          if (!isSameJSON(replayed, JSON.parse(after))) {
            say("the patches do not give the model");
          }
        } catch (error) {
          say(`the patches do not apply, ${(error as Error).message}`);
        }
      }
      if (told.inversePatches !== undefined) {
        try {
          const rewound = told.inversePatches.reduce(
            applyStrictly,
            JSON.parse(after)
          );
          if (!isSameJSON(rewound, JSON.parse(before))) {
            say("the inverse patches do not give the model back");
          }
        } catch (error) {
          say(`the inverse patches do not apply, ${(error as Error).message}`);
        }
      }
      // What a mutator sent in the middle of its step was refused, and the
      // step is one step.
      const sent = await Promise.all(answers.splice(0));
      if (
        sent.some(
          (answer) =>
            answer.status !== "discarded" ||
            answer.reason.code !== "STEP_LOCKED"
        )
      ) {
        say("an action sent from inside the step was not refused");
      }
      if (isSaved) {
        if (Fraktar.stepId !== stepId + 1) {
          say("the step is not one step");
        }
        continue;
      }

      // A step is not taken back while the model holds what nobody
      // observes: it stands, and says so.
      const stands =
        attempt.status === "accepted" &&
        attempt.undone === undefined &&
        attempt.reason?.code === "STEP_NOT_UNDONE";
      if (seen.blind || (seen.dim && stands)) {
        if (!stands) {
          say("the step does not stand, though nobody observes all it wrote");
        }
        continue;
      }

      // What the step took out is in the model again, not in the hand.
      hand.splice(0, hand.length, ...held);
      const back = toPicture(model);
      if (attempt.status !== "accepted" || attempt.undone !== true) {
        say("the step is not said undone");
      } else if (Fraktar.stepId !== stepId) {
        say("the step id did not come back");
      } else if (back.text !== picture.text) {
        say("the model did not come back");
      } else if (back.nodes.some((node, at) => node !== picture.nodes[at])) {
        say("a node came back as a copy");
      }
    }
    await settle();
  }
  return wrongs;
}

beforeEach(function () {
  jest.spyOn(console, "info").mockImplementation(() => {});
  jest.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(function () {
  jest.restoreAllMocks();
});

describe("steps drawn at random on a model of every shape", function () {
  // Short stories and long ones.
  const stories = Array.from(
    { length: 24 },
    (_, hero) => [5, 12, 12, 40][hero % 4]
  );

  // Half a second each, and as long as it takes on a busy machine.
  [1, 2, 3, 5, 8, 13, 21, 34].forEach(function (seed) {
    it(`should be told and taken back right, seed ${seed}`, async function () {
      const wrongs = await adventure(seed, stories);

      expect(wrongs).toEqual([]);
    }, 120000);
  });
});
