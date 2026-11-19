# Ravioli
## Stop doing spaghetti code.

Ravioli are modular spaghetti bolognese. Also, it does not spread when you are hurry.

# TLDR;

## Installation

`$npm install --save mobx @warfog/ravioli`

Bon appétit.

## Monorepo Structure

This repository is organized as a Yarn workspace:

```
ravioli/
├── packages/
│   └── ravioli/          # Core @warfog/ravioli package
├── exemples/             # Example projects (outside workspace)
│   ├── example-rpg/
│   ├── example-json-config/
│   ├── counter-client-server/
│   ├── counter-graphql/
│   └── counter-request-scoped/
└── doc/                  # Documentation (outside workspace)
```

## Development

```bash
# Install dependencies
yarn install

# Build the package
yarn build

# Run tests
yarn test

# Run them against MobX's production build
yarn test:production

# Run them and fail under 100 % coverage
yarn test:coverage

# Measure what a step costs on a large model (after a build)
yarn measure

# Watch mode for development
yarn build:watch
```

## Basic exemple: 

```ts
const user = createContainer<{ name: string }>()
    // How the model is mutated
    .addAcceptor("setName", {
        mutator(data, { name }: { name: string }) {
            data.name = name;
        },
    })
    // Map an action will be trigger the mutation (with the same argument)
    .addActions({ rename: "setName" })
    // Create a container
    .create({ name: "Fraktos" });

// You can use it with MobX
autorun(() => console.log(user.representation.name))

// Trigger a "rename" action
user.actions.rename({ name: "Fraktar" });
// Will log:
// Fraktos
// Fraktar
```

# API

API documentation is auto generated and available in a [separate doc](https://github.com/dagatsoin/ravioli/tree/master/doc)

## Renamed in 1.8

The old names still work: each one is marked `@deprecated` and does what the new one does.

| Before 1.8 | Since 1.8 |
|---|---|
| `container.representationRef.current` | `container.representation` |
| `container.rollback(step)` | `container.restore(step)` |
| `container.reset(state)` | `container.reset(data)` (the parameter only) |
| `attempt.attemptedAt` | `attempt.stepId` (both are written) |
| `IInstance` and `IAttempt` | `Container` |
| `addControlStatePredicate` | `addControlState` |
| `addTransformation` | `setRepresentation` |
| `addStaticTransformation` | `setStaticRepresentation` |
| `awaitAsync` (step reaction) | `awaited` |
| `IContainerFactory` | `ContainerFactory` |
| `RejectionCode` | `ReasonCode` |
| `CSPredicate` | `ControlStatePredicate` |
| `PackagedActions`, `ActionPackage`, `ConfigurableAction` | `ActionDeclarations`, `ActionDeclaration`, `ActionOptions` |

`StepContext`, `ActionIntent`, `RepresentationPredicate`, `MapToProposal` and `ToUnion` are marked `@deprecated` with no replacement: nothing uses them. The generic parameters are named `MODEL`, `MUTATIONS` and `CONTROL_STATES` everywhere.

# Examples

All examples use the local distribution build. Build the main package first from the root:

```bash
yarn build
```

Then run the examples:

- [example-rpg](./exemples/example-rpg) - RPG game example with turn-based combat
  ```bash
  cd exemples/example-rpg && npm start
  ```

- [example-json-config](./exemples/example-json-config) - JSON-based container configuration example
  ```bash
  cd exemples/example-json-config && npm start
  ```

- [counter-request-scoped](./exemples/counter-request-scoped) - Request-scoped container with NAP persistence and stepId hydration
  ```bash
  cd exemples/counter-request-scoped && npm run dev
  ```

**Note**: Examples are outside the workspace and use the compiled output from `packages/ravioli/dist/`.

# Deep dive

## What problems does Ravioli solve?

- Model code spreading all over UI code.
- Unclear limits on what is private and what is public.
- Answer the question: Where do I put this code?

**The goal of Ravioli is to code quick but not dirty.**

Ravioli is an attempt for small teams or junior developer to organize their ideas to achieve great things like a todo list or a MMORPG.

Ravioli implements the [SAM pattern](https://sam.js.org/), which helps you to cut down your software development by enforcing a temporal logic mindset and a strong separation of concern between business level and functional level.

All along your development with Ravioli, you will handle your issues with a bunch of good practices:
- separate functional from business code
- think you app as a state machine (finite or not)
- write small, atomic, pure and focused business functions
- write abstract and meaningful actions for your user

> "Ravioli makes the world a better place by providing a reactive and declarative framework with the simplicity of a mutable world backed by the security of an immutable plumbing" *An anonymous antousiast coming from the futur*

## Is ravioli for you?
- :heavy_check_mark: you are a junior dev looking for a great developement experience
- :heavy_check_mark: you have to develop a temporal logic app (tabletop game, form with steps, health data app, ...)
- :heavy_check_mark: you are lead dev who is looking for a simple solution to onboard junior dev on project with Separation of Concern in mind.

## A Ravioli step cycle

SAM and Ravioli are based on temporal logic. Each action starts a new step, like a tick for a clock. Here how it works:

      ____________________________________________
      |                                            |             ^  ^  ^  ^            
      |        ___________Model___________         |             |  |  |  |            
      v       |            Data           |        v               Notify             next
    Action -> |         Acceptor(s)       | -> Compute next --->   changes  ----->   action
      ^       |___________________________|      State          to observers        predicate  
      |                                                                                 |    
      |_________________________________________________________________________________|    

1. First something/someone triggers an action from the view.
2. The action composes a proposal and presents it to the model.
3. The model's acceptors accept/reject each part of the proposal and do the appropriate mutations.
4. If the model is changed a new representation of the model is created.
5. All observers of this container will react to the new representation. (eg. UI is updated)
5. This new representation may need to trigger some automatic actions. If so, each automatic action will lead to a new step (if some changes are made).

# The main difference with other lib/framework are:

## A clear Separation Of Concern between Model and View.

View and Model isolation. The view (as the compiled representation of the model) has no read/write access to the model. This clear isolation makes the component like a black box which the user interacts with through some actions.

- At the core of component, there is the model. Aka some data and some mutation rules. This data and mutations are completely private and are not usable from the View. This is where you will define the internal stats of a player, a todolist, etc.

- What you see, as an observer of a container, is called the Representation. It could be anything, a JSON, some HTML, a 3D model etc. It is how the container wants to be seen from the exterior. It allows your code and semantic to be totally agnostic about how the representation will be consumed.

- The View is what the final user perceives of the container. It is out of the scope of a Ravioli component. It is like a piece of Art, depending of the observer, you won't see the same thing. For example, a battle field could be represented as a JSON and the View could be a First Person Shooter or a Real Time Strategy game.

## Each component has its own state machine (either finite or not) 
This allows only certains actions when the component is in specific state.

For example: Player can be Alive or Dead and its actions can be mapped as:

- Alive: hit, move
- Dead: revive, spawn in cimetery

Those states being isolated, there is no chance that a Dead Player shots an Alive Player.

## Ravioli is based on temporal logic.
Each component has its own logic clock. Each step is like the tick of a clock. A step starts with the trigger of an action and ends with a new representation.
From the exterior of a component you have access to the tick with `stepId` which is an incrementing `integer`.

## Actions are not mutations.

Ravioli actions are like in real life: an attempt to change the state of something without any guarantee of success.

In such, an action does not mutate the model but presents a proposal which the model will accept/reject in part or whole.

```ts
function hit() {
  return [{
    type: UPDATE_STAT
    payload: {
      field: "hp",
      amount: -3
    }
  }]
}
```
An action is some high level functional code which uses some low level business code.

Actions is like a client which uses a public API. The API is the available mutations, an atomic set of command publicly accessible, for example `SET_HP` and `DROP_ITEM` which can be composed together in a more functional `drinkHealthPotion`.

```ts
function drinkHealthPotion(itemId: number) {
  return [{
    type: DROP_ITEM,
    payload: { itemId }
  }, {
    type: UPDATE_STAT
    payload: {
      field: "hp",
      amount: 10
    }
  }]
}
```

# Ravioli parts

## Model
The model contains the business data and methods and lives in a private scope. The external world has no read access to it.

### Data

The model data must me serializable.

```json
{
  name: "Fraktar",
  health: 1,
  inventory: [{
    id: 0,
    quantity: 1
  }],
  isConnected: false
}
```

### Acceptors

The acceptors is the imperatvie code which mutate the data.

An acceptor has two roles:
1. Accept or reject a proposal mutation (with a validator)
2. Do the mutation (with a mutator)

#### Condition
The role of the condition is to status is a mutation is acceptable or not. It is a simple pure function which takes the model and the payload and returns a `boolean`.

```ts
// Rules for health points mutations.
const checkHP = (data => payload => (
  data.health > 0 && // the player is alive
  payload.hp < MAX_POINT // the health points is legit
)
```

If the mutation passes the condition, it will be marked as accepted and passed down to the mutator.

#### Mutator
This is where the mutation happens. A mutator is a simple *unpure* function. It returns nothing and mutates the model data.

```ts
const setHpMutator = data => payload => (
  data.health += payload.hp
) 
```

## Control State

This notion directly comes for the State Machine pattern. A Control State is a stable state your app can reach.

For example a Todo of a todo list can be Complete or UnComplete.
A character of a video game can be Alive, Dead or Fighting.

Also, SAM and Ravioli do not enforce the concept of a FINITE state machine. You can have multiple control states in a row. Eg a app state can be `['STARTED', 'RUNNING_ONLINE', 'FETCHING']`

A control state predicate is a pure function of the model.
```ts
const isAlive = data => data.health > 0
```
It is declared with `addControlState`, and given the data, the accepted mutations and the previous control states:
```ts
createContainer<{ health: number }>()
  .addControlState('ALIVE', ({ data }) => data.health > 0)
```
The component state exposes the current control states of the model in an array. `myApp.state.controlStates // ['STARTED', 'RUNNING_ONLINE', 'FETCHING']`

## Action
An action is a high level interface for the external world of a component. It is the only way to interact with the model.

Its role is to abstract the low level API of the model by composing mutations in a declarative way.

Keep in mind that an action is just a fire and forget interface and does not guarantee a result.

**An action is decoupled from the model** and does not know its actual state neither its internal shape or methods. It only barely knows how to form a proposal which maybe will be accepted in part or in whole or will be rejected by the model.

An action is a pure function which must return a proposal. Important notes the the returned value is just used internaly and the action caller just gets `undefined`


```ts
function hit() {
  return [{
    type: REMOVE_HP
    payload: { hp: 3 }
  }]
}

function drinkHealthPotion() {
  return [{
    type: REMOVE_IEM_FROM_INVENTORY
    payload: { itemId: "healPotion" }
  }, {
    type: ADD_HP
    payload: { hp: 3 }
  }]
}
```

### Chained actions
Actions can be chained as you will chained any code instructions, no need for plugins to make a saga. For example:

```js
player.actions.shotGun()
await player.actions.rocketShot()
player.actions.shotGun()
```
The three shot will be done in order, waiting for the rocket to reach its target.

>### Action are "fire and forget".
>
>This concept is important and reflects the real life. You are never sure that your action will lead to the expected result. There is always a little chance to fail, something unknown or something you have not anticipated.
>
>Think about hiting a kobold in a table top game. Your action is to hit. But the success depends on the rolling dice and maybe on internal state (secret buff) which will cancel your attempt.
>
>You want to be rich? Your only possible (async) action is to work, but here too, the success will depends of a billion of factors.

## Proposal

As seen in the example above, a proposal is an array of declarative mutations that the action wants to perform on the model.
Note even that the proposal has a specific shape, its content does not need to be valid to be presented to the model. Only the model will decide it is valid or not.

```ts
[{ 
  type: "ADD_TODO", // Well defined mutation
  payload: {
    text: "stop coding bugs",
    checked: false
  }
}, {
  type: "CLEVER_XSS", // Will be reject
  payload: {
    injectedScript: "alert('trololo')"
  }
}]
```
## Automatic action
An automatic action can be triggered after a step if its condition is fulfilled. It is a useful feature to implements side effect, turn
by turn game logic, or basic AI. For exemple:
- after a Player is hit, heal it for 2 health points
- after each battle, persist the world state
- after each action, log what happened

```ts
.addStepReaction({
  debugName: "auto heal",
  when: (args) => args.data.hp < 2,
  do: ({ actions }) => actions.heal(),
})
```

### Async Step Reactions with `awaited`

When step reactions perform async operations (like database persistence), they can complete out of order if latency varies. Use `awaited: true` to ensure async operations complete sequentially:

```ts
.addStepReaction({
  debugName: 'persist',
  awaited: true,  // Wait for this reaction before allowing next step
  runOnInit: false,
  do: async ({ data }) => {
    await repository.save(data.id, data.count);
  },
})
```

**How it works:**
- With `awaited: true`, the library awaits the `do()` promise before proceeding
- Actions called during an async NAP wait in a queue and are processed after completion
- Each action is still processed in its own step (stepId increments for each), in the order it was called
- What the reactions of the step propose goes first, composed in one step, then the actions which waited
- An action which waited is checked again when its turn comes: if it is not allowed anymore, it is discarded as `UNAUTHORIZED`
- Saves complete in order: step 1 finishes before step 2 starts
- `restore` and `reset` are refused while the container is busy with a step: while its reactions run, and while the queue is being emptied

**Without `awaited` (race condition):**
```
Action 1 → save(1) starts [SLOW: 1000ms]
Action 2 → save(2) starts [FAST: 5ms]
save(2) completes → DB=2 ✓
save(1) completes → DB=1 ✗ OVERWRITES!
```

**With `awaited: true` (sequential):**
```
Action 1 → save(1) starts, Action 2 and Action 3 WAIT
save(1) completes → DB=1 ✓
Action 2 processed → save(2) starts
save(2) completes → DB=2 ✓
Action 3 processed → save(3) starts
save(3) completes → DB=3 ✓
```

A cancelable action is the exception. It is accepted only if nothing happened since it was called: a step, a step which was taken back, a restore or a reset cancels it, in the queue as anywhere else.

#### Who presents a proposal

In SAM a proposal is presented between two steps, by the view or by a step reaction (the next-action predicate). While one is presented the step is **locked**, from the first `condition` to the last control state predicate: nothing else is presented.

- A `condition`, a `mutator` or a control state predicate does not send an action. Neither does whoever listens to the model with `observe` or `intercept` and is told during the presentation
- What they send is discarded with the reason `STEP_LOCKED`, through an action, `compose` or `attempt`, cancelable or not: none of its acceptors runs, it takes no step, it does not wait in the queue
- `attempt` resolves `discarded` with that reason. `lastAttempt` holds it for an instant only: the proposal which is being presented writes its own outcome right after, once its control states are computed too. So does a step which is taken back, or which stands because it can not be. It stays when that presentation throws
- A cancelable action is therefore presented against the very state it was checked in: no step can be taken between that check and its mutators
- 1.7.0 let a presentation run inside another: the second step was taken in the middle of the first. 1.8 refuses it
- The container is locked the same way while a `restore` or a `reset` puts its state in the model: what is sent then, by whoever listens to the model with `observe` or `intercept` or by a control state predicate, is discarded with `STEP_LOCKED`, and a cancelable action can not slip in around the jump. The step reactions which replay the jump are not locked: they are next actions and propose as usual. An `autorun` which acts once the state is in goes after them
- And while a step is taken back because its save failed: what is sent by whoever listens to the model or to the control states as they come back is discarded with `STEP_LOCKED`, `"A step is being taken back."`. An `autorun` which acts once the model is back is not: what it sends is presented once the step is over
- A proposal which arrives after `present` but before the step reactions of the step, from an `autorun` or a `reaction` on the representation for example, is not refused: it is presented after the next-action predicates of that step. The NAP always goes before any other action. In 1.7.0 it was taken at once, ahead of them
- An action built on a representation which is no longer the right one when it is presented is judged by the acceptors against the current model. If it must not be, it declares itself `isCancelable`
- Calling an action is not reading. An `autorun` which calls one depends on what it reads itself, not on the step id nor on the control states the call reads. One which reads again the data its own action changes runs again each time, as any `autorun` which writes what it reads. The same for `restore` and `reset`: an `autorun` which calls one does not depend on what the step reactions which replay it read

#### What an observer sees meanwhile

- **With a transformation which copies what it shows** (`({ data }) => ({ count: data.todos.length, titles: data.todos.map(({ title }) => title) })`), the representation follows the model once the step is over: its reactions are done, the awaited ones included, and so are the steps they started. It never shows a step which is still being saved, whoever proposed it, nor a step which is then taken back
- A transformation which hands over a node of the model (`({ data }) => ({ todos: data.todos })`) shows that node as it is, at once: the node is the model, not a copy of it
- **Without a transformation**, the representation is the model itself. An observer sees a step as soon as the model accepted it, before its save, and sees it go away if the save fails. Give the container a transformation when the view must only show what is saved
- `stepId`, `controlStates` and `lastAttempt` are those of the model, in both cases: they move as soon as the step is accepted

#### When the save fails

If an `awaited` reaction rejects, or throws, the step is **taken back**: the model, the `stepId` and the control states are again what they were before the step. The model is never left ahead of a save which did not happen.

```
Action 1 → save(1) starts, Action 2 WAITS
save(1) fails → step 1 is undone, DB and model agree again
Action 2 is refused: it waited behind a step which did not happen
```

- `lastAttempt` tells it: the attempt is still `accepted`, with `settled: false`, the `reason` and `undone: true`
- The actions which waited behind it are discarded with the reason `PRECEDING_STEP_UNDONE`. One sent during the return, by whoever listens to the model, is discarded with `STEP_LOCKED`. An action called after the return is processed as usual
- Going back does not copy the model. Each write leaves what is needed to undo it, so a step and its return cost what the step changes. With one exception: a key removed from a `Map`, a `Set` or an object costs one pass over its keys, whose order is kept, and its return puts the keys which stood behind it back behind it. `yarn measure` gives the figures
- What comes back is the very node which was removed, not a copy, at the place it had: its observers are still attached
- A `once` reaction which ran in the step gets its run back

It is all or nothing. When the step can not be taken back whole, it stands whole: the attempt has `settled: false` and the reason `STEP_NOT_UNDONE`, never `undone: true`, and the actions which waited take their turn. It happens when:
- the model holds something MobX does not observe. MobX does not tell what is written in it, so as long as the model holds one, no step is taken back:
  - a `Date`: keep a date as a text or a number
  - an object which is not observable: an instance of a class which is not, a plain object kept by reference (`observable.ref`, `{ deep: false }`)
  - a field MobX was not told of: a class which annotates only some of its fields (`makeObservable(this, { hp: observable })` with a plain field beside), a field annotated `false`, a field which the constructor of a `makeAutoObservable` class leaves without a value, a field given by assignment to an object which has no proxy (`configure({ useProxies: 'never' })`), a field given by `Object.defineProperty` to any observable object. What an object can do, a function, is not counted
  - an object used as the key of a `Map`, observable or not: a map keeps its keys as they are given, and does not hold them
- something refuses the way back: an interceptor (`intercept`) which cancels a write, or throws, on the model or on `controlStates`
- somebody who listened to a node (`observe`) before the container was created writes in that node when it is told of a write. The container then hears the second write before the first: it says so, and from then on no step is taken back
- somebody writes in the model while the step is taken back: a listener (`observe`) which answers a write in the model by another one, in a log, a counter or a flag of the model, before or after the container was created. Taken back, the model would hold what the listener wrote of a step which never was. That write is cancelled, and so are those it makes while the step is put back. What a listener writes outside of the model is not the container's business

The reason names the first thing in cause and where it is, as a JSON pointer: `the model holds a Date at /createdAt, which MobX does not observe…`. A member of a `Set` has no place of its own in a pointer, it is written `*`.

A container takes back every write made in its model during the step, whoever made it. **Two containers must not hold the same node**: the return of one would undo what the other wrote in it meanwhile, and saved.

**What is out of reach.** Nothing can tell these are there, nor that they were written: a step which writes in one is said taken back, `undone: true`, and the write stays. Do not keep there what a step changes.
- a `#private` field of a class
- a field which is not enumerable (`Object.defineProperty(hero, 'hits', { enumerable: false, … })`)
- what a function kept in the model carries on itself (`hero.onHit.calls++`)
- the order of a `Map` which is replaced through the method every map inherits, `ObservableMap.prototype.replace.call(map, …)`, and not through its own `map.replace(…)`

**A container nobody holds is collected**, with its model, even when one of its nodes lives on: a `Map` of reference data which several containers are given in turn, a node a program kept after it left the model. It needs an engine which has `WeakRef`; on another one, a container lives as long as its nodes.

What it does not do:
- **A reaction which already ran is not undone.** If a mail left before the save failed, it left
- **A save which succeeded is not undone either.** With two `awaited` reactions, if the save succeeds and the next one fails, the model goes back and the save stays. The reaction which persists the step must be the last `awaited` one, or the only one
- A reaction which is not `awaited` and throws does not undo the step: the step stands, `settled` is false, its consequences did not happen
- A `restore` or a `reset` is not a step: it is not taken back when the save which follows it fails
- An `awaited` reaction which never ends keeps the container closed: there is no time limit

#### Knowing what became of an action

An action returns nothing, and `lastAttempt` only holds the last attempt, whoever made it. When several actions wait, ask for the outcome of yours with `attempt`:

```ts
const attempt = await counter.attempt.increment();

if (attempt.status === 'accepted' && attempt.settled) {
  // The step is done, saved, and so are the steps its reactions started
}
if (attempt.status === 'accepted' && attempt.undone) {
  // The save failed, the step was taken back: attempt.reason says why
}
if (attempt.status === 'discarded') {
  // Never presented: not allowed, stale (the state changed, try again),
  // or waiting behind a step which was undone. See attempt.reason.code
}
if (attempt.status === 'rejected') {
  // The model refused it: attempt.rejected holds a reason per mutation
}
```

- `attempt` holds the same actions as `actions`, with the same arguments: `counter.attempt.increment()` where `counter.actions.increment()` returns nothing. Whatever an action is called, `name`, `call` or `prototype` included. Or give it a composer, as `compose` takes: `counter.attempt(({ increment }) => [increment(), increment()])`
- Save an action called `then`: on `attempt` it would make the function look like a promise, and an `async` function which hands `attempt` back would call the action and never resolve. It is not there, attempt it through a composer: `counter.attempt(({ then }) => [then()])`. It is on `actions` as it was in 1.7
- The promise resolves once nothing can change the attempt anymore: at once for a refusal, after the reactions of the step for an accepted one
- You are told of your own step only. The failure of a reaction of another step is not yours
- A refusal is an outcome, the promise does not reject for it. It rejects when the action, an acceptor or a control state predicate throws
- The actions themselves stay fire and forget and still return nothing
- `attempt` is on the container `create()` returns, a `Container`. An object written by hand as an `IInstance`, the type of 1.8 and before, does not need it
- Work which must be done before the next step belongs in an `awaited` reaction: when the outcome reaches you, the container may already be at the next action of the queue
- Do not `await` it inside an `awaited` reaction of the same container: the step would wait for an attempt which waits for the step. Two containers which each await an attempt on the other from an `awaited` reaction wait for ever the same way, and nothing cuts it
- A reaction which keeps a chain of steps going without ever letting it end is cut after 50 steps in a row. What it proposed through `attempt` is discarded as `REACTIONS_DID_NOT_SETTLE`. Through its `actions`, the last step stays `accepted`, with `settled: false` and that reason
- A reaction which proposes later, after a timer for example, starts a new chain each time: a countdown or a poll is not cut

### The patches of a step

A step reaction receives what the step did to the model data, as JSON patches ([RFC 6902](https://datatracker.ietf.org/doc/html/rfc6902)). No need to save the whole model at each step, nor to work out what changed:

```ts
.addStepReaction({
  debugName: 'journal',
  awaited: true,
  runOnInit: false,
  do: async ({ delta }) => {
    await journal.write({
      at: new Date().toISOString(),
      patches: delta.patches,
    });
  },
})
```

```ts
// data.inventory.splice(1, 2, 'axe') gives one patch:
[
  { op: 'remove', path: '/inventory/1' },
  { op: 'remove', path: '/inventory/1' },
  { op: 'add', path: '/inventory/1', value: 'axe' },
]
```

- `delta.patches`: one patch per write in the model, in order. A mutator which writes three fields gives three patches, a splice is one write. A patch is an array of operations, and only `add`, `remove` and `replace` are written
- `delta.inversePatches`: what undoes the step, last write first
- A patch holds copies, not live references: it can be stored as it is
- They tell the model data only. The `stepId` and the control states are in the delta, where they were
- They are written from the record the step is undone from when the save fails
- They are written when they are first read: a step whose patches nobody reads copies nothing, and a container without any reaction is not even listened to
- They are not listed in the delta: `JSON.stringify(delta)`, `{ ...delta }` and a comparison of two deltas see the delta as it was in 1.7. Read them by name
- The delta a step reaction is given is a `StepDelta`: the `Delta` of 1.7, which the `Step` given to `restore` still holds, plus `patches` and `inversePatches`. A test which calls the `do` of a reaction with a delta built by hand gives it `patches: []` and `inversePatches: []`
- A 1.7 program which writes its own `delta.patches` for the reaction which follows still can: what it wrote is what is read from then on, and it is listed in the delta as any field it adds
- **Read them while the reactions of the step run.** An `awaited` reaction can read them after it waited. A reaction which is not awaited reads them before it waits on anything: once the step is over the model has moved on, and patches nobody read until then can not be written anymore. Reading them then throws. Those which were read stay what they are
- **They are not read while the model holds something MobX does not observe**: a `Date`, an object which is not observable, a field MobX was not told of, an object used as the key of a `Map` (the list given for a save which fails, above). A write in it would be missing from the journal and nothing would say so: reading the patches of a step throws instead, as long as the model holds one. The error names the first one and where it is, as the reason of a step which stands does. The same when a listener which was there before the container made it hear two writes in the wrong order
- **A `restore` is not a step, and its patches are not what it did to the model.** Its reactions are given the delta of the step it goes back to. When the history kept the very delta a reaction was given, its patches are those of that step, if they were read then; reading them throws if nobody did. A copy of the delta (`{ ...delta }`, a JSON copy) has none: `[]`. Either way a journal which appends them does not replay to the model: after a `restore` or a `reset`, start the journal again from `jsonCopy(data)`

**Replaying a journal:**

```ts
import { applyPatch, jsonCopy } from '@warfog/ravioli';

// The first entry of the journal: a JSON copy of the data
const first = jsonCopy(data);

// Later, anywhere: the patches of each step, in order
const now = entries.reduce(
  (copy, entry) => entry.patches.reduce(applyPatch, copy),
  first
);
```

`jsonCopy` and the patches follow the same conventions, as JSON has no `Map` nor `Set`:
- a `Map` is an object, a key is a segment of the path: `/quests/dragon`. Two keys which read the same, `1` and `"1"`, are one key there, and no patch can tell them apart: reading the patches of a step which writes one of them, or under one of them, or which gives such a map another order (`replace`), throws. So does telling such a map as it was once it left the model and lost or was given a key there. Keep the keys of a map texts
- a `Set` is an object too, `{ member: true }`: adding a member is `{ op: 'add', path: '/effects/poisoned', value: true }`
- a member which is an object is named by its JSON, keys sorted. Nothing is under a key, so a write inside such a member removes the key it had and adds the one it has now. A step which adds such a member and writes in it right away tells it once, as it ends up
- a `Date` is its ISO text in a JSON copy
- where the model comes back to itself, a JSON copy writes `"[Circular]"`. The patches of a model which holds a cycle are not promised: a member of a `Set` which holds that set is named otherwise in a patch than in the copy, and replaying the patch throws. Keep cycles out of what is journaled
- `undefined` and functions are not written: a field which becomes `undefined` is removed
- a field named by a symbol is not written

`applyPatch` changes the copy it is given and returns it. It refuses a path which leads nowhere rather than leaving a copy which is no longer the model.

### Hydrating Containers with `initialStepId`

When creating containers for server-side usage (e.g., per-request containers), you can preserve temporal logic across requests by hydrating the `stepId` from your database:

```ts
// Load state from database
const savedState = await repository.findById(counterId);

// Create container with hydrated data AND stepId
const container = factory.create(
  { id: counterId, count: savedState?.count ?? 0 },
  { initialStepId: savedState?.stepId ?? 0 }  // Hydrate step number!
);

// Container continues from where it left off
console.log(container.stepId);  // e.g., 42 (from database)
```

**Why use `initialStepId`?**

Without `initialStepId`, you'd need singleton containers to preserve temporal logic:
- Singleton containers live for server lifetime (complex lifecycle management)
- Memory usage grows with active tenants
- Server restarts reset all step counts

With `initialStepId`, you can use request-scoped containers:
- Fresh container per request (simpler, no lifecycle management)
- No memory growth - containers are garbage collected after request
- Server restarts don't affect temporal logic (stepId hydrated from DB)
- Combine with `awaited` to persist stepId with each action

**Example: Request-scoped server pattern:**

```ts
// Repository saves both count AND stepId
async function save(id: string, count: number, stepId: number) {
  await db.upsert({ id, count, stepId });
}

// Each request creates fresh container, hydrated from DB
async function handleRequest(counterId: string) {
  const record = await repository.findById(counterId);

  const counter = createCounter(
    counterId,
    record?.count ?? 0,
    record?.stepId ?? 0,  // Hydrate stepId
    save
  );

  // Use container for this request
  counter.actions.increment();
  // NAP persists count AND stepId to DB

  return counter.representation;
}
```

See the [counter-request-scoped](./exemples/counter-request-scoped) example for a complete implementation.

## Representation
It is how the world sees your component.

As it is stated above, the model is isolated. The Representation is NOT the model, but its public interface.

The Representation is what the model allows us to see from it and what actions it allows us to perform on it.
It is a thin layer which separates the Model from the exterior. The representation is derived from the model and has no influence on it. It is a thin layer around the model which hides, transforms or leaves visible some of the model parts.

The Representation is composed of:
- all the available actions for the current step
- the current control states of the component
- an observable computed derivation of the model data

### It is a function of the model

In the computer science domain, the notion of Representation and View can be expressed as pure functions of each other.

`Rep = f(Model) and View = f(Rep)`

These two functions show that the view and the model are totally decoupled:
- the model holds the rules and the data, unknown from the exterior
- the representation is the public state of the model at a given time
- the view is a pure function of the representation

This idea is powerful when applied to software architecture. You can easily swap different representations and/or views and yet, you will interact with the same model.

For example, the model can be represented as a 2D array and rendered (viewed) as a pixel-art 2D tile map. The same model can be represented as a data tree and used in a 3D engine or in a data visualization tool.

A simpler example:
```ts
// A object ready to send back on the client or inject in the UI.
const transformerJSON = ({data}) => {({ name: data.name, loot: data.inventory })}

// Or directly some html markup
const transformerHTML = ({data}) => `
  <h2>Player inventory:</h2>
  ${
    data.inventory.length
      ? `
    <ul>
      ${data.inventory.map(({ id }) => `<li>${id}</li>`).join("")}
    </ul>
    `
      : "empty :("
  }
  `;
```

A container is given its representation with `setRepresentation`. It is derived again after each step, and read as `container.representation`:
```ts
const player = createContainer<{ name: string, inventory: { id: string }[] }>()
  .setRepresentation(({ data }) => ({ name: data.name, loot: data.inventory }))
  .create({ name: "Fraktar", inventory: [] });

player.representation.loot // []
```

### Static representation
Representation is computed at each step. It could be expensive in some case. Plus, transformation does not support function as a result.

Use case:
you want to abstract the model with a bunch of React hooks. For example your model has a `healthPoint` field and you want to expose a hook
like `useHP()`.

Here is how to solve this:

```ts
const container = createContainer<{ hp: number }>()
  .addAcceptor("setHealth", { mutator: (data, hp: number) => data.hp = hp})
  .addActions({setHealth: "setHealth"})
  .setStaticRepresentation(({data, actions}) => {
      nbOfComputation++
      return {
          useHealth: () => data.hp
          // you have also access to actions
          setHealth: actions.setHealth
      }
  })
  .create({ hp: 3 });
```

### Reactivity
Ravioli use Mobx under the hood to make the representation reactive.

```ts
// Will rerender and only if the representation is updated.
autorun(() => document.getElementById("app")!.innerHTML = player.state.representation)
```
ur UI (really) reactive.

### Default representation
Each component is instantiated with a default representation which is an exact synchronised clone of the model.

```ts
const container = createContainer<{ hp: number }>().create({ hp: 3 });
console.log(container.representation.hp) // 3
```

# JSON-Based Container Configuration

Ravioli supports creating containers from JSON configuration files. This is useful for:
- Defining reusable component templates
- Separating configuration from code
- Dynamic container creation based on runtime data
- Reducing boilerplate in large applications

## Quick Start

### 1. Register Components

First, register your reusable components (acceptors, actions, control state predicates, and step reactions) globally:

```ts
import {
  registerAcceptor,
  registerControlStatePredicate,
  registerAction,
  registerStepReaction
} from '@warfog/ravioli';

// Register an acceptor
registerAcceptor('setHP', {
  mutator: (data, { hp }: { hp: number }) => {
    data.hp = hp;
  }
});

// Register control state predicates
registerControlStatePredicate('isAlive', ({ data }) => data.hp > 0);
registerControlStatePredicate('isDead', ({ data }) => data.hp <= 0);

// Register actions
registerAction('heal', () => [{ type: 'setHP', payload: { hp: 100 } }]);
registerAction('damage', ({ amount }: { amount: number }) => [
  { type: 'setHP', payload: { hp: 0 } }
]);

// Register step reactions
registerStepReaction('autoHeal', {
  debugName: 'autoHeal',
  when: ({ delta }) =>
    delta.acceptedMutations.some(m => m.type === 'setHP' && m.payload.hp < 50),
  do: ({ actions }) => actions.heal()
});
```

### 2. Create JSON Configuration

Define your container structure in a JSON object or file:

```ts
import { ContainerConfig } from '@warfog/ravioli';

const playerConfig: ContainerConfig = {
  acceptors: {
    setHP: 'setHP'  // mutationName -> registryKey
  },
  controlStatePredicates: {
    IS_ALIVE: 'isAlive',  // stateName -> registryKey
    IS_DEAD: 'isDead'
  },
  actions: {
    heal: 'heal',  // actionName -> registryKey
    damage: 'damage'
  },
  stepReactions: [
    'autoHeal'  // array of registryKeys
  ]
};
```

### 3. Create Container from JSON

Use `createContainerFromJSON` to build your container:

```ts
import { createContainerFromJSON } from '@warfog/ravioli';

const playerFactory = createContainerFromJSON<{ hp: number }>(playerConfig);

// Create instances
const player1 = playerFactory.create({ hp: 100 });
const player2 = playerFactory.create({ hp: 50 });

// Use them like any Ravioli container
player1.actions.damage({ amount: 30 });
console.log(player1.representation.hp); // 0 (damaged, then auto-healed to 100)
```

## Registry API

### Registration Functions

```ts
// Register components with unique names
registerAcceptor(name: string, acceptor: Acceptor): void
registerControlStatePredicate(name: string, predicate: ControlStatePredicate): void
registerAction(name: string, action: ActionDeclaration): void
registerStepReaction(name: string, reaction: StepReaction): void

// Clear all registered components (useful for testing)
clearRegistry(): void
```

### Getter Functions

```ts
// Retrieve registered components by name
// All throw errors if component not found
getAcceptor(name: string): Acceptor
getControlStatePredicate(name: string): ControlStatePredicate
getAction(name: string): ActionDeclaration
getStepReaction(name: string): StepReaction
```

## Complete Example: Game Character

```ts
import {
  createContainerFromJSON,
  registerAcceptor,
  registerControlStatePredicate,
  registerAction,
  registerStepReaction
} from '@warfog/ravioli';

type Character = {
  hp: number;
  maxHP: number;
  inventory: string[];
};

// 1. Register acceptors
registerAcceptor('updateHP', {
  condition: (data: Character, { hp }) => {
    const newHP = data.hp + hp;
    return newHP >= 0 && newHP <= data.maxHP;
  },
  mutator: (data: Character, { hp }) => {
    data.hp += hp;
  }
});

registerAcceptor('addItem', {
  mutator: (data: Character, { item }) => {
    data.inventory.push(item);
  }
});

// 2. Register control state predicates
registerControlStatePredicate('isAlive', ({ data }) => data.hp > 0);
registerControlStatePredicate('isDead', ({ data }) => data.hp <= 0);
registerControlStatePredicate('isHealthy', ({ data }) => data.hp === data.maxHP);

// 3. Register actions
registerAction('takeDamage', ({ amount }) => [
  { type: 'updateHP', payload: { hp: -amount } }
]);

registerAction('heal', ({ amount }) => [
  { type: 'updateHP', payload: { hp: amount } }
]);

registerAction('pickupItem', ({ item }) => [
  { type: 'addItem', payload: { item } }
]);

// 4. Register step reactions
registerStepReaction('autoHeal', {
  debugName: 'autoHeal',
  when: ({ delta, data }) =>
    delta.acceptedMutations.some(m => m.type === 'updateHP' && m.payload.hp < 0) &&
    data.hp > 0 && data.hp < data.maxHP * 0.3,
  do: ({ actions }) => actions.heal({ amount: 10 })
});

// 5. Create container from config
const characterConfig = {
  acceptors: {
    updateHP: 'updateHP',
    addItem: 'addItem'
  },
  controlStatePredicates: {
    IS_ALIVE: 'isAlive',
    IS_DEAD: 'isDead',
    IS_HEALTHY: 'isHealthy'
  },
  actions: {
    takeDamage: 'takeDamage',
    heal: 'heal',
    pickupItem: 'pickupItem'
  },
  stepReactions: ['autoHeal']
};

const characterFactory = createContainerFromJSON<Character>(characterConfig);

// 6. Create and use instances
const hero = characterFactory.create({
  hp: 100,
  maxHP: 100,
  inventory: []
});

hero.actions.takeDamage({ amount: 50 });
console.log(hero.representation.hp); // 50

hero.actions.takeDamage({ amount: 30 });
// HP drops to 20 (< 30%), auto-heal triggers, HP becomes 30
console.log(hero.representation.hp); // 30

hero.actions.pickupItem({ item: 'sword' });
console.log(hero.representation.inventory); // ['sword']
```

## Benefits

- **Reusability**: Register components once, use them in multiple container configurations
- **Separation of Concerns**: Keep business logic (acceptors, actions) separate from container structure (JSON config)
- **Flexibility**: Dynamically create different container configurations based on runtime conditions
- **Type Safety**: Full TypeScript support with `ContainerConfig` interface
- **Testing**: Easy to test with `clearRegistry()` for isolation between tests
- **Error Handling**: Descriptive errors when registry keys are not found