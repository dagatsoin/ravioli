import { Attempt } from "../..";

/**
 * Narrowing helpers. They fail the test with a readable message instead of
 * letting the assertion crash on an undefined field.
 */
export function asAccepted<M>(attempt: Attempt<M> | undefined) {
  if (attempt?.status !== "accepted") {
    throw new Error(`Expected an accepted attempt, got ${attempt?.status}`);
  }
  return attempt;
}

export function asRejected<M>(attempt: Attempt<M> | undefined) {
  if (attempt?.status !== "rejected") {
    throw new Error(`Expected a rejected attempt, got ${attempt?.status}`);
  }
  return attempt;
}

export function asDiscarded<M>(attempt: Attempt<M> | undefined) {
  if (attempt?.status !== "discarded") {
    throw new Error(`Expected a discarded attempt, got ${attempt?.status}`);
  }
  return attempt;
}
