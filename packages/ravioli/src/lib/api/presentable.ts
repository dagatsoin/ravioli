import { Origin } from "../origin";
import { Patch } from "./patch";
import { Reason } from "./rejection";

export interface SAMLoop {
  startStep: StartStep;
  /**
   * Report a proposal which was refused before being presented to the model.
   * It does not start a step, it only fills the last attempt, and tells the
   * author when there is one to tell.
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
 * What a step reaction is given of the step it reacts to: the delta, and the
 * patches of the step.
 *
 * They are read by name: they are not listed in the delta, so
 * `JSON.stringify`, a spread and `toEqual` see the delta as it always was.
 * They only tell the model data: the step id and the control states are right
 * there in the delta. Unlike the rest of the delta they hold copies, not live
 * references: a patch can be stored as it is.
 *
 * They are written when they are first read, and are read while the
 * reactions of the step run: a reaction which is not awaited reads them
 * before it waits on anything. Once the step is over, reading patches nobody
 * read in time throws.
 *
 * They are empty at creation and after a reset. A rollback hands over those
 * of the step it is given, none when it was built by hand.
 */
export type StepDelta<MUTATION, CONTROL_STATES_PREDICATES> = Delta<
  MUTATION,
  CONTROL_STATES_PREDICATES
> & {
  /**
   * What the step did to the model data, as JSON patches (RFC 6902): one patch
   * per write in the model, first write first. Applied in that order to a JSON
   * copy of the data before the step, they give the data after it.
   */
  patches: Patch[];
  /**
   * What undoes the step, last write first. Applied in that order to a JSON
   * copy of the data after the step, they give the data before it.
   */
  inversePatches: Patch[];
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
