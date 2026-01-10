# SAM Pattern & Ravioli Training Guide

This document provides comprehensive training on the SAM (State-Action-Model) pattern and its implementation in the `@warfog/ravioli` library.

---

## Part 1: SAM Pattern Fundamentals

**Source**: https://sam.js.org/

### Core Concepts

SAM separates **what happens** (Actions) from **what changes** (Model) from **what's shown** (State/Representation).

| Component | Role | Key Principle |
|-----------|------|---------------|
| **Action** | Translates events into proposals | Pure functions, no state access, computes values to present to model |
| **Model** | Accepts/rejects proposals, mutates data | Singleton, enforces integrity rules, sole authority on mutations |
| **State** | Computes representation and control state | Translates model to view-friendly format, triggers NAP |
| **NAP** | Next-Action Predicate | Determines automatic follow-up actions based on control state |

### Data Flow

```
Event → Action → Model.present(proposal) → State (representation) → View
                                                      ↓
                                              NAP (automatic action)
                                                      ↓
                                              [loop back to Action]
```

### Key Principles

1. **Views are pure functions**: `V = f(M)` - Views derive entirely from state representation
2. **Two-way binding prohibited**: Data flows one direction only
3. **Actions don't decide outcomes**: They propose; the Model decides what to accept
4. **Control states are computed**: Derived from model properties via pure functions

---

## Part 2: Ravioli API Reference

**Package**: `@warfog/ravioli`
**Dependency**: Requires `mobx`

### Installation

```bash
npm install --save mobx @warfog/ravioli
```

### Container Factory Methods

| Method | Purpose |
|--------|---------|
| `createContainer<T>()` | Create a new container factory with data type T |
| `.addAcceptor(name, config)` | Add an atomic mutation handler |
| `.addControlStatePredicate(name, predicate)` | Define a control state |
| `.addActions(actions)` | Add action definitions |
| `.addTransformation(fn)` | Custom representation (computed each step) |
| `.addStaticTransformation(fn)` | Custom representation (computed once) |
| `.addStepReaction(config)` | Add NAP (automatic action) |
| `.create(initialData)` | Create an instance |

### Instance Properties

| Property | Type | Description |
|----------|------|-------------|
| `controlStates` | `string[]` | **Array** of current control state names |
| `representationRef.current` | `REPRESENTATION` | Current representation (observable) |
| `actions` | `ACTIONS` | Object containing action methods |
| `stepId` | `number` | Current step counter |
| `compose(fn)` | method | Compose multiple actions in one step |

---

## Part 3: Acceptors (Atomic Mutations)

Acceptors are **atomic operations** that don't know what they're used for (Separation of Concerns).

### Basic Acceptor

```typescript
.addAcceptor("setName", {
  mutator(data, { name }: { name: string }) {
    data.name = name;
  }
})
```

### Acceptor with Condition (Guard)

```typescript
.addAcceptor("setName", {
  condition: (data, { name }: { name: string }) => name.length > 5,
  mutator(data, { name }: { name: string }) {
    data.name = name;
  }
})
```

The `condition` function guards the mutation - if it returns `false`, the mutation is **rejected**.

---

## Part 4: Control States

Control states are computed predicates that describe the application's current stable state(s).

### Access Pattern

```typescript
// Control states are an ARRAY of strings
app.controlStates  // ["IS_ALIVE", "LOGGED_IN"]
app.controlStates.includes("IS_ALIVE")  // true
```

### Function Predicate

```typescript
.addControlStatePredicate("IS_ALIVE", ({ data }) => data.hp > 0)
.addControlStatePredicate("IS_DEAD", ({ data }) => data.hp <= 0)
```

The predicate receives: `{ data, previousControlStates, acceptedMutations }`

### Declarative Predicate (Boolean Logic)

```typescript
.addControlStatePredicate("RUNNING_ONLINE", {
  or: [
    { and: [{ previous: "LOGGED_OUT" }, "SYNCHRONISED", "LOGGED_ONLINE"] },
    { and: [{ previous: "LOGGED_ONLINE" }, "SYNCHRONISED"] },
    { and: [{ previous: "RUNNING_OFFLINE" }, "SYNCHRONISED", "LOGGED_ONLINE"] },
  ],
})
```

Operators:
- `{ and: [...] }` - All conditions must be true
- `{ or: [...] }` - Any condition must be true
- `{ not: condition }` - Condition must be false
- `{ previous: "STATE" }` - Previous control states included this
- `"STATE_NAME"` - Current control states include this

---

## Part 5: Actions

Actions compose atomic acceptor mutations. The Model doesn't know why mutations happen.

### Direct Binding (Shortcut)

```typescript
.addActions({
  rename: "setName",  // Directly calls setName acceptor
})
```

### Function Action (Composing Proposals)

```typescript
.addActions({
  hit() {
    return [
      { type: "setHP", payload: { hp: -3 } },
    ];
  },
  heal() {
    return [
      { type: "setHP", payload: { hp: 6 } },
    ];
  },
})
```

### Action with Parameters

```typescript
.addActions({
  hit: (points: number) => [{ type: "updateHP", payload: -points }],
  heal: (points: number) => [{ type: "updateHP", payload: points }],
})
```

### Gated Action (isAllowed)

**This is how actions are restricted to specific control states:**

```typescript
.addActions({
  heal: {
    isAllowed: (context) => context.controlStates.includes("IS_ALIVE"),
    action: () => [
      { type: "addHP", payload: { hp: 1 } },
    ],
  },
})
```

The `isAllowed` function receives `{ controlStates: string[] }` and returns `boolean`.

If `isAllowed` returns `false`, the action is **not executed** and a warning is logged.

### Async Action

```typescript
.addActions({
  save: {
    isAsync: true,
    action() {
      return new Promise((resolve) => {
        // ... async work ...
        resolve([{ type: "clean", payload: undefined }]);
      });
    },
  },
})
```

### Cancelable Async Action

```typescript
.addActions({
  save: {
    isAsync: true,
    isCancelable: true,
    action() {
      return new Promise((resolve) => {
        // If another action is called before this resolves,
        // this proposal will be ignored (stale stepId)
        resolve([{ type: "clean", payload: undefined }]);
      });
    },
  },
})
```

---

## Part 6: Compose (Multi-Action Step)

Execute multiple actions atomically in a single step:

```typescript
app.compose(({ hit }) => [hit(), hit()]);  // Double hit, one step increment
```

---

## Part 7: Representation

By default, representation IS the data (same reference, not a copy). Custom transformations are optional.

### Access Pattern

```typescript
app.representationRef.current.hp        // Access data
app.representationRef.current.health    // Access transformed data
```

### Custom Transformation (Computed Each Step)

```typescript
.addTransformation(({ data, controlStates }) => ({
  health: data.hp,
  isAlive: controlStates.includes("IS_ALIVE"),
}))
```

### Static Transformation (Computed Once)

```typescript
.addStaticTransformation(({ data, actions }) => ({
  useHealth: () => data.hp,  // Returns current value when called
  setHealth: actions.setHealth,
}))
```

---

## Part 8: Step Reactions (NAP)

Automatic actions that trigger based on conditions after each step.

### Basic Step Reaction

```typescript
.addStepReaction({
  debugName: "auto heal",
  when: (args) => args.data.hp < 3,
  do: ({ actions }) => actions.heal(),
})
```

### Reaction on Control State Change

```typescript
.addStepReaction({
  debugName: "resurrection",
  when: ({ delta: { controlStates } }) => controlStates.includes("IS_DEAD"),
  do: ({ actions }) => actions.setHP(10),
})
```

### Reaction on Accepted Mutations

```typescript
.addStepReaction({
  debugName: "autoHeal",
  when: ({ delta: { acceptedMutations } }) =>
    acceptedMutations.some(({ type, payload }) => type === "setHP" && payload.hp < 0),
  do: ({ actions: { heal } }) => heal(),
})
```

### One-Shot Reaction

```typescript
.addStepReaction({
  debugName: "deflect first hit",
  once: true,  // Runs only once, then removed
  when: ({ delta }) => delta.acceptedMutations.some(({ type }) => type === "updateHP"),
  do: ({ actions }) => { /* deflect logic */ },
})
```

### Skip on Init

```typescript
.addStepReaction({
  runOnInit: false,  // Don't run when container is created
  do: () => { /* ... */ },
})
```

### Step Reaction Context

The `when` and `do` functions receive:

```typescript
{
  data: TYPE,                    // Current model data
  delta: {
    acceptedMutations: MUTATIONS[],  // Mutations accepted this step
    proposal: TaggedProposal,        // Original proposal
    controlStates: string[],         // Current control states
    previousControlStates: string[], // Control states before this step
  },
  actions: ACTIONS,              // Available actions (in `do` only)
  representation: REPRESENTATION // Current representation (in `do` only)
}
```

---

## Part 9: MobX Integration

Ravioli uses MobX for reactivity. All instance properties are observable.

### React to Step Changes

```typescript
import { reaction } from 'mobx';

reaction(
  () => app.stepId,
  (stepId) => console.log('Step:', stepId)
);
```

### React to Control State Changes

```typescript
reaction(
  () => app.controlStates,
  (states) => console.log('States:', states)
);
```

### React to Representation Changes

```typescript
reaction(
  () => app.representationRef.current.hp,
  (hp) => console.log('HP changed:', hp)
);
```

---

## Part 10: Complete Example

```typescript
import { createContainer } from '@warfog/ravioli';

interface CharacterData {
  hp: number;
  name: string;
}

const Character = createContainer<CharacterData>()
  // Atomic acceptors (don't know business context)
  .addAcceptor("updateHP", {
    mutator: (data, delta: number) => data.hp += delta
  })
  .addAcceptor("setName", {
    mutator: (data, { name }: { name: string }) => data.name = name
  })

  // Control states (computed from data)
  .addControlStatePredicate("IS_ALIVE", ({ data }) => data.hp > 0)
  .addControlStatePredicate("IS_DEAD", ({ data }) => data.hp <= 0)

  // Actions (compose acceptors, optionally gated by control state)
  .addActions({
    rename: "setName",  // Direct binding
    hit: (points: number) => [{ type: "updateHP", payload: -points }],
    heal: {
      isAllowed: ({ controlStates }) => controlStates.includes("IS_ALIVE"),
      action: (points: number) => [{ type: "updateHP", payload: points }],
    },
  })

  // Step reaction (NAP)
  .addStepReaction({
    debugName: "auto heal when low",
    when: ({ data }) => data.hp > 0 && data.hp < 3,
    do: ({ actions }) => actions.heal(1),
  });

// Create instance
const hero = Character.create({ hp: 10, name: "Fraktar" });

// Use it
console.log(hero.controlStates);              // ["IS_ALIVE"]
console.log(hero.representationRef.current);  // { hp: 10, name: "Fraktar" }

hero.actions.hit(5);
console.log(hero.representationRef.current.hp);  // 5

hero.actions.heal(2);  // Allowed because IS_ALIVE
console.log(hero.representationRef.current.hp);  // 7

// Multiple hits in one step
hero.compose(({ hit }) => [hit(3), hit(3), hit(3)]);
console.log(hero.controlStates);  // ["IS_DEAD"]

hero.actions.heal(10);  // NOT allowed because IS_DEAD
console.log(hero.representationRef.current.hp);  // Still -2 (heal was blocked)
```

---

## Part 11: Applying to Sandwich Control States

For the Control State System (US-018), here's the correct pattern:

```typescript
import { createContainer } from '@warfog/ravioli';

interface ProjectControlData {
  pmValidated: boolean;
  poValidated: boolean;
}

const ProjectControl = createContainer<ProjectControlData>()
  // Atomic acceptors
  .addAcceptor("setPmValidation", {
    mutator: (data, { value }: { value: boolean }) => {
      data.pmValidated = value;
    }
  })
  .addAcceptor("setPoValidation", {
    mutator: (data, { value }: { value: boolean }) => {
      data.poValidated = value;
    }
  })

  // Control state predicates
  .addControlStatePredicate("NORMAL", ({ data }) =>
    data.pmValidated && data.poValidated
  )
  .addControlStatePredicate("DRAFT", ({ data }) =>
    !data.pmValidated
  )
  .addControlStatePredicate("PENDING", ({ data }) =>
    data.pmValidated && !data.poValidated
  )

  // Actions with control state gating
  .addActions({
    enterDraftMode: {
      isAllowed: ({ controlStates }) => controlStates.includes("NORMAL"),
      action: () => [
        { type: "setPmValidation", payload: { value: false } },
        { type: "setPoValidation", payload: { value: false } },
      ],
    },
    submitForReview: {
      isAllowed: ({ controlStates }) => controlStates.includes("DRAFT"),
      action: () => [
        { type: "setPmValidation", payload: { value: true } },
      ],
    },
    approve: {
      isAllowed: ({ controlStates }) => controlStates.includes("PENDING"),
      action: () => [
        { type: "setPoValidation", payload: { value: true } },
      ],
    },
    reject: {
      isAllowed: ({ controlStates }) => controlStates.includes("PENDING"),
      action: () => [
        { type: "setPmValidation", payload: { value: false } },
      ],
    },
  });

// Usage
const project = ProjectControl.create({ pmValidated: true, poValidated: true });

console.log(project.controlStates);  // ["NORMAL"]

project.actions.enterDraftMode();
console.log(project.controlStates);  // ["DRAFT"]

project.actions.submitForReview();
console.log(project.controlStates);  // ["PENDING"]

project.actions.approve();
console.log(project.controlStates);  // ["NORMAL"]
```

---

## Part 12: Backend Integration Patterns

### REST API Mapping

```
┌─────────────────────────────────────────────────────────────┐
│                    SAM → REST Mapping                        │
├─────────────────────────────────────────────────────────────┤
│  GET  /counter         →  Return Representation             │
│  POST /counter/action  →  Execute Action, return Rep        │
│  Model (Ravioli)       →  Lives on server (singleton)       │
│  View                  →  Client consumes JSON response     │
└─────────────────────────────────────────────────────────────┘
```

### GraphQL Mapping

```
┌─────────────────────────────────────────────────────────────┐
│                   SAM → GraphQL Mapping                      │
├─────────────────────────────────────────────────────────────┤
│  Query                 →  Get Representation                │
│  Mutation              →  Execute Action                    │
│  Subscription          →  NAP (real-time state updates)     │
│  Model (Ravioli)       →  Lives on server                   │
└─────────────────────────────────────────────────────────────┘
```

---

## Part 13: Container Lifecycle & Persistence

### Request-Scoped vs Singleton (CRITICAL!)

**Request-Scoped (WRONG for SAM):**
```
Request 1: Container created → step 0 → 1 → dies
Request 2: Container created → step 0 → 1 → dies  ← BREAKS TEMPORAL LOGIC!
Request 3: Container created → step 0 → 1 → dies
```

**Singleton (CORRECT for SAM):**
```
Server Start: Container created → step 0
Request 1: Same container → step 0 → 1
Request 2: Same container → step 1 → 2
Request 3: Same container → step 2 → 3  ← TEMPORAL LOGIC PRESERVED!
```

### Why Singleton?

SAM's temporal logic depends on continuous step progression:
- Step reactions may depend on step count
- Control state history requires continuity
- Actions may be gated by "how many times X happened"

### Singleton + Hydrate/Save Pattern

```typescript
// counter-manager.ts
class CounterManager {
  private containers: Map<string, CounterInstance> = new Map();

  async getCounter(id: string): Promise<CounterInstance> {
    if (this.containers.has(id)) {
      return this.containers.get(id)!;  // Return singleton
    }

    // Create new container, hydrate from DB
    const dbRecord = await repository.findById(id);
    const container = createCounterContainer(id, dbRecord?.count ?? 0, onSave);
    this.containers.set(id, container);
    return container;
  }
}
```

---

## Part 14: NAP for Persistence

### Key Insight

> **Persistence is a REACTION to state change, not part of the action.**

The Model owns its persistence behavior via NAP (Step Reaction).

### Implementation

```typescript
const Counter = createContainer<CounterData>()
  .addAcceptor('add', { /* ... */ })
  .addActions({ increment: () => [/* ... */] })

  // NAP: Automatic persistence after each step
  .addStepReaction({
    debugName: 'persist',
    runOnInit: false,  // Don't save on container creation
    do: ({ data }) => {
      repository.save(data.id, data.count);  // Fire-and-forget
      console.log(`[NAP] Persisted ${data.id} with count ${data.count}`);
    },
  });
```

### Benefits

1. **Automatic** - Can't forget to save
2. **Decoupled** - Actions don't know about persistence
3. **Consistent** - Every mutation triggers save
4. **Model-owned** - Persistence logic lives in the model

---

## Part 15: Async NAP with `awaitAsync`

### The Problem: Stale Writes (Without `awaitAsync`)

When NAP persistence is async (fire-and-forget), saves can complete out of order:

```
Timeline (WITHOUT awaitAsync):
─────────────────────────────────────────────────────────────────────
[0ms]   Action 1: increment() → count=1, NAP starts save(1) [SLOW: 1000ms]
[0ms]   Action 2: increment() → count=2, NAP starts save(2) [FAST: 5ms]
[5ms]   save(2) COMPLETES → DB has count=2 ✓
[1000ms] save(1) COMPLETES → DB has count=1 ✗ OVERWRITES!
─────────────────────────────────────────────────────────────────────
```

### The Solution: `awaitAsync: true`

Use the `awaitAsync` option to ensure async operations complete before the next step:

```typescript
.addStepReaction({
  debugName: 'persist',
  awaitAsync: true,  // ← Ensures saves complete in order
  runOnInit: false,
  do: async ({ data }) => {
    await repository.save(data.id, data.count);
  },
})
```

### How It Works

```
Timeline (WITH awaitAsync: true):
─────────────────────────────────────────────────────────────────────
[0ms]    Action 1: increment() → count=1, NAP starts save(1)
[0ms]    Action 2: increment() → BUFFERED (isRunningNAP = true)
[1000ms] save(1) COMPLETES → DB has count=1 ✓
[1000ms] isRunningNAP = false, buffer processed
[1000ms] Action 2: count=2, NAP starts save(2)
[1005ms] save(2) COMPLETES → DB has count=2 ✓
─────────────────────────────────────────────────────────────────────
```

### Key Behavior

| Property | Description |
|----------|-------------|
| `awaitAsync: true` | Library awaits `do()` promise before allowing next step |
| `awaitAsync: false` (default) | Fire-and-forget (original behavior) |
| Mixed reactions | Reactions run sequentially; `awaitAsync` ones block until complete |
| Buffering | Actions called during async NAP are buffered, processed after |

### When to Use

- **Use `awaitAsync: true`** for persistence, external API calls, or any operation where order matters
- **Use `awaitAsync: false`** (default) for logging, analytics, or fire-and-forget operations

---

## Summary: Key Corrections from Initial Training

| What I Got Wrong | Correct Pattern |
|-----------------|-----------------|
| `app.controlStates.normal` (object) | `app.controlStates.includes("NORMAL")` (array) |
| `.allowWhen()` method | `isAllowed` property in action config |
| Acceptors bound to business actions | Acceptors are atomic; actions compose them |
| Control state in representation | Control states accessed directly on instance |
| Request-scoped containers | **Singleton** (preserves temporal logic) |
| Save in action | Save in **NAP** (reaction to state change) |
| Async NAP race condition | Use `awaitAsync: true` to ensure sequential completion |
