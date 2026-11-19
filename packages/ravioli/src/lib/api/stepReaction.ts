import { Compose } from "./composer";
import { StepDelta } from "./presentable";

export type StepReaction<
  MODEL,
  MUTATIONS,
  CONTROL_STATES extends string,
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
  /**
   * Set this to true to await the do() promise before allowing the next step.
   * This ensures async operations (like persistence) complete in order.
   * Defaults to false.
   */
  awaited?: boolean;
  /**
   * @deprecated Renamed `awaited` in 1.9. It does the same; when both are
   * given, `awaited` counts.
   */
  awaitAsync?: boolean;
  when?(args: {
    delta: StepDelta<MUTATIONS, CONTROL_STATES>;
    data: MODEL;
  }): boolean;
  do(args: {
    delta: StepDelta<MUTATIONS, CONTROL_STATES>;
    data: MODEL;
    representation: REPRESENTATION;
    actions: ACTIONS;
    compose: Compose<ACTIONS, MUTATIONS>;
  }): unknown;
};
