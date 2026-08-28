import { CSPredicate } from "./api/predicate";

type Entry<T extends string> = [T, CSPredicate<any, any, T>];

/**
 * Check the whole set of predicates. Everything which does not depend on the
 * model data is refused here: an unknown name, a cycle, a malformed shape.
 *
 * It runs once, when the container is created, so a typo can not reach
 * production and a forward reference stays legal.
 */
export function validateControlStatePredicates<T extends string>(
  controlStatePredicates: Array<Entry<T>>
): void {
  const names = controlStatePredicates.map(([name]) => name);
  const acyclic: T[] = [];

  controlStatePredicates.forEach(([name, predicate]) =>
    validateNode(predicate, name)
  );
  controlStatePredicates.forEach(([name]) => validateCycle(name, []));

  /**
   * Walk a predicate and refuse any shape which can not be evaluated.
   */
  function validateNode(node: any, name: T): void {
    // A function is opaque, it is checked when it runs.
    if (typeof node === "function") {
      return;
    }

    // A name refers to another control state.
    if (typeof node === "string") {
      if (names.indexOf(node as T) === -1) {
        throw new Error(
          `[RAVIOLI] The control state ${name} refers to ${node}, which is not a control state.`
        );
      }
      return;
    }

    if (node === null || typeof node !== "object") {
      throw new Error(
        `[RAVIOLI] The control state ${name} has a malformed predicate: ${describe(
          node
        )}.`
      );
    }

    const keys = Object.keys(node);
    if (keys.length !== 1) {
      throw new Error(
        `[RAVIOLI] The control state ${name} has a malformed predicate: expected one of previous, not, and, or, got ${
          keys.length ? keys.join(", ") : "nothing"
        }.`
      );
    }

    const key = keys[0];

    if (key === "previous") {
      // A previous leaf reads the previous step, it does not evaluate anything.
      if (typeof node.previous !== "string") {
        throw new Error(
          `[RAVIOLI] The control state ${name} expects a control state name in previous, got ${describe(
            node.previous
          )}.`
        );
      }
      if (names.indexOf(node.previous) === -1) {
        throw new Error(
          `[RAVIOLI] The control state ${name} refers to ${node.previous}, which is not a control state.`
        );
      }
      return;
    }

    if (key === "not") {
      if (node.not === undefined) {
        throw new Error(
          `[RAVIOLI] The control state ${name} has an empty not.`
        );
      }
      validateNode(node.not, name);
      return;
    }

    if (key === "and" || key === "or") {
      if (!Array.isArray(node[key])) {
        throw new Error(
          `[RAVIOLI] The control state ${name} expects an array in ${key}, got ${describe(
            node[key]
          )}.`
        );
      }
      // An empty and is always true, an empty or always false. Both are
      // certainly a mistake rather than an intent.
      if (node[key].length === 0) {
        throw new Error(
          `[RAVIOLI] The control state ${name} has an empty ${key}.`
        );
      }
      node[key].forEach((member: any) => validateNode(member, name));
      return;
    }

    throw new Error(
      `[RAVIOLI] The control state ${name} has an unknown predicate key: ${key}.`
    );
  }

  /**
   * A name leaf is resolved by evaluating the predicate it refers to, so a loop
   * of names would never end. A previous leaf reads the previous step instead of
   * evaluating, so it is not part of the graph.
   */
  function validateCycle(name: T, path: T[]): void {
    if (path.indexOf(name) > -1) {
      throw new Error(
        `[RAVIOLI] The control states are in a cycle: ${path
          .concat(name)
          .join(" -> ")}.`
      );
    }
    if (acyclic.indexOf(name) > -1) {
      return;
    }
    const entry = controlStatePredicates.filter(([id]) => id === name)[0];
    if (entry !== undefined) {
      references(entry[1]).forEach((referred) =>
        validateCycle(referred, path.concat(name))
      );
    }
    acyclic.push(name);
  }

  /**
   * The control states a predicate has to evaluate to answer.
   */
  function references(node: any): T[] {
    if (typeof node === "string") {
      return [node as T];
    }
    if (node === null || typeof node !== "object") {
      return [];
    }
    if ("not" in node) {
      return references(node.not);
    }
    if ("and" in node || "or" in node) {
      const members: any[] = "and" in node ? node.and : node.or;
      return members.reduce(
        (all: T[], member: any) => all.concat(references(member)),
        []
      );
    }
    return [];
  }
}

export function getControlStates<T extends string>({
  controlStatePredicates,
  data,
  acceptedMutations,
  previousControlStates,
}: {
  controlStatePredicates: Array<Entry<T>>;
  previousControlStates: T[];
  data: any;
  acceptedMutations: any[];
}): T[] {
  return controlStatePredicates
    .filter(([name, predicate]) => runPredicate(predicate, name))
    .map(([name]) => name);

  /**
   * Evaluate the predicate. The shape was checked when the container was
   * created: what is left here only depends on the model data.
   */
  function runPredicate(predicate: any, name: T): boolean {
    if (typeof predicate === "function") {
      return runFunction(predicate, name);
    }

    // This control state is an alias of another one.
    if (typeof predicate === "string") {
      return runPredicate(findPredicate(predicate as T, name), predicate as T);
    }

    if (predicate !== null && typeof predicate === "object") {
      // This control state has an order constraint and can be active only if the
      // specified control state was active at the previous step.
      if ("previous" in predicate) {
        return previousControlStates.indexOf(predicate.previous) > -1;
      }
      if ("not" in predicate) {
        return !runPredicate(predicate.not, name);
      }
      if ("and" in predicate) {
        return predicate.and.every((member: any) => runPredicate(member, name));
      }
      if ("or" in predicate) {
        return predicate.or.some((member: any) => runPredicate(member, name));
      }
    }

    throw new Error(
      `[RAVIOLI] The control state ${name} has a malformed predicate: ${describe(
        predicate
      )}.`
    );
  }

  function runFunction(predicate: Function, name: T): boolean {
    let result;
    try {
      result = predicate({ data, acceptedMutations, previousControlStates });
    } catch (error) {
      throw new Error(
        `[RAVIOLI] The predicate of the control state ${name} threw: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
    if (typeof result !== "boolean") {
      throw new Error(
        `[RAVIOLI] The predicate of the control state ${name} returned ${describe(
          result
        )} instead of a boolean.`
      );
    }
    return result;
  }

  function findPredicate(name: T, from: T): CSPredicate<any, any, T> {
    const entry = controlStatePredicates.filter(([id]) => id === name)[0];
    if (entry === undefined) {
      throw new Error(
        `[RAVIOLI] The control state ${from} refers to ${name}, which is not a control state.`
      );
    }
    return entry[1];
  }
}

function describe(value: any): string {
  if (value === null) {
    return "null";
  }
  if (Array.isArray(value)) {
    return "an array";
  }
  return typeof value;
}
