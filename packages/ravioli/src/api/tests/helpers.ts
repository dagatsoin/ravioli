import { Attempt } from "../..";

/**
 * One write to the database. The test decides when it ends, and how.
 */
export type Write = { done(): void; fail(error: unknown): void };

/**
 * A step reaction which writes each step to a database, and is awaited. The
 * write is handed to the test, which ends it when it wants.
 */
export function persist(writes: Write[]) {
  return {
    debugName: "persist",
    awaitAsync: true,
    runOnInit: false,
    do: () =>
      new Promise<void>((done, fail) => {
        writes.push({ done, fail });
      }),
  };
}

/**
 * Lets everything which was waiting on a promise run.
 */
export function settle() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

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
