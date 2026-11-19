import {
  isBoxedObservable,
  isObservableArray,
  isObservableMap,
  isObservableSet,
} from "mobx";
import { Patch, PatchOperation } from "./api/patch";

/**
 * What stands for a node which holds itself, in a JSON copy.
 */
const CIRCULAR = "[Circular]";

/**
 * What the nodes hold, as a copy reads them: now, or at an earlier moment.
 */
export interface View {
  held(box: any): any;
  listOf(array: any): any[];
  forEachMember(members: any, visit: (member: any) => void): void;
  forEachEntry(node: any, visit: (value: any, key: any) => void): void;
}

export const NOW: View = {
  held: (box) => box.get(),
  listOf: (array) => array,
  forEachMember: (members, visit) => {
    members.forEach((member: any) => visit(member));
  },
  forEachEntry: (node, visit) => {
    if (node instanceof Map || isObservableMap(node)) {
      node.forEach(visit);
    } else {
      Object.keys(node).forEach((key) => visit(node[key], key));
    }
  },
};

/**
 * A JSON copy of a value of the model. It is what the patches of a step are
 * written against, so it follows the same conventions:
 *
 * - a Map is an object, its keys as texts
 * - a Set is an object too, `{ member: true }`. A member which is not a text
 *   is named by its own JSON, its keys sorted
 * - a Date is its ISO text, a symbol and a bigint are their text
 * - a boxed value is what it holds
 * - undefined and a function are not copied: a field which holds one is left
 *   out, an item of an array which is one is null, as JSON does
 * - a node which holds itself is "[Circular]" where it comes back
 *
 * Returns undefined for a value which is not copied.
 */
export function jsonCopy(value: any): any {
  return copyIn(value, NOW);
}

/**
 * The same, of the value as a view shows it.
 */
export function copyIn(value: any, view: View): any {
  return copy(value, [], view);
}

function copy(value: any, ancestors: any[], view: View): any {
  if (isBoxedObservable(value)) {
    return copy(view.held(value), ancestors, view);
  }
  if (typeof value === "function") {
    return undefined;
  }
  if (typeof value === "symbol" || typeof value === "bigint") {
    return String(value);
  }
  if (value === null || typeof value !== "object") {
    return value;
  }
  if (value instanceof Date) {
    return isNaN(value.getTime()) ? null : value.toISOString();
  }
  if (ancestors.indexOf(value) > -1) {
    return CIRCULAR;
  }

  const below = ancestors.concat([value]);
  if (Array.isArray(value) || isObservableArray(value)) {
    return view.listOf(value).map((item) => orNull(copy(item, below, view)));
  }

  const json = {};
  if (value instanceof Set || isObservableSet(value)) {
    view.forEachMember(value, (member) => {
      put(json, toSegment(member, view, below), true);
    });
  } else {
    view.forEachEntry(value, (item, key) => {
      put(json, toSegment(key, view, below), copy(item, below, view));
    });
  }
  return json;
}

/**
 * An item of an array which is not copied leaves a null, as JSON does.
 */
export function orNull(value: any): any {
  return value === undefined ? null : value;
}

/**
 * Written as an own field whatever the key is: assigning `__proto__` would
 * change what the object inherits from instead.
 */
function put(json: object, key: string, value: any): void {
  if (value !== undefined) {
    Object.defineProperty(json, key, {
      value,
      enumerable: true,
      writable: true,
      configurable: true,
    });
  }
}

/**
 * The key of a map or the member of a set, as the text which names it in a
 * JSON copy. Two which read the same, 1 and "1" for example, are one there.
 */
export function toSegment(key: any, view: View, ancestors: any[] = []): string {
  // A text whatever comes: a box which holds nothing has no JSON at all.
  return key !== null && typeof key === "object"
    ? String(JSON.stringify(inOrder(copy(key, ancestors, view))))
    : String(key);
}

/**
 * The same JSON with its keys sorted, all the way down. An object reads the
 * same whatever the order its fields were written in: a field which is
 * removed and comes back must not make another text of it.
 */
function inOrder(json: any): any {
  if (json === null || typeof json !== "object") {
    return json;
  }
  if (Array.isArray(json)) {
    return json.map(inOrder);
  }
  const sorted = {};
  Object.keys(json)
    .sort()
    .forEach(function (key) {
      put(sorted, key, inOrder(json[key]));
    });
  return sorted;
}

/**
 * The JSON pointer (RFC 6901) of what is under this segment of a path.
 */
export function toPointer(path: string, segment: string | number): string {
  return `${path}/${String(segment).replace(/~/g, "~0").replace(/\//g, "~1")}`;
}

/**
 * Apply a patch to a JSON document, the way RFC 6902 says: the document is
 * modified in place and returned, except when the patch replaces it whole. So
 * `patches.reduce(applyPatch, copy)` replays a step on a JSON copy.
 *
 * It applies what Ravioli writes: add, remove and replace. It throws on any
 * other operation and on a path which leads nowhere, rather than leaving a
 * document which is no longer the model.
 */
export function applyPatch<T>(document: T, patch: Patch): T {
  return patch.reduce(applyOperation, document as any);
}

function applyOperation(
  document: any,
  { op, path, value }: PatchOperation
): any {
  if (op !== "add" && op !== "remove" && op !== "replace") {
    throw new Error(
      `[RAVIOLI] Can't apply the operation ${op}: only add, remove and replace are applied.`
    );
  }
  // The whole document.
  if (path === "") {
    return op === "remove" ? undefined : jsonCopy(value);
  }
  if (path.charAt(0) !== "/") {
    throw new Error(
      `[RAVIOLI] Can't apply the patch: ${path} is not a JSON pointer.`
    );
  }

  const keys = path
    .split("/")
    .slice(1)
    .map(function (segment) {
      return segment.replace(/~1/g, "/").replace(/~0/g, "~");
    });
  // A pointer which is not empty has at least one segment.
  const key = keys[keys.length - 1];
  const holder = keys.slice(0, -1).reduce(function (node, segment) {
    if (!holds(node, segment)) {
      throw nothingAt(path);
    }
    return node[segment];
  }, document);

  const isList = Array.isArray(holder);
  // An add may name the place right after the last item, or "-" for the same.
  const isAppended =
    isList && op === "add" && (key === "-" || key === String(holder.length));
  const isNewField =
    !isList && op === "add" && holder !== null && typeof holder === "object";
  if (!isAppended && !isNewField && !holds(holder, key)) {
    throw nothingAt(path);
  }

  // A copy: the patch must not follow what is done to the document next.
  if (isAppended) {
    holder.push(orNull(jsonCopy(value)));
  } else if (isList && op === "remove") {
    holder.splice(Number(key), 1);
  } else if (isList) {
    holder.splice(Number(key), op === "add" ? 0 : 1, orNull(jsonCopy(value)));
  } else if (op === "remove") {
    delete holder[key];
  } else {
    put(holder, key, jsonCopy(value));
  }
  return document;
}

/**
 * Only what the node holds itself: following `__proto__` or `constructor`
 * would lead out of the document.
 */
function holds(node: any, key: string): boolean {
  if (Array.isArray(node)) {
    return /^(0|[1-9][0-9]*)$/.test(key) && Number(key) < node.length;
  }
  return (
    node !== null &&
    typeof node === "object" &&
    Object.prototype.hasOwnProperty.call(node, key)
  );
}

function nothingAt(path: string): Error {
  return new Error(`[RAVIOLI] Can't apply the patch: nothing is at ${path}.`);
}
