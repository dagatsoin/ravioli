import { Delta } from "./presentable";

export type StepReaction<
  TYPE,
  MUTATION,
  CONTROL_STATES_PREDICATES extends string,
  ACTIONS,
  REPRESENTATION,
> = {
  /**
   * This name will appear in the console for debuging purpose.
   */
  debugName?: string,
  /**
   * Run only once during the container life cycle.
   */
  once?: boolean,
  /**
   * Set this to false if you don't want the reaction to run at container initialization.
   * Defaults to true.
   */
  runOnInit?: boolean;
  when?(args: {
    delta: Delta<MUTATION, CONTROL_STATES_PREDICATES>;
    data: TYPE;
  }): boolean;
  do(args: {
    delta: Delta<MUTATION, CONTROL_STATES_PREDICATES>;
    data: TYPE;
    representation: REPRESENTATION;
    actions: ACTIONS;
  }): void;
};
