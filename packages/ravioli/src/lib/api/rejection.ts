/**
 * Why a mutation, or a whole proposal, was not applied to the model.
 * `code` is free. Use one of the built in `ReasonCode` or your own.
 */
export type Reason = {
  code: string;
  message?: string;
  meta?: unknown;
};

/**
 * A part of a proposal which was presented to the model and refused by its acceptor.
 */
export type Rejection<MUTATIONS> = {
  mutation: MUTATIONS;
  reason: Reason;
};

/**
 * The built in codes of a `Reason`: why a mutation was rejected, a proposal
 * discarded, or the reactions of a step did not settle.
 * An acceptor condition can return any other code of your own.
 */
export const ReasonCode = {
  /** The acceptor condition returned false. */
  conditionFailed: "CONDITION_FAILED",
  /** No acceptor is bound to this mutation type. */
  unknownAcceptor: "UNKNOWN_ACCEPTOR",
  /** The proposal was tagged with an outdated step id. */
  staleProposal: "STALE_PROPOSAL",
  /** The action was not allowed for the current control states. */
  unauthorized: "UNAUTHORIZED",
  /**
   * A proposal was already being presented. Nothing else is presented
   * meanwhile: neither a condition, a mutator, a control state predicate nor
   * whoever listens to the model sends an action. The same while a rollback
   * or a reset puts its state in the model, and while a step is taken back.
   */
  stepLocked: "STEP_LOCKED",
  /**
   * A step reaction threw. The step happened, its consequences did not. When
   * the reaction was awaited, the step itself was undone.
   */
  reactionThrew: "REACTION_THREW",
  /**
   * An awaited reaction failed and the step could not be taken back. It
   * stands, whole.
   */
  stepNotUndone: "STEP_NOT_UNDONE",
  /** The step reactions kept proposing and never settled. */
  reactionsDidNotSettle: "REACTIONS_DID_NOT_SETTLE",
  /** The proposal waited behind a step which was undone. It was not presented. */
  precedingStepUndone: "PRECEDING_STEP_UNDONE",
} as const;

/**
 * @deprecated Renamed `ReasonCode` in 1.9: the codes are those of a `Reason`,
 * which a rejection is not the only one to give. The same object.
 */
export const RejectionCode = ReasonCode;

/**
 * The outcome of a step attempt.
 *
 * - `accepted`: the model applied at least one mutation. `rejected` may still
 *   hold the parts of the proposal which were refused. `settled` says whether
 *   the step reactions ran to the end: it is written true, then turned false if
 *   the reaction pass fails, so an observer is told twice. `undone` says the
 *   step was then taken back, which happens when the reaction which failed was
 *   awaited: the model is not left ahead of a write which did not happen.
 * - `rejected`: the model examined the proposal and applied nothing. No new step,
 *   no step reaction: the clock did not tick.
 * - `discarded`: the proposal never reached the model (stale, unauthorized,
 *   unknown action, or waiting behind a step which was undone). There is no per
 *   mutation reason as no acceptor ever ran.
 *
 * `attemptedAt` is the step id the attempt was made against. Compare it with the
 * current `stepId` to know if the attempt still relates to what you display.
 */
export type Attempt<MUTATIONS> =
  | {
      status: "accepted";
      attemptedAt: number;
      accepted: MUTATIONS[];
      rejected: Rejection<MUTATIONS>[];
      /**
       * False when the step reactions did not run to the end. The step itself
       * stands, unless it was undone: the model was mutated and the step id did
       * tick.
       */
      settled: boolean;
      /** Why the reactions did not settle. Only when settled is false. */
      reason?: Reason;
      /**
       * True when the step was taken back, because an awaited reaction failed.
       * The model, the step id and the control states are those from before the
       * step, and `accepted` tells what was undone. Only when settled is false.
       */
      undone?: boolean;
    }
  | {
      status: "rejected";
      attemptedAt: number;
      rejected: Rejection<MUTATIONS>[];
    }
  | {
      status: "discarded";
      attemptedAt: number;
      reason: Reason;
    };

/**
 * Normalize what an acceptor condition returned.
 * Returns undefined when the mutation is accepted.
 */
export function toReason(verdict: boolean | Reason): Reason | undefined {
  if (verdict === false) {
    return { code: ReasonCode.conditionFailed };
  }
  // A condition can return a reason instead of false to explain its refusal.
  if (typeof verdict === "object" && verdict !== null) {
    return typeof verdict.code === "string"
      ? verdict
      : { ...verdict, code: ReasonCode.conditionFailed };
  }
  return undefined;
}
