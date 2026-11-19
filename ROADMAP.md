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
2. **Proposals presented meanwhile are queued, never dropped.** Done in 1.8 for the reactions (see
   "Done" below): the queue a long condition needs is the same one.
3. **A long condition is a supervised job, not a promise.** A promise survives nothing (restart,
   deploy), reports nothing and cannot be stopped. The job has an id, a state (queued, running,
   done, failed), progress, a timeout and cancellation, runs in a worker or a process, and returns
   its result as a message.
4. **Every step ends (liveness).** Timeout or manual cancellation make the condition false, with
   the reason recorded; the lock can never be held forever.
5. **No half state.** A crash during the step applies nothing (the mutator runs at the end). An
   intent journal lets the container tell each author their intent did not complete, or present it
   again. Since 1.8 a step can be taken back and each author is told (`attempt`); what is missing
   is the journal of the intents which were still waiting.
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

**What already bites today.** Two containers which hold the same node, in memory, do not know of
each other. Since 1.8 a container takes back every write made in its model during a step whose
write fails, whoever made it: container B, taking its step back, undoes what container A wrote in
the shared node meanwhile, and saved. A is left with a model behind its database and an attempt
which says `settled`. Nothing refuses it, the README only warns. Guarantee 3 above is the way out.

## Smaller items found on the way

- **Reconcile without rewriting whole lists.** The internal reconcile replaces arrays wholesale
  (2–2.5× the state size in patches on Jared's spike); a keyed reconcile would let observers emit
  minimal patches.
- **A restore which is taken back.** When the awaited reaction which follows a `restore` or a
  `reset` fails, the container stays on the given state: a jump is not a step and nothing of it is
  recorded. The recorder could record a jump as it records a step.
- **No half state when an acceptor throws.** A mutator which throws in the middle of a proposal
  leaves what the mutators before it wrote, and what it wrote itself: no step is taken, the model
  is changed all the same. The recorder holds what is needed to take it back, but only containers
  which have a reaction have a recorder.
- **No half step when a control state predicate throws.** The model is written and the step id has
  ticked, the control states are those of the step before and the reactions do not run.
- **A time limit on an awaited reaction.** One which never ends keeps the container closed for
  ever: what waits behind it waits, `restore` and `reset` are refused, and nothing cuts it. Two
  containers which each await an `attempt` on the other from an awaited reaction are the same
  case.
- **Measuring the queue.** Nothing tells how many proposals wait, nor for how long. It is what
  "Several containers on one graph" asks for before anything is cut.
- **A switch for the recorder** (postponed). Install the recorder only when a step reaction is
  awaited or declares that it reads the patches. Today any step reaction has the model listened
  to: at 200 000 nodes, creation 0.5 → 1.3 s and memory 219 → 367 MB against 1.7.0.
- **What a step still costs beyond what it changes** (`yarn measure`):
  - the first key a step removes from a `Map`, a `Set` or an object costs one pass over its keys,
    to give the key its place back should the step be taken back, and its return puts back behind
    it the keys which stood there: neither has a way to put a key in the middle;
  - a step which gives objects to a `Set` costs one pass over that set, once for all it was
    given: MobX reports the value a set was given, not the observable the set made of it. Until
    the step is over these members are not listened to: a mutator which adds one and writes in it
    right away has both told as one write;
  - reading the patches of a step which writes in a `Set` of objects, or gives it a member or
    takes one, costs the JSON of each of its members: a member is named by its JSON, and a patch
    has to know which names are taken (3 ms on a set of 1 000 objects);
  - reading the patches of a step which wrote in an item of a list costs one pass over that list,
    once per list, to find the index of the item; a step which writes in items and moves them in
    turns pays it each time;
  - the objects which have no proxy (the instances of a class, every object under
    `useProxies: "never"`) are gone through before each return and each reading of the patches,
    to count the fields they were given since: MobX tells nobody of those. A model of plain
    objects, the usual one, has none;
  - `MobX` itself moves the whole list at each `shift`.
- **A model which holds what MobX does not observe.** A `Date`, an object which is not observable
  (an instance of a class which is not, a plain object kept by reference), a field MobX was not
  told of (a class annotated in part, a field annotated `false` or born after the creation) or an
  object used as the key of a `Map`, observable or not, can be written in without anybody being
  told. As long as the model holds one, no step
  is taken back, the step stands and the attempt says `STEP_NOT_UNDONE`, and the patches of a
  step are not read: reading them throws. Nothing says so when the container is created. It is
  all or nothing where it could be finer: a `Date` has one value, which could be compared before
  and after the step; a field could be compared the same way when it holds no object.
- **What is out of reach.** A `#private` field, a field which is not enumerable, what a function
  carries on itself: a step which writes in one is said taken back, and the write stays. The
  README says so; nothing refuses it.
- **A `Map` which is put in another order.** `replace` is the one write MobX tells nobody of when
  the entries are the same. The recorder wraps `replace` on each `Map` of the model, once for a
  map however many containers hold it, as an own property of the map, to keep the order it had.
  `ObservableMap.prototype.replace.call(map, …)` goes around it, and a map which can not be given
  a property (`Object.preventExtensions`) makes the creation throw. Wrapping the method on the
  prototype of MobX's maps, once for all, would close both: it changes MobX for everybody in the
  page. A way to be told by MobX would be better.
- **A container lives as long as its nodes on an engine without `WeakRef`.** The nodes hold their
  recorder weakly. Where a node is shared by many containers which come and go, what is left of
  those which are gone is dropped at the next write in that node.
- **A listener which was there before the container, and writes in the node it listens to.** Its
  write is heard before the one it answers. The recorder sees it and refuses from then on: steps
  stand, patches are not read. The recorder is now asked before each write of every node, lists
  included, to cancel what somebody else writes while a step is taken back; hearing them in order
  would still need to match each write with what follows it.
- **A model nested more than a thousand levels deep.** Listening to a model goes down it by
  recursion, one more call per level than MobX itself: about 1 100 nested levels are taken where
  1.7 took 1 300 to 1 400 (node 22, default stack size). Beyond, creating the container throws
  `Maximum call stack size exceeded`.
- **The order of the fields of an object.** A field which is removed and comes back is put back at
  its place. MobX has a public way for a `Map` and a `Set` (`replace`), none for an object: the
  recorder defines the properties again on the object MobX keeps behind its proxy. It finds that
  object in MobX's administration (`$mobx`) by what it is, not by its name, which the production
  build changes. The suite runs on the development and the production build of MobX 6.15
  (`yarn test`, `yarn test:production`), and was run by hand on both builds of 6.6.0, the oldest
  the package accepts.
- **A field kept by reference which comes back.** A field annotated `observable.ref`, removed by a
  step which is then taken back, comes back as a plain observable field: what is assigned to it
  later is made observable.
- **A custom representation which hands over a list made from the model writes in the model.**
  Already so in 1.7 (`lib/derivate.ts`, the refresh of an array): with
  `setRepresentation(({ data }) => ({ visible: data.items.filter((item) => !item.hidden) }))`,
  the first representation holds the items of the model themselves, and the refresh after
  `hide(1)` writes the new list over them: the model `[1, 2, 3]` becomes `[2, 3, 3]`. In 1.8 these
  writes happen outside of any step: no patch tells them and no return takes them back. A
  transformation which copies what it shows is not concerned. To reproduce:
  ```js
  let model;
  const list = createContainer()
    .addAcceptor("hide", {
      mutator: (data, id) => { data.items.find((item) => item.id === id).hidden = true; },
    })
    .addActions({ hide: "hide" })
    .setRepresentation(({ data }) => ({ visible: data.items.filter((item) => !item.hidden) }))
    .addStepReaction({ do: ({ data }) => { model = data; } })
    .create({ items: [{ id: 1 }, { id: 2 }, { id: 3 }] });
  list.actions.hide(1);
  // model.items, the model itself, now holds the ids 2, 3, 3
  ```
- **The types of the actions, and of `attempt`.** At run time each case below works; TypeScript
  does not follow:
  - An action called `name` or `length` is typed on `attempt` as the action and as the text or the
    number every function has, both at once: `const s: string = container.attempt.name` compiles.
    Calling it is typed right. `attempt` could be typed as an object which can be called, without
    what a function has.
  - After two `addActions` on one factory, `ACTIONS` is a union of the two sets: neither
    `actions.x` nor `attempt.x` compiles, whichever set `x` is in. Already so in 1.7 for `actions`.
    The second set could be merged into the first.
  - A container made by `createContainerFromJSON` has no action typed, neither on `actions` nor on
    `attempt`: the registry knows the actions by name only. Already so in 1.7.
- **The refresh of a custom representation is not locked.** A representation made by
  `setRepresentation` is refreshed once the step is over, outside of any presentation. Whoever
  listens to it with `mobx.observe` and sends an action is told in the middle of the refresh: the
  step of that action is taken then, and the representation, half refreshed, stays one step
  behind the model until the next step (`hp` written, `log` not). An `autorun` or a `reaction` on
  it are told at the end of the refresh and are right. Already so in 1.7. Locking the refresh as a
  presentation is, or giving its listeners their turn once it is done, would close it.
- **The creation is not a step.** The reactions which run at creation do so while the container is
  open: what they propose is presented at once, and an awaited one keeps nothing waiting.
- **A one shot reaction which starts a step at creation runs twice.** It is disposed of once its
  run is over, and the step it starts at creation runs the reactions before that. As in 1.7.
- **Waking a container from a copy.** A container created from stored data and `initialStepId`
  computes its control states as a brand new one does. A control state which depends on the past
  is answered as if nothing came before: a hero dead for long wakes up `JUST_DIED`.
- **The patches, where FS-001 is not written yet** (`specs/FS-001-json-patch-generation-interview.md`
  on `feat/json-patch`, sections 3 to 7):
  - `move`, `copy` and `test` are neither written nor applied. A sort is one `replace` of the
    array; a `move` per item would be smaller on a long list.
  - A patch is applied to a JSON copy only. Applying it to a live model (a `Map` and a `Set` are
    not objects there) is what a client which mirrors a container needs.
  - Two keys of a `Map` which read the same (`1` and `"1"`) are one in a JSON copy. The patches
    of a step which writes such an entry, or under it, or which gives the map another order, are
    refused: reading them throws. `jsonCopy` keeps the last of two twins, and names an object key
    by its JSON, without a word.
  - A `restore` hands its reactions the delta of the step it goes back to, and with it patches
    which are not what the restore did to the model (the README says what they are). A journal
    has to start again from a JSON copy after a jump: a restore could tell its own patches.
  - A model which holds a cycle has a JSON copy (`"[Circular]"` where it comes back) but its
    patches only tell the paths which do not go through the cycle. A member of a `Set` which holds
    the set is named from the member in a patch, from the root in the copy: the two differ, and the
    replay throws.
  - The patches of a step are read while its reactions run; later, reading them throws. Keeping
    them would mean writing them at each step, read or not.
  - Plain objects are not a source: the recorder only listens to MobX.

## Done

- **One name for each thing** (1.8). `representation`, `restore`, `attempt.stepId`, `Container`,
  `addControlState`, `setRepresentation`, `setStaticRepresentation`, `awaited`,
  `ContainerFactory`, `ReasonCode`, `ControlStatePredicate`, `ActionDeclarations`,
  `ActionDeclaration`, `ActionOptions`; the generic parameters `MODEL`, `MUTATIONS`,
  `CONTROL_STATES`. Each old name is kept, marked `@deprecated` (the README lists them), and the
  declarations keep their doc comments so that an editor shows it.

- **A built-in intent queue** (1.8). A proposal presented while a step runs waits for its turn and
  gets a step of its own, in arrival order, behind what the reactions of the step propose. It
  replaces the buffer which merged everything in one proposal.
- **A step is locked while its proposal is presented** (1.8). An action sent by a condition, a
  mutator, a control state predicate or whoever listens to the model meanwhile is discarded with
  `STEP_LOCKED`: in 1.7 it was presented inside the presentation, and its step taken in the middle
  of the first. The same while a `restore` (then `rollback`) or a `reset` puts its state in the
  model, and while a step is taken back; the reactions which replay the jump are not locked.
- **A step-end signal** (1.8). `attempt.<action>(…)`, on the container `create()` returns,
  resolves with the attempt of one proposal once nothing can change it anymore: the reactions of
  its step ran, and the steps they started.
- **Tell the author when a cancelable action is dropped** (1.8). Same `attempt`: a stale proposal
  resolves `discarded`, with `STALE_PROPOSAL`.
- **A step whose awaited reaction fails is taken back** (1.8), from what each write recorded,
  without a copy of the model. What waited behind it is refused with `PRECEDING_STEP_UNDONE`.
- **The patches of a step** (1.8). `delta.patches` and `delta.inversePatches`, RFC 6902, one patch
  per write in the model, from the same recorder as the return. `jsonCopy` and `applyPatch` read
  them.
