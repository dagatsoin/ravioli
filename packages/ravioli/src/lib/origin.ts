/**
 * A pass of the step reactions.
 */
export type ReactionPass = {
  /**
   * How many steps in a row the reactions started to get to this one.
   */
  depth: number;
  /**
   * The steps the reactions start one after the other, from the step somebody
   * asked for to the last one. Its passes share it.
   */
  chain: { isOver: boolean };
};

/**
 * What the container needs to know of a proposal beside its mutations.
 */
export type Origin<MUTATION = any> = {
  /**
   * The pass of the reaction which made the proposal, when a reaction did
   * through the actions it was given.
   */
  pass?: ReactionPass;
  /**
   * Says whether the action is still allowed, and reports it when it is not.
   * It was asked when the action was called. It is asked again when the
   * proposal had to wait.
   */
  isAllowed?: () => boolean;
  /**
   * The moment a cancelable action was called at. Anything which happened
   * since cancels it.
   */
  calledAt?: number;
};
