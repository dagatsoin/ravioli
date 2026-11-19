import {
  isBoxedObservable,
  isObservableArray,
  isObservableMap,
  isObservableSet,
} from "mobx";
import { Patch } from "./api/patch";
import { Change, Store, apply, invert } from "./changes";
import { NOW, View, copyIn, orNull, toPointer, toSegment } from "./jsonPatch";

/**
 * The position of a node, as the recorder tells it: the node which holds it
 * and, in an object or a map, under which key.
 */
export type Position = { holder: any; key: any };

/**
 * What the recorder knows of the model as it is now.
 */
export interface Model {
  root: any;
  /**
   * The positions of a node of the model.
   */
  positionsOf(node: any): Position[];
  /**
   * How many keys of a map which are not texts read as this text.
   */
  oddOf(map: any, text: string): number;
}

/**
 * Where a change happened in a JSON copy of the model: the pointer of its
 * node. `isItem` when that is an item of an array, which is never left out.
 *
 * A member of a set is a key in a JSON copy, and nothing is under a key. So a
 * change which happened inside a member is told on the set: `path` is then
 * the pointer of the set, and `member` the member whose text changed.
 */
type Location = {
  path: string;
  isItem: boolean;
  member: { of: any; node: any } | undefined;
};

/**
 * Write the JSON patches of the first `count` changes of a record, or the
 * ones which undo them.
 *
 * It is done when somebody reads them, so after the changes happened: a value
 * which was put in the model may have been written in since, and a node may
 * not be where it was. The record is therefore read backwards. Each change is
 * told from what the model held right after it, then it is taken back, not in
 * the model but in what is remembered of its past.
 */
export function writePatches(
  changes: Change[],
  count: number,
  isInverse: boolean,
  model: Model
): Patch[] {
  const past = new Past(model);
  const patches: Patch[] = [];

  for (let i = changes.length - 1; i >= 0; i--) {
    // What was recorded after the patches were asked for is only taken back.
    const patch = i < count ? past.tell(changes[i], isInverse) : [];
    // Nothing is told from what the model held before the first change:
    // taking it back would copy a list for nothing.
    if (i > 0 || past.isInsideMember()) {
      apply(invert(changes[i]), past);
      past.rename(patch, isInverse);
    }
    if (patch.length) {
      patches.push(patch);
    }
  }

  // Read backwards: the patches which undo are in the order to apply them,
  // the others are not.
  return isInverse ? patches : patches.reverse();
}

/**
 * How many items are looked for in a list before their indexes are kept.
 */
const FEW = 8;

/**
 * Stands for a field or an entry which was not there.
 */
const NONE = {};

/**
 * The model at an earlier moment: what was different then, over the model as
 * it is now. Only what the changes touched is remembered, so going back costs
 * what they changed.
 */
class Past implements Store, View {
  private entries: Map<any, Map<any, any>> = new Map();
  private memberships: Map<any, Map<any, boolean>> = new Map();
  private lists: Map<any, any[]> = new Map();
  private boxes: Map<any, any> = new Map();
  private positions: Map<any, Position[]> = new Map();
  private odds: Map<any, Map<string, number>> = new Map();
  /**
   * The maps which had a key more, or a key less: the order their keys had
   * is not known anymore.
   */
  private shuffled: Set<any> = new Set();
  /**
   * The indexes of the items of an array, kept until the array changes.
   */
  private indexes: Map<any, Map<any, number[]>> = new Map();
  /**
   * How many items of a list were looked for since it last changed.
   */
  private asked: Map<any, number> = new Map();
  /**
   * How many members of a set read as each text.
   */
  private texts: Map<any, Map<string, number>> = new Map();
  /**
   * The members a change was inside of, with the text each one had after it
   * and the texts of their set, counted as it was then.
   */
  private renamed: Array<{
    at: Location;
    after: string;
    texts: Map<string, number>;
  }> = [];

  constructor(private model: Model) {}

  /**
   * The operations which tell a change, or undo it, from what the model held
   * right after it.
   */
  public tell(change: Change, isInverse: boolean): Patch {
    const patch: Patch = [];
    const locations = this.locate(change.object, []);
    // Wherever it is told: at a path, or in the text of a member of a set.
    if (
      locations.length &&
      change.type === "entry" &&
      isObservableMap(change.object)
    ) {
      this.refuse(change.object, change.name, change.added.length === 0);
    }
    locations.forEach((at) => {
      if (at.member === undefined) {
        this.toOperations(change, at, isInverse).forEach((operation) => {
          patch.push(operation);
        });
      } else {
        this.renamed.push({
          at,
          after: toSegment(at.member.node, this),
          texts: this.textsOf(at.member.of),
        });
      }
    });
    return patch;
  }

  /**
   * Says whether the change which was just told is inside a member of a set:
   * what that member read as before it is then part of what is told.
   */
  public isInsideMember(): boolean {
    return this.renamed.length > 0;
  }

  /**
   * Once a change is taken back, a member of a set it was inside of reads as
   * it did before: the key it had after is removed, the one it had before is
   * added.
   */
  public rename(patch: Patch, isInverse: boolean): void {
    const renamed = this.renamed.map((member) => {
      const { node } = member.at.member as { of: any; node: any };
      return { ...member, node, before: toSegment(node, this) };
    });
    this.renamed = [];
    // Told at each place of the set. Then the member is counted under the
    // text it had before, once.
    renamed.forEach(({ at, before, after, texts }) => {
      toMembership(at.path, before, after, texts, isInverse).forEach(
        (operation) => {
          patch.push(operation);
        }
      );
    });
    renamed.forEach(({ node, before, after, texts }, index) => {
      const isKnown = renamed.some(
        (other, earlier) =>
          earlier < index && other.texts === texts && other.node === node
      );
      if (!isKnown) {
        tally(texts, after, -1);
        tally(texts, before, 1);
      }
    });
  }

  public entry(object: any, name: any, removed: any[], added: any[]): void {
    // Nothing of a field named by a symbol is in a JSON copy.
    if (typeof name === "symbol" && !isObservableMap(object)) {
      return;
    }
    remember(this.entries, object).set(name, added.length ? added[0] : NONE);
    if (isObservableMap(object) && removed.length !== added.length) {
      this.shuffled.add(object);
      if (typeof name !== "string") {
        tally(remember(this.odds, object), String(name), added.length ? 1 : -1);
      }
    }
    this.move(object, name, removed, added);
  }

  public items(object: any, index: number, removed: any[], added: any[]): void {
    const list = this.lists.get(object) || object.slice();
    this.lists.set(object, list);
    if (removed.length === added.length) {
      // As many for as many, an item which is written for example: in place,
      // so that the items behind them are not moved.
      added.forEach((item, offset) => {
        list[index + offset] = item;
      });
    } else {
      list.splice(index, removed.length);
      insert(list, index, added);
    }
    this.indexes.delete(object);
    this.asked.delete(object);
    this.move(object, undefined, removed, added);
  }

  public members(object: any, removed: any[], added: any[]): void {
    const memberships = remember(this.memberships, object);
    const texts = this.texts.get(object);
    removed.forEach((member) => {
      memberships.set(member, false);
      if (texts !== undefined) {
        tally(texts, toSegment(member, this), -1);
      }
    });
    added.forEach((member) => {
      memberships.set(member, true);
      if (texts !== undefined) {
        tally(texts, toSegment(member, this), 1);
      }
    });
    this.move(object, undefined, removed, added);
  }

  public box(object: any, removed: any[], added: any[]): void {
    this.boxes.set(object, added[0]);
    this.move(object, undefined, removed, added);
  }

  public held(box: any): any {
    return this.boxes.has(box) ? this.boxes.get(box) : box.get();
  }

  public listOf(array: any): any[] {
    return this.lists.get(array) || array;
  }

  public forEachMember(members: any, visit: (member: any) => void): void {
    const memberships = this.memberships.get(members);
    if (memberships === undefined) {
      NOW.forEachMember(members, visit);
      return;
    }
    NOW.forEachMember(members, (member) => {
      if (!memberships.has(member)) {
        visit(member);
      }
    });
    memberships.forEach((isMember, member) => {
      if (isMember) {
        visit(member);
      }
    });
  }

  public forEachEntry(node: any, visit: (value: any, key: any) => void): void {
    const entries = this.entries.get(node);
    if (entries === undefined) {
      NOW.forEachEntry(node, visit);
      return;
    }
    // In the order the node has them now, then what it has no more. Not one
    // it still has, again: in a map, a key told after another one which
    // reads the same would take its place in a JSON copy.
    const seen = new Set<any>();
    // Of two keys which read the same, a JSON copy shows the last one: once
    // the order is not known, neither is what the copy showed.
    const texts = this.shuffled.has(node) ? new Set<string>() : undefined;
    const visitAsItWas = (value: any, key: any) => {
      seen.add(key);
      const before = entries.has(key) ? entries.get(key) : value;
      if (before !== NONE) {
        if (texts !== undefined && texts.has(String(key))) {
          throw new Error(toTwinRefusal(String(key)));
        }
        if (texts !== undefined) {
          texts.add(String(key));
        }
        visit(before, key);
      }
    };
    NOW.forEachEntry(node, visitAsItWas);
    entries.forEach((_, key) => {
      if (!seen.has(key)) {
        visitAsItWas(NONE, key);
      }
    });
  }

  /**
   * The nodes a change took are not where they were, the ones it brought are.
   */
  private move(holder: any, key: any, taken: any[], brought: any[]): void {
    const isObject = (value: any) =>
      value !== null && typeof value === "object";
    taken.filter(isObject).forEach((value) => {
      const places = this.positionsOf(value);
      const at = places.findIndex(
        (place) => place.holder === holder && isSameKey(place.key, key)
      );
      places.splice(at, 1);
    });
    brought.filter(isObject).forEach((value) => {
      this.positionsOf(value).push({ holder, key });
    });
    // A set which was out of the model is in it again: what was written in
    // its members meanwhile was told nowhere, and its texts were not kept
    // right. They are counted again when they are needed. Not those of the
    // set whose own members come and go: they are followed.
    if (brought.some(isObject)) {
      const own = this.texts.get(holder);
      this.texts.clear();
      if (own !== undefined) {
        this.texts.set(holder, own);
      }
    }
  }

  private positionsOf(node: any): Position[] {
    const places = this.positions.get(node) || this.model.positionsOf(node);
    this.positions.set(node, places);
    return places;
  }

  /**
   * Where a node is in a JSON copy of the model, once per place it is at.
   */
  private locate(node: any, below: any[]): Location[] {
    if (node === this.model.root) {
      return [{ path: "", isItem: false, member: undefined }];
    }
    // The node holds itself: a JSON copy stops there too.
    if (below.indexOf(node) > -1) {
      return [];
    }
    const locations: Location[] = [];
    const seen = new Map<any, Set<any>>();
    this.positionsOf(node).forEach(({ holder, key }) => {
      // The same node twice in an array: its indexes are asked once.
      const keys = seen.get(holder) || new Set<any>();
      seen.set(holder, keys);
      if (keys.has(key)) {
        return;
      }
      keys.add(key);
      this.locate(holder, below.concat([node])).forEach((at) => {
        const { path, member } = at;
        if (member !== undefined) {
          // Already inside a member of a set, further up. Once is enough,
          // however many ways lead to it inside that member.
          const isKnown = locations.some(
            (other) =>
              other.member !== undefined &&
              other.member.node === member.node &&
              other.path === path
          );
          if (!isKnown) {
            locations.push(at);
          }
        } else if (isObservableSet(holder)) {
          locations.push({
            path,
            isItem: false,
            member: { of: holder, node },
          });
        } else if (isBoxedObservable(holder)) {
          // A box is not a place of its own: what it holds is where it is.
          locations.push(at);
        } else if (isObservableArray(holder)) {
          this.indexesOf(holder, node).forEach((item) => {
            locations.push({
              path: toPointer(path, item),
              isItem: true,
              member,
            });
          });
        } else if (isObservableMap(holder)) {
          this.refuse(holder, key, false);
          locations.push({
            path: toPointer(path, String(key)),
            isItem: false,
            member,
          });
        } else if (typeof key !== "symbol") {
          // JSON has no field named by a symbol, so nothing is under one.
          locations.push({
            path: toPointer(path, key),
            isItem: false,
            member,
          });
        }
      });
    });
    return locations;
  }

  /**
   * Where an item is in a list. The first few are looked for in the list
   * itself. A step which writes in many of its items would go through it as
   * many times: from then on the index of each item is kept, until the list
   * changes.
   */
  private indexesOf(array: any, item: any): number[] {
    const list = this.listOf(array);
    const asked = (this.asked.get(array) || 0) + 1;
    this.asked.set(array, asked);
    if (asked <= FEW) {
      const found: number[] = [];
      for (
        let at = list.indexOf(item);
        at > -1;
        at = list.indexOf(item, at + 1)
      ) {
        found.push(at);
      }
      return found;
    }
    let indexes = this.indexes.get(array);
    if (indexes === undefined) {
      const known = new Map<any, number[]>();
      list.forEach((held, index) => {
        known.set(held, (known.get(held) || []).concat([index]));
      });
      this.indexes.set(array, (indexes = known));
    }
    // The list holds it: that is what led here.
    return indexes.get(item) as number[];
  }

  /**
   * What can not be told is not told wrong. Two keys of a map which read the
   * same, 1 and "1", are one key in a JSON copy: no patch can say which of
   * the two entries that key holds, nor what is under it.
   */
  private refuse(map: any, key: any, isGone: boolean): void {
    const text = String(key);
    const odd = this.odds.get(map);
    const entries = this.entries.get(map);
    const hasText =
      entries !== undefined && entries.has(text)
        ? entries.get(text) !== NONE
        : map.has(text);
    const twins =
      this.model.oddOf(map, text) +
      ((odd && odd.get(text)) || 0) +
      (hasText ? 1 : 0);
    if (twins > (isGone ? 0 : 1)) {
      throw new Error(toTwinRefusal(text));
    }
  }

  private textsOf(members: any): Map<string, number> {
    let texts = this.texts.get(members);
    if (texts === undefined) {
      const known = new Map<string, number>();
      this.forEachMember(members, (member) =>
        tally(known, toSegment(member, this), 1)
      );
      this.texts.set(members, (texts = known));
    }
    return texts;
  }

  private toOperations(
    change: Change,
    at: Location,
    isInverse: boolean
  ): Patch {
    const removed = isInverse ? change.added : change.removed;
    const added = isInverse ? change.removed : change.added;
    switch (change.type) {
      case "items":
        return this.toItems(change, at.path, removed, added);
      case "members": {
        const texts = this.textsOf(change.object);
        return change.removed
          .map((member) => toSegment(member, this))
          .map((text) =>
            toMembership(at.path, text, undefined, texts, isInverse)
          )
          .concat(
            change.added
              .map((member) => toSegment(member, this))
              .map((text) =>
                toMembership(at.path, undefined, text, texts, isInverse)
              )
          )
          .reduce((patch, operations) => patch.concat(operations), []);
      }
      case "box":
        return this.toEntry(at.path, at.isItem, removed, added);
      default: {
        if (
          !isObservableMap(change.object) &&
          typeof change.name === "symbol"
        ) {
          // JSON has no field named by a symbol.
          return [];
        }
        return this.toEntry(
          toPointer(at.path, String(change.name)),
          false,
          removed,
          added
        );
      }
    }
  }

  private toItems(
    change: Extract<Change, { type: "items" }>,
    path: string,
    removed: any[],
    added: any[]
  ): Patch {
    const { index } = change;
    if (removed.length === 1 && added.length === 1) {
      return [
        {
          op: "replace",
          path: toPointer(path, index),
          value: orNull(copyIn(added[0], this)),
        },
      ];
    }
    // Nothing is left of what the array held: a sort, a reverse, a replace,
    // a clear. One replace of the array says it, rather than as many
    // removes and adds as it has items.
    if (
      change.removed.length > 0 &&
      this.listOf(change.object).length === change.added.length
    ) {
      return [{ op: "replace", path, value: copyIn(added, this) }];
    }
    // The items it takes away, each at the place of the first, then the
    // items it puts, each at its own place.
    const patch: Patch = removed.map(() => ({
      op: "remove",
      path: toPointer(path, index),
    }));
    added.forEach((item, offset) => {
      patch.push({
        op: "add",
        path: toPointer(path, index + offset),
        value: orNull(copyIn(item, this)),
      });
    });
    return patch;
  }

  /**
   * What happens to one entry of a JSON copy, from what it was to what it is.
   * undefined and a function are not in a JSON copy: an entry which becomes
   * one leaves it, and one which was one enters it. Not so in an array, where
   * an item stays and is null.
   */
  private toEntry(
    path: string,
    isItem: boolean,
    removed: any[],
    added: any[]
  ): Patch {
    // Only the value which is put is copied. The other one is just asked.
    const value = copyIn(added[0], this);
    if (isItem) {
      return [{ op: "replace", path, value: orNull(value) }];
    }
    const wasThere = this.isCopied(removed[0]);
    if (value !== undefined) {
      return [{ op: wasThere ? "replace" : "add", path, value }];
    }
    return wasThere ? [{ op: "remove", path }] : [];
  }

  private isCopied(value: any): boolean {
    if (isBoxedObservable(value)) {
      return this.isCopied(this.held(value));
    }
    return value !== undefined && typeof value !== "function";
  }
}

/**
 * What happens to the keys of a set in a JSON copy when one member goes from
 * a text to another, or from none, or to none. Two members can read the same:
 * the key is only added with the first of them and removed with the last.
 *
 * The texts are counted as the set was right after the change, so the member
 * itself is in the count of the text it has then.
 */
function toMembership(
  path: string,
  before: string | undefined,
  after: string | undefined,
  texts: Map<string, number>,
  isInverse: boolean
): Patch {
  const from = isInverse ? after : before;
  const to = isInverse ? before : after;
  const patch: Patch = [];
  if (from === to) {
    return patch;
  }
  const others = (text: string) =>
    (texts.get(text) || 0) - (text === after ? 1 : 0);
  if (from !== undefined && others(from) === 0) {
    patch.push({ op: "remove", path: toPointer(path, from) });
  }
  if (to !== undefined && others(to) === 0) {
    patch.push({ op: "add", path: toPointer(path, to), value: true });
  }
  return patch;
}

function remember<K, V>(memory: Map<any, Map<K, V>>, node: any): Map<K, V> {
  const known = memory.get(node) || new Map<K, V>();
  memory.set(node, known);
  return known;
}

export function toTwinRefusal(text: string): string {
  return `[RAVIOLI] The patches of this step can not be written: two keys of a Map read "${text}" in a JSON copy.`;
}

/**
 * As a map tells its keys apart: NaN is NaN.
 */
export function isSameKey(one: any, other: any): boolean {
  return one === other || (one !== one && other !== other);
}

function tally(counts: Map<string, number>, text: string, by: number): void {
  counts.set(text, (counts.get(text) || 0) + by);
}

/**
 * Many items are not spread in one call: a list which was emptied gets them
 * all back at once.
 */
function insert(list: any[], index: number, items: any[]): void {
  if (items.length < 1000) {
    list.splice(index, 0, ...items);
    return;
  }
  const tail = list.splice(index);
  items.concat(tail).forEach((item) => list.push(item));
}
