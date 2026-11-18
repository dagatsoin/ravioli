# Roadmap

Ideas accepted in principle, not scheduled yet. Each one says why it exists and what it must keep
true: a step is one atomic transition of the model (SAM's temporal logic, a TLA+ `Next`), and
nothing interleaves with it inside a container.

## Long-running acceptors

**Origin.** Jared's `conception` service holds each information system in a Ravioli container
(spike of 2026-10-22). Accepting some proposals needs a model checker to run on the specs: today
110–350 ms, but minutes on large specs. The checker and its verdict are, in essence, the
**condition of an acceptor**: "accept this version only if the checker says the spec still holds".

**What we do meanwhile.** The long work is done in the **action**: the checker's verdict is the
proposal's payload, the acceptor stays an instantaneous guard on that payload, and the container is
locked by an external queue from the start of the action to the end of the step (nothing else is
presented meanwhile, so the proposal is always computed on the current state). The action waits on
a supervised job, not on a bare promise.

**What Ravioli could offer instead.** An acceptor whose condition is a long computation:

```ts
publish: {
  condition: longCondition({
    run: (snapshot, { signal, progress }) => job,   // a supervised job, run outside the event loop
    timeout: 10 * 60_000,                           // past it, the condition is false, with a reason
  }),
  mutator: (data, payload) => { … },               // applied at the end, at once
}
```

What it must guarantee:

1. **The step stays atomic, however long.** The container is locked from the moment the step starts
   until its end, minutes if needed. The model is read-only during the condition; the mutator
   applies everything at the end. Observers keep seeing the previous state until then.
2. **Proposals presented meanwhile are queued, never dropped.** Generalise `NAPproposalBuffer`
   (`src/lib/instance.ts:143`, `:210-212`) into a container-level queue: NAP proposals of the step
   first (SAM's order), then the queued proposals in arrival order (weak fairness).
3. **A long condition is a supervised job, not a promise.** A promise survives nothing (restart,
   deploy), reports nothing and cannot be stopped. The job has an id, a state (queued, running,
   done, failed), progress, a timeout and cancellation, runs in a worker or a process, and returns
   its result as a message.
4. **Every step ends (liveness).** Timeout or manual cancellation make the condition false, with
   the reason recorded; the lock can never be held forever.
5. **No half state.** A crash during the step applies nothing (the mutator runs at the end). An
   intent journal lets the container tell each author their intent did not complete, or present it
   again.
6. **Progress is not state.** It is published outside the model (a separate observable), so it
   creates no step and no transition.
7. **The lock is per container.** Other containers keep running.

## Smaller items found on the way

- **A step-end signal.** Step reactions are started without the caller knowing when they are done
  (`src/lib/instance.ts:395-409`, `awaitAsync` is awaited inside the loop but nothing is returned to
  whoever presented the proposal). A promise or an event "step N finished, reactions included" is
  what an external queue needs today (e.g. to commit to git before the next intent).
- **A built-in intent queue.** Out of the box there is none: an intent presented while a step runs
  is either buffered (during NAP) or tagged with a stale step id. Every server use builds the same
  small queue; it could ship with the container.
- **Tell the author when a cancelable action is dropped.** `isCancelable` drops a proposal whose step
  id is stale (`src/lib/instance.ts:195-203`) and only reports it as a diagnostic. A callback or a
  rejected result would let a server answer "the state changed, try again".
- **Reconcile without rewriting whole lists.** The internal reconcile replaces arrays wholesale
  (2–2.5× the state size in patches on Jared's spike); a keyed reconcile would let observers emit
  minimal patches.
