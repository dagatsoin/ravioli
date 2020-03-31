# Ravioli
## Stop doing spaghetti code.

Ravioli is like a spaghetti bolognese, but minified and well organized. Also, it does not spread when you are hurry.

## What does Ravioli solve?

**The goal of Ravioli is to code quick but not dirty.**

Ravioli is an attempt for small teams or junior developer to organize their ideas to achieve great things like a todo list or a MMORPG.

It helps you to cut down your software development with a temporal logic mindset and a clear separation of concern between business code and functionalities.

All along your development with Ravioli, you will handle your issues with three questions.
- is this business concern?
- is this functional concern?
- if the user does that, which control state my app will reach?

### Inspirations

Heavely inspired by [Mobx State Tree](https://mobx-state-tree.js.org/). Ravioli implements the [SAM pattern](https://sam.js.org/).

### Is ravioli for you?
- :heavy_check_mark: you are a junior dev looking for great developement experience
- :heavy_check_mark: you are a Typescript developer
yet)
- :heavy_check_mark: you strugggle to organize your code

### Is ravioli not for you?
- :x: you need a library rather a framework (come back later, when the Crafter package will be documented)
- :x: writing mutable code makes you sick
- :x: you need incredible performance (come back later, not optimized yet, see the Test section ad the end of the Readme.)

## Installation

`$npm install --save @warfog/crafter @warfog/ravioli`

## Simple Example

```ts
const store = component(object({counter: number()}))
  .addAcceptor("increment", ({counter}) => ({ mutator: () => counter++ }))
  .addActions({increment: "increment"})
  .create({counter: 0}) // initial model data

autorun(() => console.log(store.state.representation.counter))

store.actions.increment() // 1
store.actions.increment() // 2
store.actions.increment() // 3
```

## Deeper example

What about doing a little RPG instead of the usual todo list?

We won't use react for this but just some HTML.

Here are the specs of our little game:
- as a player, I can beat a monster
- as a player, I can loot a monster
- as a player, I can see my inventory

### As a player, I can beat a monster

Beat a monster means that we need... a monster. It will be a kobold. It also means that our kobold will have two control states: alive or dead.

Let's begin to write the model. The model is always in a private scope. It won't be accessed by the view, and the end user is not aware of its internal.

To describe a model, we use Crafter which is a core part of Ravioli (and can be used in stand alone). Crafter creates a factory which will be used to instantiate our kobold.

Let give to our kobold a name property and health property.

```ts
// Model.ts
import { object, string, number, array } from "@warfog/crafter"

export const Kobold = object({
  name: string(),
  health: number() 
})
```

```ts
// Component.ts

import Ravioli from "@warfog/ravioli";

// Import our model previously created
import { Kobold } from "./Model"

const { component } = Ravioli;

const kobold = component(Kobold)
  /* 1 */
  .setControlStatePredicate("isAlive", ({ model }) => model.health > 0)
  .setControlStatePredicate("isDead", ({ model }) => model.health <= 0)

  /* 2 */
  .addAcceptor("setHealth", model => ({ mutator: ({ hp }) => model.health += hp))
  .addAcceptor("removeFromInventory", model => ({ mutator: ({id}) => {
    model.inventory.splice(model.inventory.findIndex(item => item.id === id), 1)
  }}))
  .addActions({
    hit: () => [{ type: "setHealth", payload: { hp: -3 } }],
    drop: id => [{ type: 'removeFromInventory', payload: { id }}],
  })
  .setTransformation("alive", {
    predicate: "isAlive",
    computation: ({name, health}) => ({
      name,
      image: "https://tse2.mm.bing.net/th?id=OIP._bdxk_5JB1Vx631GnMjkrgHaGT&pid=Api&P=0&w=300&h=300",
      health
    })
  })
  .setTransformation("dead", {
    predicate: "isDead",
    computation: ({name, inventory: loot}) => ({ name, loot })
  })
  .addStepReaction('render', { effect: render })
  .create({
    name: "Kobold",
    health: 10,
    inventory: [{ id: "sword", quantity: 1 }, { id: "shield", quantity: 1 }]
  });

const player = component(object({
  inventory: array(object({
    id: string(),
    quantity: number()
  }))
})).addAcceptor(
  'addToInventory',
  model => ({
    mutator(item: {id: string, quantity: number}) {
      model.inventory.push(item)
    }
  } as any)
).addActions({
  pickItem: function({id}: {id: string}){
    return [{
      type: "addToInventory",
      payload: {id, quantity: 1}
    }]
  } as any
})
.create()

/** VIEW */

type AliveKobold = {
  name: string
  image: string
  health: number
}

type DeadKobold = {
  name: string
  loot: typeof kobold['Type']['inventory']
}

window['hit'] = function() {
  kobold.actions.hit()
}

window['loot'] = function() {
  if (kobold.state.representation.loot?.length) {
    player.actions.pickItem(kobold.state.representation.loot[0])
    kobold.actions.drop(kobold.state.representation.loot[0].id)
  }
}

function isAlive(store: AliveKobold){
  return `
    <h1>RPG Example with Ravioli!</h1>
    <div style="display: flex; flex-direction: column; align-items: center">
      <i>You are facing a kobold.</i>
      <img src="${store.image}" with=300/>
      <b>Health: ${store.health}</b>
      <button onClick="hit()">Hit</button>
    </div>
  `
}
function isDead(store: DeadKobold){
  return `
    <h1>RPG Example with Ravioli!</h1>
    <div style="display: flex; flex-direction: column; align-items: center">
      <i>You have killed the kibold, loot it.</i>
      <ul>
        ${store.loot.map(({id}) => `<li>${id}</li>`).join('')}
      </ul>
      <button onClick="loot()">Loot</button>
    </div>
  `
}

function playerInventory(playerStore: {inventory: {id: string, quantity: number}[]}) {
  return `
  <h2>Player inventory:</h2>
  ${playerStore.inventory.length
    ? `
    <ul>
      ${playerStore.inventory.map(({id}) => `<li>${id}</li>`).join('')}
    </ul>
    `
    : 'empty :('
  }
  `
} 

function render() {
  document.getElementById("app")!.innerHTML = `
      ${kobold.state.controlStates.includes("isAlive")
      ? isAlive(kobold.state.representation)
      : isDead(kobold.state.representation)
    }
    ${
      playerInventory(player.state.representation)
    }
  `;
}

// Initial render
render()
```

# Licence

For now Ravioli is free to use but its source are closed. As I need to to eat I am thinking about paid service to support the development. I will update this section when my plans will be ready.

# API
## Crafter
Crafter is all about crafting your model. It is unshamed ~~copied~~ inspired by Mobx State Tree.

### Quick exemple

### IType

#### IType<T, S>.getSnapshot(node: INodeInstance): S
Get a snapshot of the model.

A snapshot is a serialized representation of the model at JSON format.

Snapshot are computed only at creation and after each transaction. That means that you won't be able to take a snapshot
during a transaction.

### Literal
`literal(value: string)`
A literal accept only one value.

### Enum
`enumeration('player', 'npc')`
A type which accepts a limited set of string.

### Reference
`reference(type: IType<any, any>)`
A reference will point to another node of type `type` somewhere in the tree. At creation you must pass the identifier of the target.

### Identifier
`identifier()`
Used in conjonction with reference. At creation you will pass a UID (the transaction will failed if not).

### Map
**Note on key type**
Crafter turns any number passed as string into Number. So if you set a value like this `myMap.set('4', 'myValue')`
The right getter will be `myMap.get(4)` while `myMap.get('4')` will return `undefined`

## Helpers
### isValidSnapshot
validate a snapshot against a type

For performance reason no validation are made when affecting new value. So it is the responsability of the developper
to ensure that the passed value won't break the app.

A good practice is to put validation only on sensitive input, like on API result handler.

### sync
#### Signature:
```ts
sync<T>(o: IObservable): 
```
This feature allow to bind in one direction two observables. All the change of the source observable will be applied to the target observable.

Internally, the JSONPatch generated by the mutation of the source is reapplied on the target.

### Exemple
```ts
it("should clone an observable and sync its value on each change", function() {
  const source = observable({
    name: "Fraktar",
    questLog: {
      current: {
        id: 0,
        todo: ["ad789dzf", "54z9jdz7"]
      }
    }
  })

  const target = sync(source)
  
  // Do something on the source
  STManager.transaction(() => {
    source.questLog.current.id = 1
  })
  
  // Tada, all changes are reflected on the target.
  expect(target.questLog.current.id).toBe(1)
})
```

# Principle

## SAM pattern
### Principle
// TODO Schema
#### Cycle
#### Decoupling

### Terminology
#### Intents
#### Action
#### Proposal
#### Model
#### Mutation
#### State computation
#### Representation
A representation is how the component instance is viewed from the exterior. It could be anything you app need, some HTML, a 3D model, a map, some JSON or even a MobX observable.
It is totally up to you to transform the model data as you need.
Note that a component instance has a default representation which is a copy of the model whidh is kept in sync at each step.

## Architecture
#### Model
// TODO
Explain what is Crafter
#### Transaction phase
#### Learning phase
### Component
#### Model
#### Acceptors

An instance will first look in its own acceptor registry if the acceptor exists. If not if will look into its factory ComponentFactory. This allows
to override some acceptor for a specific instance.
Eg. Both Orc and Elve are instance of Character component. But an Orc heals itself by 2, but an Elve heals itself by 3.

##### Static Acceptor

Acceptors added during component definition are static. That means that they will be stored in the factory and each instance will call them when needed.
That is more efficient than create as many closures as acceptors for each instance.

##### Instance Acceptor

Instance acceptors are stored into the instance and are used to override existing behavior.

#### Action

Actions are the only accessile commands from the exterior of a component (aka from the View). An action is a pure
functions which return a proposal.

You can see an action call as a high level API and the acceptors as a low level API.
The implementation of action call being the translation between high and low level API.

In this example, that mean it explains to the model how to hit/heal Thrall.

In the example below you can see that the model behaves on a business context. Its responsibility is only to change its own health points. It does not know
about the original intention. Is it hit? Healed?

On the other hand, the action behaves on a functionnal context. It knows how to talk to the model, with a low level messaging vocabulary. Its responsability
is to abstract this low level messages by composing them into a more understandable function for a end user (heal or hit).

```ts
  const Grunt = component(object({
    hp: number()
  }))
  .addAcceptors(model => ({
    setHP: {  // low level concern, the model just know how to change its own HP.
      mutator({hp}: {hp: number}) {
        model.hp = model.hp + hp
      }
    }
  }))
  .addActions({
    hit(){
      return [{
        type: 'setHP', // The same low level concern is used with a different intent.
        payload: {
          hp: -3
        }
      }]
    },
    heal(){
      return [{
        type: 'setHP', // The same low level concern is used with a different intent.
        payload: {
          hp: 6
        }
      }]
    }
  })

  const Thrall = Grunt.create({hp: 10000})

  Thrall.actions.hit()

  expect(Thrall.state.representation.hp).toBe(9997)

  Thrall.actions.heal()

  expect(Thrall.state.representation.hp).toBe(10003)
```

##### Static action

Static action is added on the Component. They will be available to all instances of this Component.

##### Instance action

Instance action is added on the instance. It will be available only for this instance.

##### Actions composition

When you trigger an action, your app will begin a new step. So let's image you are coding a FPS, if you are shooting twice, you will
generate two steps. One for each shot action.
If you are using a simple gun it is OK.
But what if you are using a double shotgun ?

Either you write an other action "doubheShot". Or you can `compose` two actions. In both case you will generate just a single step in your app.

Here is an example

```ts
test('compose actions', function() {
  const Grunt = component(
    object({ hp: number() })
  )
    .addAcceptor('setHP', model => ({
      mutator: ({ hp }) => model.hp += hp
    }))
    .addActions({
      hit: () => [{
        type: 'setHP',
        payload: {
          hp: -5,
        }
      }]      
    })

  const grunt = Grunt.create({ hp: 10 })

  grunt.compose(({hit}) => [
    hit(),
    hit()
  ]) // This will compose two hits in one bigger hit.
  ```

## Mutability and immutability

// TODO

Mutability cost: state leaking
Immutability cost: performance

Mutability gain: dry code, better performance for critical parts, structural sharing (advantages of object reference)
Immutability gain: better debuggability, better testability, state isolation

Ravioli use mutability internally:
- in Crafter model mutation
- in Crafter container internal state

Where Ravioli use immutability:
- on the API

# Internal

## Terminology

### IInstance

// TODO

Used only inside Crafter at model level

### IObservable

// TODO

Higher level instance, used at component level

# Performance

Ravioli is not written with performance in mind but developper experience in mind. Treat a 100k+ array of complexe objects in now time is out of scope here.
However, the performance it provides is quite descent from the majority of the app.
And a lot of performance improvments should be still possible (use proxy instead of getter/setter to minimize memory heap, cache some node values, ...)   

## Test

A performance test is available in packages/crafter/tests/performance.ts
It consists in a array of 10k complexe objects.
The tests mutates each objects on a deeped nested (an item quantity in a player inventory), so it performs 10k mutations in one transaction.
Here is the result:

create one entity 19ms
snapshot loading 7ms
empty model creation 1ms
hydration 7692ms
mutation 309ms
get snapshot 1 ms

As you can see, the real bottleneck is on the hydration part. Creating nodes is expensive, especially Array nodes.

## Dev

### VSCode remote friendly.

This project is compatible with VS Code remote.

1. Install and launch Docker
2. Open the project in VS Code, click "Open in a container" on the lower right pop up.
