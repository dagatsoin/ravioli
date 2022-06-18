import { CSPredicate } from "./api/predicate";

export function getControlStates<T extends string>({
  controlStatePredicates,
  data,
  acceptedMutations,
  previousControlStates,
  keepLastControlStateIfUndefined = false
}: {
  controlStatePredicates: Array<[T, CSPredicate<any, any, T>]>;
  previousControlStates: T[];
  data: any;
  acceptedMutations: any[];
  /**
   * @deprecated if no control state is found, return the previous.
   * 
   * This params is deprecated and will be removed in the future.
   */
  keepLastControlStateIfUndefined?: boolean
}): T[] {
  const controlStates = controlStatePredicates
    .filter(([_, predicate], index) => runPredicate(predicate, index))
    .map(([name]) => name);
  
  if (!controlStates.length && keepLastControlStateIfUndefined) {
    return previousControlStates
  }
  
  return controlStates
  
  /**
   * Evaluate the predicate.
   */
  function runPredicate(
    predicate: CSPredicate<any, any, T>,
    index: number
  ): boolean {
    if (typeof predicate === "function") {
      return predicate({
        model: data,
        acceptedMutations,
        previousControlStates,
      });
    } else if (typeof predicate === "string") {
      const predicateName = predicate;
      const predicateFunction: CSPredicate<any, any, T> | undefined =
        controlStatePredicates[index][1];
      if (predicateFunction === undefined) {
        console.error(index, predicateName);
        throw new Error(
          "[RAVIOLI] Unknown control state predicate" + predicateName
        );
      } else {
        return runPredicate(predicateFunction, index);
      }
    } else if (typeof predicate === "object") {
      // This control state has an order constraint and can be called only if the specified control state was active previously
      if ("previous" in predicate) {
        return previousControlStates.includes(predicate.previous);
      } else if ("or" in predicate) {
        return predicate.or.some((p) => {
          runPredicate(
            p,
            typeof p === "string"
              ? controlStatePredicates.findIndex(([name]) => name === p)
              : -1
          );
        });
      } else if ("and" in predicate) {
        return predicate.and.every((p) => {
          runPredicate(
            p,
            typeof p === "string"
              ? controlStatePredicates.findIndex(([name]) => name === p)
              : -1
          );
        });
      } else if ("not" in predicate) {
        return !runPredicate(
          predicate.not,
          typeof predicate === "string"
            ? controlStatePredicates.findIndex(([name]) => name === predicate)
            : -1
        );
      }
    }
    return true;
  }
}
