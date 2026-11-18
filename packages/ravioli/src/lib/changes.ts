/**
 * One write in the model, as MobX reports it once it is done, in one shape
 * whatever the node is: somewhere in `object`, `removed` gave way to `added`.
 *
 * It holds the nodes themselves, not a copy of them. Taking a change back puts
 * the very node which was removed where it was, with whoever observes it.
 */
export type Change =
  /** A field of an object, or an entry of a map: one value at most each way. */
  | { type: "entry"; object: any; name: any; removed: any[]; added: any[] }
  /** The items of an array, from an index on. */
  | { type: "items"; object: any; index: number; removed: any[]; added: any[] }
  /** The members of a set. */
  | { type: "members"; object: any; removed: any[]; added: any[] }
  /** What a box holds: one value each way. */
  | { type: "box"; object: any; removed: any[]; added: any[] };

/**
 * What changes are written in: the model itself, to take a step back, or what
 * is remembered of its past, to tell a step.
 */
export interface Store {
  entry(object: any, name: any, removed: any[], added: any[]): void;
  items(object: any, index: number, removed: any[], added: any[]): void;
  members(object: any, removed: any[], added: any[]): void;
  box(object: any, removed: any[], added: any[]): void;
}

/**
 * The change which takes this one back.
 */
export function invert(change: Change): Change {
  return { ...change, removed: change.added, added: change.removed };
}

export function apply(change: Change, store: Store): void {
  switch (change.type) {
    case "entry":
      store.entry(change.object, change.name, change.removed, change.added);
      break;
    case "items":
      store.items(change.object, change.index, change.removed, change.added);
      break;
    case "members":
      store.members(change.object, change.removed, change.added);
      break;
    default:
      store.box(change.object, change.removed, change.added);
  }
}
