/**
 * Why a mutation, or a whole proposal, was not applied to the model.
 * `code` is free. Use one of the built in `RejectionCode` or your own.
 */
export type Reason = {
  code: string;
  message?: string;
  meta?: unknown;
};

/**
 * A part of a proposal which was presented to the model and refused by its acceptor.
 */
export type Rejection<MUTATION> = {
  mutation: MUTATION;
  reason: Reason;
};

/**
 * The built in rejection codes.
 * An acceptor condition can return any other code of your own.
 */
export const RejectionCode = {
  /** The acceptor condition returned false. */
  conditionFailed: "CONDITION_FAILED",
  /** No acceptor is bound to this mutation type. */
  unknownAcceptor: "UNKNOWN_ACCEPTOR",
  /** The proposal was tagged with an outdated step id. */
  staleProposal: "STALE_PROPOSAL",
  /** The action was not allowed for the current control states. */
  unauthorized: "UNAUTHORIZED",
} as const;

/**
 * The outcome of a step attempt.
 *
 * - `accepted`: the model applied at least one mutation. `rejected` may still
 *   hold the parts of the proposal which were refused.
 * - `rejected`: the model examined the proposal and applied nothing. No new step,
 *   no step reaction: the clock did not tick.
 * - `discarded`: the proposal never reached the model (stale or unauthorized).
 *   There is no per mutation reason as no acceptor ever ran.
 *
 * `attemptedAt` is the step id the attempt was made against. Compare it with the
 * current `stepId` to know if the attempt still relates to what you display.
 */
export type Attempt<MUTATION> =
  | {
      status: "accepted";
      attemptedAt: number;
      accepted: MUTATION[];
      rejected: Rejection<MUTATION>[];
    }
  | {
      status: "rejected";
      attemptedAt: number;
      rejected: Rejection<MUTATION>[];
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
    return { code: RejectionCode.conditionFailed };
  }
  // A condition can return a reason instead of false to explain its refusal.
  if (typeof verdict === "object" && verdict !== null) {
    return typeof verdict.code === "string"
      ? verdict
      : { ...verdict, code: RejectionCode.conditionFailed };
  }
  return undefined;
}
