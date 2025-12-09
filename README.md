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
├── doc/                  # Documentation (outside workspace)
├── example-rpg/          # RPG example (outside workspace)
└── example-json-config/  # JSON config example (outside workspace)
```

## Development

```bash
# Install dependencies
yarn install

# Build the package
yarn build

# Run tests
yarn test

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
    // Create an instance
    .create({ name: "Fraktos" });

// You can use it with MobX
autorun(() => console.log(user.representationRef.current.name))

// Trigger a "rename" action
user.actions.rename({ name: "Fraktar" });
// Will log:
// Fraktos
// Fraktar
```

# API

API documentation is auto generated and available in a [separate doc](https://github.com/dagatsoin/ravioli/tree/master/doc)

# Examples

Both examples use the local distribution build. Build the main package first from the root:

```bash
yarn build
```

Then run the examples:

- [example-rpg](./example-rpg) - RPG game example with turn-based combat
  ```bash
  cd example-rpg && npm start
  ```

- [example-json-config](./example-json-config) - JSON-based container configuration example
  ```bash
  cd example-json-config && npm start
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
.addStepReaction("auto heal", {
  predicate: (args) => args.data.hp < 2,
  effect: ({ actions }) => actions.heal(),
})
```

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
  .addStaticTransformation(({data, actions}) => {
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
console.log(container.representationRef.current.hp) // 3
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
console.log(player1.representationRef.current.hp); // 0 (damaged, then auto-healed to 100)
```

## Registry API

### Registration Functions

```ts
// Register components with unique names
registerAcceptor(name: string, acceptor: Acceptor): void
registerControlStatePredicate(name: string, predicate: CSPredicate): void
registerAction(name: string, action: ActionPackage): void
registerStepReaction(name: string, reaction: StepReaction): void

// Clear all registered components (useful for testing)
clearRegistry(): void
```

### Getter Functions

```ts
// Retrieve registered components by name
// All throw errors if component not found
getAcceptor(name: string): Acceptor
getControlStatePredicate(name: string): CSPredicate
getAction(name: string): ActionPackage
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
console.log(hero.representationRef.current.hp); // 50

hero.actions.takeDamage({ amount: 30 });
// HP drops to 20 (< 30%), auto-heal triggers, HP becomes 30
console.log(hero.representationRef.current.hp); // 30

hero.actions.pickupItem({ item: 'sword' });
console.log(hero.representationRef.current.inventory); // ['sword']
```

## Benefits

- **Reusability**: Register components once, use them in multiple container configurations
- **Separation of Concerns**: Keep business logic (acceptors, actions) separate from container structure (JSON config)
- **Flexibility**: Dynamically create different container configurations based on runtime conditions
- **Type Safety**: Full TypeScript support with `ContainerConfig` interface
- **Testing**: Easy to test with `clearRegistry()` for isolation between tests
- **Error Handling**: Descriptive errors when registry keys are not found