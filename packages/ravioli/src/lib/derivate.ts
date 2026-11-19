import {
  IObservable,
  isBoxedObservable,
  isComputedProp,
  isObservableArray,
  isObservableMap,
  isObservableObject,
  isObservableSet,
  observable,
  remove,
  runInAction,
  set,
} from "mobx";

/**
 * Make the representation match its new derivation.
 */
export function derivate(target: IObservable, source: any) {
  reconcile(target, source);
}

/**
 * Update an observable in place so it becomes deeply equal to `source`,
 * keeping the identity of every observable node which is still there.
 *
 * Observers stay attached: they see values change, they never see an object
 * swapped under them. Use it to jump the model to another state without
 * rebuilding the container.
 *
 * Handles every shape MobX can produce: objects, arrays, maps, sets, boxed
 * values, cycles and shared references. Anything MobX keeps as an opaque value,
 * a class instance or a Date for example, is replaced instead of being updated,
 * unless it is observable itself and of the same class.
 */
export function reconcile(target: object, source: any): void {
  runInAction(function () {
    // Seeded with the root so a state which references itself terminates.
    const seen: Map<any, any> = new Map();
    seen.set(source, target);
    reconcileNode(target, source, seen);
  });
}

/**
 * Reconcile two nodes of the same shape. The caller checked they are compatible.
 */
function reconcileNode(target: any, source: any, seen: Map<any, any>): void {
  if (isBoxedObservable(target)) {
    const next = isBoxedObservable(source) ? source.get() : source;
    target.set(reconcileValue(target.get(), next, seen));
    return;
  }

  if (isObservableArray(target)) {
    const items: any[] = [];
    for (let index = 0; index < source.length; index++) {
      // Same index, same shape: keep the element so its observers survive.
      items.push(
        reconcileValue(
          index < target.length ? target[index] : undefined,
          source[index],
          seen
        )
      );
    }
    target.replace(items);
    return;
  }

  if (isObservableMap(target)) {
    Array.from(target.keys()).forEach(function (key) {
      if (!source.has(key)) {
        target.delete(key);
      }
    });
    source.forEach(function (value: any, key: any) {
      target.set(
        key,
        reconcileValue(target.has(key) ? target.get(key) : undefined, value, seen)
      );
    });
    return;
  }

  if (isObservableSet(target)) {
    // A set has no key to match its members on: they are replaced.
    const members: any[] = [];
    source.forEach(function (member: any) {
      members.push(reconcileValue(undefined, member, seen));
    });
    target.replace(members);
    return;
  }

  if (isObservableObject(target)) {
    // A computed is not enumerable: it is never met here.
    Object.keys(target).forEach(function (key) {
      if (!hasOwn(source, key)) {
        remove(target, key);
      }
    });
    Object.keys(source).forEach(function (key) {
      if (isComputedProp(target, key)) {
        return;
      }
      set(target, key, reconcileValue(target[key], source[key], seen));
    });
    return;
  }

  console.error("Unknown observable type");
}

/**
 * Returns the value to store: the current node when it can be updated in place,
 * a node of our own otherwise.
 */
function reconcileValue(current: any, next: any, seen: Map<any, any>): any {
  if (current === next) {
    return current;
  }

  const isNode = next !== null && typeof next === "object";

  // The source can hold the same node twice, or point back to itself.
  if (isNode && seen.has(next)) {
    return seen.get(next);
  }

  if (canReconcile(current, next)) {
    if (isNode) {
      seen.set(next, current);
    }
    reconcileNode(current, next, seen);
    return current;
  }

  // Nothing to update in place. Build the node ourselves rather than handing the
  // raw source to MobX, which would loop forever on a cyclic graph.
  const fresh = isNode ? createEmptyLike(next) : undefined;
  if (fresh === undefined) {
    return next;
  }
  seen.set(next, fresh);
  reconcileNode(fresh, next, seen);
  return fresh;
}

function canReconcile(current: any, next: any): boolean {
  if (isBoxedObservable(current)) {
    return true;
  }
  if (isObservableArray(current)) {
    return Array.isArray(next);
  }
  if (isObservableMap(current)) {
    return next instanceof Map || isObservableMap(next);
  }
  if (isObservableSet(current)) {
    return next instanceof Set || isObservableSet(next);
  }
  if (isObservableObject(current)) {
    return (
      next !== null &&
      typeof next === "object" &&
      !Array.isArray(next) &&
      !(next instanceof Map) &&
      !isObservableMap(next) &&
      !(next instanceof Set) &&
      !isObservableSet(next) &&
      // A class instance is only reconciled against the same class.
      Object.getPrototypeOf(current) === Object.getPrototypeOf(next)
    );
  }
  return false;
}

/**
 * An empty observable of the same kind as the source, or undefined when MobX
 * would keep the source as an opaque value.
 */
function createEmptyLike(source: any): any {
  if (Array.isArray(source)) {
    return observable.array([]);
  }
  if (source instanceof Map || isObservableMap(source)) {
    return observable.map();
  }
  if (source instanceof Set || isObservableSet(source)) {
    return observable.set();
  }
  if (isPlainObject(source)) {
    return observable.object({});
  }
  return undefined;
}

function isPlainObject(value: object): boolean {
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function hasOwn(source: any, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(source, key);
}
