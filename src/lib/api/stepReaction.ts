import { Delta } from "./presentable";

export type StepReaction<
  TYPE,
  MUTATION,
  CONTROL_STATES_PREDICATES extends string,
  ACTIONS
> = {
  when?(args: {
    delta: Delta<MUTATION, CONTROL_STATES_PREDICATES>;
    data: TYPE;
  }): boolean;
  do(args: {
    delta: Delta<MUTATION, CONTROL_STATES_PREDICATES>;
    data: TYPE;
    actions: ACTIONS;
  }): void;
};
