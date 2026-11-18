import { Origin } from "../origin";
import { Reason } from "./rejection";

export interface SAMLoop {
  startStep: StartStep;
  /**
   * Report a proposal which was refused before being presented to the model.
   * It does not start a step, it only fills the last attempt.
   */
  discardProposal(reason: Reason, origin?: Origin): void;
  /**
   * Says whether a proposal is being presented. The step is then locked:
   * what was about to be proposed is discarded, and reported as such.
   */
  refuseIfLocked(origin?: Origin): boolean;
  /**
   * How many steps and jumps (rollback, reset) the container took. Unlike the
   * step id it never comes back to a value it had.
   */
  moment: number;
}

export type Proposal<MUTATION> = MUTATION[];

export type TaggedProposal<MUTATION = any> = Proposal<MUTATION> & {
  stepId?: number;
};

export type StartStep = Present;

export type Present = (proposal: TaggedProposal<any>, origin?: Origin) => void;

export type Delta<MUTATION, CONTROL_STATES_PREDICATES> = {
  acceptedMutations: MUTATION[];
  proposal: TaggedProposal<MUTATION>;
  controlStates: CONTROL_STATES_PREDICATES[];
  previousControlStates: CONTROL_STATES_PREDICATES[];
};

/**
 * A step to jump to with rollback().
 *
 * It carries the model data of the targeted step and the delta which produced
 * it. The delta is reinjected so the step reactions replay as they ran: a
 * reaction which reads the arrival, previousControlStates for example, can not
 * be answered from the data alone.
 *
 * Beware that a delta given to a reaction holds live references. Snapshot it
 * before storing it, or your stored step will follow the model.
 */
export type Step<TYPE, MUTATION, CONTROL_STATES_PREDICATES> = {
  data: TYPE;
  delta: Delta<MUTATION, CONTROL_STATES_PREDICATES>;
};

export interface IProposalBuffer<MUTATIONS> {
  length: number;
  setStepId(stepId: number): void;
  getTaggedProposal(): TaggedProposal<MUTATIONS>;
  push(mutations: MUTATIONS[]): void;
  clear(): void;
}
