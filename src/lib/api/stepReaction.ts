import { Delta } from "./presentable";

export type StepReaction<
  TYPE,
  MUTATION,
  CONTROL_STATES_PREDICATES extends string,
  ACTIONS
> = {
  predicate?(args: {
    delta: Delta<MUTATION, CONTROL_STATES_PREDICATES>;
    model: TYPE;
  }): boolean;
  effect(args: {
    delta: Delta<MUTATION, CONTROL_STATES_PREDICATES>;
    model: TYPE;
    actions: ACTIONS;
  }): void;
};
