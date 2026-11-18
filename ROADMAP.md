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

## Several containers on one graph

**Origin.** Jared's lineage module (November 2026) holds a client's whole dependency graph in one
container: values, results, and "depends on" edges, with each step persisted by an awaited
reaction. A container takes one step at a time, the write included, so every author of that client
waits in the same queue. Scaling out means several containers working on the same graph in the
database.

**What we do meanwhile.** One container per graph, and the queue is measured before anything is
cut.

**What does not help.** Several containers each holding the whole graph and each accepting writes.
The database still has to put the writes in one order; the loser's write fails and its step is
undone. That buys failover, not throughput.

**What Ravioli could offer instead.** Composition, in the manner of React components: each
container manages one part of a larger graph. A parent holds what is shared (reference values: few
writes, many readers), children hold what depends on it. Dependencies go one way, parent to child.
A step accepted by the parent reaches each child as a fact the child does not refuse, and the
child's own acceptors work out the consequences in its part. A child which wants the parent to
change presents a proposal to the parent, whose acceptors decide. Earlier attempts live on the
branches `feat/add-child` (2022) and `next` (2025).

What it must guarantee:

1. **The model does not know who manipulates it.** Nothing in the data says which container holds
   which part: no owner on a node, no container id in the model. The cut belongs to the containers,
   so the same graph can be cut another way later, or not at all.
2. **A step stays atomic inside a container; nothing is atomic across two.** A consequence crosses
   from parent to child late. Whatever must be exact at a given moment is checked against the
   parent at that moment, by fingerprint: a child keeps the fingerprint of each upstream value it
   used.
3. **A dependency across parts is an address and a fingerprint**, never a reference in memory.
4. **One writer per part.** A write names the step it expects to follow and the database refuses
   any other, so two containers can never both write the same part.
5. **A child receives the parent's steps in the parent's order**, none lost and none twice, across
   a restart of either.
6. **A sleeping child costs nothing.** What the parent accepted meanwhile waits for it and is
   applied when it wakes.

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
