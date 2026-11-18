import {
  $mobx,
  intercept,
  isBoxedObservable,
  isObservableArray,
  isObservableMap,
  isObservableObject,
  isObservableProp,
  isObservableSet,
  observe,
  remove,
  runInAction,
  set,
} from "mobx";
import { Change, Store, apply, invert } from "./changes";

export interface IStepRecorder {
  /**
   * Start a record. One at a time.
   */
  start(): void;
  /**
   * End the record and forget it.
   */
  stop(): void;
  /**
   * End the record and take back all it holds, last write first. The model is
   * then what it was when the record started.
   *
   * All or nothing: when it can not be done it throws, and the model is what
   * it was when undo was called.
   */
  undo(): void;
}

/**
 * A node which is listened to, with the places it is at in the model. That is
 * nearly always one, but a model can hold the same node twice, and none once
 * it left the model.
 */
type Watched = {
  node: any;
  places: Place[];
  /**
   * It left the model, and a record ended since: it is somebody else's now.
   * The nodes it holds are not at it anymore. Should it come back, they are
   * again.
   */
  isOut: boolean;
  /**
   * How many things it holds which MobX does not observe, by what they are.
   */
  blind?: Map<string, number>;
  /**
   * For a set: the members it was given since it was last asked what it made
   * of them, each as the change which tells it, in order. They are its last
   * members.
   */
  late?: Change[];
  /**
   * For an object which has no proxy: how many fields it had when it was
   * last looked at, and how many of them MobX did not observe.
   */
  fields?: { all: number; unobserved: number };
};

/**
 * Where a node is: the node which holds it.
 */
type Place = { holder: Watched };

type Running = {
  /**
   * Which record it is: who reads the patches of a step later on tells by it
   * that the record is over, without holding on to what it recorded.
   */
  id: number;
  changes: Change[];
  /**
   * The order of the keys of what lost one or was given another order, as it
   * was before. A key which comes back is appended: this is what puts it
   * back at its place.
   */
  orders: Map<any, any[]>;
  /**
   * What the model held, at some point of the record, which MobX does not
   * observe: nothing says the model came back if it is written in.
   */
  blind: string | undefined;
};

/**
 * Records what a step writes in the model, so that it can be taken back
 * without ever copying the model.
 *
 * Each write is recorded once, as the change MobX reports: the nodes
 * themselves, not a copy of them. Taking the record back applies the changes
 * the other way round, last first.
 *
 * It listens with observe and intercept, which MobX keeps in its production
 * build, where spy is a no-op.
 */
class StepRecorder implements IStepRecorder {
  private watched: WeakMap<object, Watched> = new WeakMap();
  /**
   * What the nodes hold of the recorder. A node can outlive the model it was
   * in, a map many containers share for example: it must not keep the
   * recorder, and the whole model with it, from being collected.
   */
  private self = toWeak(this);
  private root: Watched;
  private running?: Running;
  private records = 0;
  /**
   * The nodes which lost a place since it was last asked which ones left the
   * model.
   */
  private loose: Watched[] = [];
  /**
   * The sets which were given members since they were last asked.
   */
  private late: Watched[] = [];
  /**
   * The objects of the model which have no proxy: an instance of a class, or
   * any object when MobX is told to do without. One can be given a field
   * without anybody being told.
   */
  private bare: Set<Watched> = new Set();
  /**
   * A write was heard after a later one: somebody who listened to a node
   * before the recorder wrote in it while being told. What the recorder
   * knows of the model is not sure from then on.
   */
  private isDisordered = false;
  private blind: Map<string, number> = new Map();

  constructor(root: object) {
    this.root = this.listen(root);
  }

  public start(): void {
    if (this.running !== undefined) {
      throw new Error("[RAVIOLI] A record is already running.");
    }
    // What left the model since the last record, during it or after.
    this.settle();
    this.sweep();
    this.running = {
      id: ++this.records,
      changes: [],
      orders: new Map(),
      blind: Array.from(this.blind.keys())[0],
    };
  }

  public stop(): void {
    this.running = undefined;
  }

  public undo(): void {
    const running = this.running;
    if (running === undefined) {
      return;
    }
    this.settle();
    this.look();
    // Nothing of the way back is recorded.
    this.running = undefined;
    const { changes, orders, blind } = running;
    if (blind !== undefined) {
      throw new Error(this.toBlindness(blind));
    }
    if (this.isDisordered) {
      throw new Error(DISORDER);
    }
    // One transaction: the observers see the model come back at once.
    runInAction(() => {
      let left = changes.length;
      try {
        while (left > 0) {
          write(invert(changes[left - 1]));
          left--;
        }
        orders.forEach(order);
      } catch (error) {
        // All or nothing. What was taken back is done again, so the model
        // is the step and not something which never existed.
        changes.slice(left).forEach(write);
        throw error;
      }
    });
  }

  /**
   * Ask the sets which were given members what they made of them. MobX tells
   * what a set was given, and the set may hold an observable made of it
   * instead: there is no asking a set for its last member but by going
   * through it, so it is asked once for all it was given, and not at each.
   */
  private settle(): void {
    const late = this.late;
    this.late = [];
    late.forEach((watched) => {
      const changes = watched.late as Change[];
      const members = Array.from<any>(watched.node);
      const first = members.length - changes.length;
      watched.late = undefined;
      changes.forEach((change, at) => {
        const member = members[first + at];
        const known = this.watched.get(member);
        // Its last members are not the ones it was given: somebody took
        // one away before the recorder was told of it.
        this.isDisordered =
          this.isDisordered ||
          first < 0 ||
          (known !== undefined &&
            known.places.some(({ holder }) => holder === watched));
        change.added[0] = member;
        this.put(member, watched, undefined);
      });
    });
  }

  /**
   * Let go of the nodes which left the model, and of what only they held.
   * They would be kept alive otherwise, as long as what they held lives: a
   * list which is replaced at each step, for example, by one of the same
   * items.
   */
  private sweep(): void {
    const loose = this.loose;
    this.loose = [];
    for (
      let watched = loose.pop();
      watched !== undefined;
      watched = loose.pop()
    ) {
      if (watched.isOut || this.isIn(watched, new Set())) {
        continue;
      }
      const gone = watched;
      gone.isOut = true;
      this.bare.delete(gone);
      if (gone.blind !== undefined) {
        gone.blind.forEach((times, name) => count(this.blind, name, -times));
        gone.blind = undefined;
      }
      forEachChild(gone.node, (child, key) => {
        const held = this.watched.get(child);
        if (held !== undefined) {
          unplace(held, gone, key);
          loose.push(held);
        }
      });
    }
  }

  private isIn(watched: Watched, seen: Set<Watched>): boolean {
    if (watched === this.root) {
      return true;
    }
    if (seen.has(watched)) {
      return false;
    }
    seen.add(watched);
    return watched.places.some(({ holder }) => this.isIn(holder, seen));
  }

  private listen(node: any): Watched {
    const watched: Watched = { node, places: [], isOut: false };
    this.watched.set(node, watched);
    hear(node, this.self);
    this.hold(watched);
    return watched;
  }

  /**
   * What a node of the model holds is at it.
   */
  private hold(watched: Watched): void {
    const { node } = watched;
    forEachChild(node, (child, key) => this.put(child, watched, key));
    if (isObservableMap(node)) {
      node.forEach((_: any, key: any) => this.seeKey(key, watched, 1));
    } else if (isObservableObject(node)) {
      // A field MobX was not told of, or told to leave alone.
      const fields = fieldsOf(node);
      const unobserved = fields.filter((key) => !isObserved(node, key)).length;
      this.miss(watched, FIELD, unobserved);
      if (toTarget(node) === node) {
        watched.fields = { all: fields.length, unobserved };
        this.bare.add(watched);
      }
    }
  }

  /**
   * Count again the fields of the objects which have no proxy: one which was
   * given a field since has one more that MobX does not observe. It is asked
   * when it matters, before a way back and before the patches are written,
   * and not at each step.
   */
  private look(): void {
    this.bare.forEach((watched) => {
      const { node } = watched;
      const known = watched.fields as { all: number; unobserved: number };
      const fields = fieldsOf(node);
      if (fields.length !== known.all) {
        const unobserved = fields.filter(
          (key) => !isObserved(node, key)
        ).length;
        watched.fields = { all: fields.length, unobserved };
        this.miss(watched, FIELD, unobserved - known.unobserved);
      }
    });
  }

  /**
   * A value was put in the model. A node is listened to from now on, with
   * everything under it, and for good: a mutator can remove a node and go on
   * writing in it, or put it back somewhere else. A node nobody holds anymore
   * is collected with its listeners.
   */
  private put(value: any, holder: Watched, key: any): void {
    if (!isNode(value)) {
      this.see(value, holder, 1);
      return;
    }
    const watched = this.watched.get(value) || this.listen(value);
    if (watched.isOut) {
      watched.isOut = false;
      this.hold(watched);
    }
    watched.places.push({ holder });
  }

  /**
   * A value was taken from where it was. Whether it left the model is asked
   * when the record ends: the same write, or a later one, may put it back.
   */
  private drop(value: any, holder: Watched, key: any): void {
    if (!isNode(value)) {
      this.see(value, holder, -1);
      return;
    }
    const watched = this.watched.get(value);
    // It was made observable where it was, behind MobX's back: it was never
    // listened to.
    if (watched !== undefined) {
      unplace(watched, holder, key);
      this.loose.push(watched);
    }
  }

  /**
   * A Date, or an object which is not observable, can be written in without
   * anybody being told. As long as the model holds one, nothing says a step
   * was taken back whole.
   */
  private see(value: any, holder: Watched, by: number): void {
    if (isObject(value)) {
      this.miss(holder, toName(value), by);
    }
  }

  /**
   * A map keeps its keys as they are given. One which is an object can be
   * written in as well, observable or not: a key is not something the map
   * holds, and what is written in it changes how the map reads.
   */
  private seeKey(key: any, holder: Watched, by: number): void {
    if (isKeyObject(key)) {
      this.miss(holder, KEY, by);
    }
  }

  /**
   * What a refusal says: what the model holds which MobX does not observe,
   * and where, so that whoever reads it knows what to change in the model.
   * It is looked for then, and only then. What left the model during the
   * record is nowhere anymore: it is named alone.
   */
  private toBlindness(name: string): string {
    const found = findUnobserved(this.root.node, "", new Set());
    return `the model holds ${
      found || name
    }, which MobX does not observe: nothing tells what was written in it`;
  }

  /**
   * The model holds more, or less, of what MobX does not observe.
   */
  private miss(holder: Watched, name: string, by: number): void {
    if (by === 0) {
      return;
    }
    holder.blind = holder.blind || new Map();
    count(holder.blind, name, by);
    count(this.blind, name, by);
    if (this.running !== undefined) {
      this.running.blind = this.running.blind || name;
    }
  }

  /**
   * The keys of a node are about to move: their order is kept, once a record.
   */
  private keepOrder(watched: Watched): void {
    const running = this.running;
    if (
      running !== undefined &&
      !watched.isOut &&
      !running.orders.has(watched.node)
    ) {
      running.orders.set(watched.node, keysOf(watched.node));
    }
  }

  /**
   * A map is about to be replaced. It is the one write nobody is told of
   * when the entries are the ones the map already has: it takes their order,
   * without an event.
   */
  public onWillReplace(node: any): void {
    this.keepOrder(this.watched.get(node) as Watched);
  }

  public onWillChange(node: any, event: any): void {
    const watched = this.watched.get(node) as Watched;
    if (event.type === "remove" || event.type === "delete") {
      // The members a set was given are its last ones until it loses one.
      if (watched.late !== undefined) {
        this.settle();
      }
      this.keepOrder(watched);
    }
  }

  public onDidChange(node: any, event: any): void {
    const watched = this.watched.get(node) as Watched;
    const change = toChange(watched.node, event);
    // A key more, or a key less.
    const keys = isObservableMap(watched.node)
      ? change.added.length - change.removed.length
      : 0;
    // Out of the model since before the record: neither its nodes nor its
    // writes are the container's. It is asked what it holds if it comes back.
    if (watched.isOut) {
      return;
    }
    const key = change.type === "entry" ? change.name : undefined;
    if (keys) {
      this.seeKey(key, watched, keys);
    }
    if (watched.fields !== undefined) {
      // A field MobX knows came or went: as many fields say nothing anymore.
      watched.fields.all = -1;
    }
    change.removed.forEach((value) => this.drop(value, watched, key));
    const isLate =
      change.type === "members" &&
      change.added.length > 0 &&
      (watched.late !== undefined || isObject(change.added[0]));
    // The node is not what this write made it: it was written again before
    // the recorder was told.
    this.isDisordered = this.isDisordered || (!isLate && !isWritten(change));
    if (isLate) {
      // The set is asked later what it made of what it was given.
      if (watched.late === undefined) {
        watched.late = [];
        this.late.push(watched);
      }
      watched.late.push(change);
    } else {
      change.added.forEach((value) => this.put(value, watched, key));
    }
    // A node which left the model during the record is still written in by
    // the step: a mutator keeps what it took out.
    if (this.running !== undefined) {
      this.running.changes.push(change);
    }
  }
}

/**
 * Something which is held without being kept alive.
 */
type Weak<T> = { deref(): T | undefined };
declare const WeakRef:
  | (new <T extends object>(target: T) => Weak<T>)
  | undefined;

function toWeak<T extends object>(target: T): Weak<T> {
  // An engine which knows no weak reference keeps the recorder as long as
  // its nodes live.
  return typeof WeakRef === "function"
    ? new WeakRef(target)
    : { deref: () => target };
}

/**
 * The recorders which listen to a node, for every node which is listened
 * to. A node is given its listeners once, however many recorders come and
 * go: a map many containers share does not carry the trace of each.
 */
const HEARD: WeakMap<object, Array<Weak<StepRecorder>>> = new WeakMap();

/**
 * Have a recorder told of what is written in a node, for as long as the
 * recorder lives. Nothing here holds it.
 */
function hear(node: any, self: Weak<StepRecorder>): void {
  let heard = HEARD.get(node);
  if (heard === undefined) {
    HEARD.set(node, (heard = []));
    listenTo(node, heard);
  }
  heard.push(self);
}

function listenTo(node: any, heard: Array<Weak<StepRecorder>>): void {
  observe(node, (event: any) => {
    tell(heard, (recorder) => recorder.onDidChange(node, event));
  });
  // Only what has keys can lose one.
  if (!isObservableArray(node) && !isBoxedObservable(node)) {
    intercept(node, (event: any) => {
      tell(heard, (recorder) => recorder.onWillChange(node, event));
      return event;
    });
  }
  if (isObservableMap(node)) {
    // The one write nobody is told of: a map which is replaced by the
    // entries it already has takes their order, without an event.
    const replace = node.replace;
    Object.defineProperty(node, "replace", {
      configurable: true,
      writable: true,
      value: (entries: any) => {
        tell(heard, (recorder) => recorder.onWillReplace(node));
        return replace.call(node, entries);
      },
    });
  }
}

/**
 * Tell the recorders which are still there, and forget the others.
 */
function tell(
  heard: Array<Weak<StepRecorder>>,
  work: (recorder: StepRecorder) => void
): void {
  let gone = 0;
  heard.forEach((one) => {
    const recorder = one.deref();
    if (recorder === undefined) {
      gone++;
    } else {
      work(recorder);
    }
  });
  if (gone) {
    const alive = heard.filter((one) => one.deref() !== undefined);
    heard.length = 0;
    alive.forEach((one) => heard.push(one));
  }
}

export function createStepRecorder(root: object): IStepRecorder {
  return new StepRecorder(root);
}

function isNode(value: any): boolean {
  return (
    isBoxedObservable(value) ||
    isObservableArray(value) ||
    isObservableMap(value) ||
    isObservableSet(value) ||
    isObservableObject(value)
  );
}

/**
 * What can be written in. A node is one too, and MobX tells of it.
 */
function isObject(value: any): boolean {
  return value !== null && typeof value === "object" && !isNode(value);
}

/**
 * A field MobX tells the writes of. What an object can do is not a field.
 */
function isObserved(node: any, key: string | symbol): boolean {
  return isObservableProp(node, key) || typeof node[key] === "function";
}

const DISORDER =
  "a listener wrote in a node of the model while it was told of a write in it: the two writes were heard in the wrong order";
const FIELD = "a field which is not observable";
const KEY = "an object used as the key of a Map";

function toName(value: object): string {
  return value instanceof Date ? "a Date" : "an object which is not observable";
}

function isKeyObject(key: any): boolean {
  return key !== null && typeof key === "object";
}

/**
 * The first thing a node holds, or what it holds does, which MobX does not
 * observe: its name and where it is, as a JSON pointer. A member of a set
 * has no place of its own there: it is written `*`.
 */
function findUnobserved(
  node: any,
  path: string,
  seen: Set<any>
): string | undefined {
  if (seen.has(node)) {
    return undefined;
  }
  seen.add(node);
  let found: string | undefined;
  const under = (key: any) =>
    `${path}/${String(key).replace(/~/g, "~0").replace(/\//g, "~1")}`;
  const look = (value: any, where: string) => {
    if (found === undefined && isNode(value)) {
      found = findUnobserved(value, where, seen);
    } else if (found === undefined && isObject(value)) {
      found = `${toName(value)} at ${where || "its root"}`;
    }
  };
  if (isBoxedObservable(node)) {
    look(node.get(), path);
  } else if (isObservableArray(node)) {
    node.forEach((item: any, index: number) => look(item, under(index)));
  } else if (isObservableSet(node)) {
    node.forEach((member: any) => look(member, under("*")));
  } else if (isObservableMap(node)) {
    node.forEach((value: any, key: any) => {
      if (found === undefined && isKeyObject(key)) {
        found = `${KEY} at ${path || "its root"}`;
      }
      look(value, under(key));
    });
  } else {
    fieldsOf(node).forEach((key) => {
      if (found === undefined && !isObserved(node, key)) {
        found = `${FIELD} at ${under(key)}`;
      } else if (isObservableProp(node, key)) {
        look(node[key], under(key));
      }
    });
  }
  return found;
}

function count(counts: Map<string, number>, name: string, by: number): void {
  const total = (counts.get(name) || 0) + by;
  if (total) {
    counts.set(name, total);
  } else {
    counts.delete(name);
  }
}

function unplace(watched: Watched, holder: Watched, key: any): void {
  const at = watched.places.findIndex((place) => place.holder === holder);
  watched.places.splice(at, 1);
}

function forEachChild(node: any, visit: (child: any, key?: any) => void): void {
  if (isBoxedObservable(node)) {
    visit(node.get());
  } else if (isObservableArray(node) || isObservableSet(node)) {
    node.forEach((child: any) => visit(child));
  } else if (isObservableMap(node)) {
    node.forEach((child: any, key: any) => visit(child, key));
  } else {
    fieldsOf(node)
      .filter((key) => isObservableProp(node, key))
      .forEach((key) => visit(node[key], key));
  }
}

/**
 * The fields of an object, those named by a symbol included: JSON does not
 * hold them, the model does.
 */
function fieldsOf(node: any): Array<string | symbol> {
  const symbols = Object.getOwnPropertySymbols(node).filter((symbol) =>
    Object.prototype.propertyIsEnumerable.call(node, symbol)
  );
  return (Object.keys(node) as Array<string | symbol>).concat(symbols);
}

function keysOf(node: any): any[] {
  return isObservableObject(node) ? fieldsOf(node) : Array.from(node.keys());
}

/**
 * What MobX reports of a write, in one shape whatever the node is.
 */
function toChange(object: any, event: any): Change {
  if (isBoxedObservable(object)) {
    return {
      type: "box",
      object,
      removed: [event.oldValue],
      added: [event.newValue],
    };
  }
  if (isObservableArray(object)) {
    return event.type === "splice"
      ? {
          type: "items",
          object,
          index: event.index,
          removed: event.removed,
          added: event.added,
        }
      : {
          type: "items",
          object,
          index: event.index,
          removed: [event.oldValue],
          added: [event.newValue],
        };
  }
  if (isObservableSet(object)) {
    return event.type === "add"
      ? { type: "members", object, removed: [], added: [event.newValue] }
      : { type: "members", object, removed: [event.oldValue], added: [] };
  }
  return {
    type: "entry",
    object,
    name: event.name,
    removed: event.type === "add" ? [] : [event.oldValue],
    added:
      event.type === "update" || event.type === "add" ? [event.newValue] : [],
  };
}

/**
 * Write a change in the model, and make sure it is written. Something can
 * refuse it: an interceptor which cancels it or throws, MobX itself. And a
 * listener can throw once it is written, which changes nothing to the model.
 */
function write(change: Change): void {
  const size = isObservableArray(change.object) ? change.object.length : 0;
  let failure: unknown;
  try {
    apply(change, MODEL);
  } catch (error) {
    failure = error;
  }
  if (!isWritten(change, size)) {
    throw failure || new Error("a write in the model was refused");
  }
  if (failure !== undefined) {
    console.error(
      "[RAVIOLI] A listener threw while a step was taken back.",
      failure
    );
  }
}

const MODEL: Store = {
  entry(object, name, _, added) {
    if (added.length) {
      set(object, name, added[0]);
    } else {
      remove(object, name);
    }
  },
  items(object, index, removed, added) {
    // Not spread: a sort or a reverse of a long array hands all its items.
    object.spliceWithArray(index, removed.length, added);
  },
  members(object, removed, added) {
    removed.forEach((member) => object.delete(member));
    added.forEach((member) => object.add(member));
  },
  box(object, _, added) {
    object.set(added[0]);
  },
};

function isWritten(change: Change, size?: number): boolean {
  const { object, removed, added } = change;
  switch (change.type) {
    case "entry": {
      // What the node holds itself: every object answers to "constructor".
      const entries = isObservableMap(object)
        ? object
        : {
            has: (name: any) =>
              Object.prototype.hasOwnProperty.call(object, name),
            get: (name: any) => object[name],
          };
      return added.length
        ? entries.has(change.name) &&
            Object.is(entries.get(change.name), added[0])
        : !entries.has(change.name);
    }
    case "items":
      return (
        (size === undefined ||
          object.length === size - removed.length + added.length) &&
        added.every((item, at) => Object.is(object[change.index + at], item))
      );
    case "members":
      return (
        removed.every((member) => !object.has(member)) &&
        added.every((member) => object.has(member))
      );
    default:
      return Object.is(object.get(), added[0]);
  }
}

/**
 * Put the keys of a node back in the order they had. Only what the step
 * removed has moved, but there is no way to put a key back in the middle: the
 * keys behind it are moved behind it again, without a write in any of them.
 */
function order(keys: any[], node: any): void {
  const now = keysOf(node);
  const present = new Set(now);
  const before = keys.filter((key) => present.has(key));
  const first = before.findIndex((key, index) => key !== now[index]);
  if (first === -1) {
    return;
  }
  if (isObservableMap(node)) {
    // replace keeps the entries it already has and takes the order it is given.
    node.replace(
      new Map(before.map((key) => [key, node.get(key)] as [any, any]))
    );
    return;
  }
  // Neither a set nor an object has such a thing: what stands behind the
  // first which moved is taken out and put again, in order.
  const moved = before.slice(first);
  if (isObservableSet(node)) {
    moved.forEach((member) => node.delete(member));
    moved.forEach((member) => node.add(member));
  } else {
    // The fields themselves are left alone, only the properties which carry
    // them are defined again.
    const target = toTarget(node);
    moved
      .map((key) => Object.getOwnPropertyDescriptor(target, key))
      .forEach((descriptor, at) => {
        delete target[moved[at]];
        Object.defineProperty(
          target,
          moved[at],
          descriptor as PropertyDescriptor
        );
      });
  }
}

/**
 * The object which carries the fields of an observable object: itself, or the
 * one behind its proxy. MobX keeps it in its administration, under a name its
 * production build changes: it is found by what it is, not by that name.
 */
function toTarget(node: any): any {
  const administration = node[$mobx];
  // The first one it keeps: asked for each object of the model.
  const name = Object.keys(administration).find((key) => {
    const held = administration[key];
    return (
      held !== null &&
      typeof held === "object" &&
      held[$mobx] === administration
    );
  });
  return administration[name as string];
}
