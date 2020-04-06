# Ravioli
## Stop doing spaghetti code.

Ravioli are like spaghetti bolognese, but minified and well organized. Also, it does not spread when you are hurry.

## What does Ravioli solve?

**The goal of Ravioli is to code quick but not dirty.**

Ravioli is an attempt for small teams or junior developer to organize their ideas to achieve great things like a todo list or a MMORPG.

Ravioli implements the [SAM pattern](https://sam.js.org/), which helps you to cut down your software development by enforcing a temporal logic mindset and a strong separation of concern between business code, view and functionalities.

All along your development with Ravioli, you will handle your issues with a bunch of good practices:
- separate functional from business code
- think you app as a state machine (finite or not)
- write small, atomic, pure and focused business functions
- write abstract and meaningful actions for your user

> "Ravioli makes the world a better place by providing a reactive and declarative framework with the simplicity of a mutable world backed by the security of an immutable plumbing" *An anonymous antousiast coming from the futur*


## Inspirations

- [JJ.Dubray](https://www.linkedin.com/in/jdubray) and its work on the [SAM pattern](https://sam.js.org/). Big thanks to him.
- [Mobx State Tree](https://mobx-state-tree.js.org/) for its developer UX and the model shape management.
- [Mobx](https://mobx.js.org/) for the reactive parts

## Is ravioli for you?
- :heavy_check_mark: you are a junior dev looking for a great developement experience
- :heavy_check_mark: you are a Typescript developer
- :heavy_check_mark: you strugggle to organize your code and are looking for a opinionated framework

## Is ravioli not for you?
- :x: you need a library rather a framework (come back later, when the Crafter package will be documented)
- :x: writing mutable code makes you sick
- :x: you need incredible performance (come back later, not optimized yet.)

## A Ravioli step cycle

SAM and Ravioli are based on temporal logic. Each action starts a new step and lead to a synchronisation with the external world. Here how it works:

      ____________________________________________
      |                                            |                              ^  ^  ^  ^
      |        ___________Model___________         |                              |  |  |  |
      v       |            Data           |        v                             Notify
    Action -> |         Acceptor(s)       | -> Compute next ->  Next actions OR  changes
      ^       |___________________________|      State                |          to observers
      |                                                               |           |  |  |  |
      |_______________________________________________________________|           v  v  v  v

1. First the something/someone triggers a action from the view.
2. The action composes a proposal and present it to the model.
3. The model acceptors accept/reject each part of the proposal and do the appropriate mutations.
4. If the model changed we compute the new component state.
5. This new state may lead to trigger some automatic actions. Each action will lead to a new step (if some changes are made)
6. We notify the external world that our component state has changes (eg. refresh the view, side effects...)

# Ravioli parts

A Ravioli is a component
> At this point of development, they are not composable yet.

Each component is like a Redux store or a Mobx State tree and its role is to simplify the development of stateful application.

A component is like a black box with which let user interact it through some actions.

## Action
An action is a high level interface for the external world of a component. It is the only way to interact with the model.

Its role is to abstract the low level API of the model by composing mutations in a declarative way.

Keep in mind that an action is just a fire and forget interface and does not guarantee a result. **An action is decoupled from the model** and does not know its actual state neither its internal shape or methods. It only barely knows how to form a proposal which maybe will accepted in part or in whole by the model.

An action is a pure function which return a proposal.

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

>### Action are "fire and forget".
>
>This concept is important and reflect the real life. You are never sure that your action will lead to the expected result. There is always a little chance to fail, something unknown or something you have not anticipated.
>
>Think about hiting a kobold in a table top game. Your action is to hit. But the success depends on the rolling dice.
>
>You want to be rich? Your only possible action is to work, but here too, the success will depends of a billion of factors.

## Proposal

A seen in the example above, a proposal is an array of declarative mutations that the action wants to perform on the model.
Note even that the proposal has a specific shape, its content does not need to be valid to be presented to the model. Only the model will decide it is valid or not.

```json
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
## Model
The model contains the business data and methods and lives in a private scope. The external world has no access to it and actions can't act on it directly.

The only way to act on the model is to present a bunch of data, called a proposal. As stated above, it is the action role.

Once the proposal is received, the model will called its acceptors to let them decide either accept or reject each part of the proposal.

### Data

The model shape of the component is built declartively like this.
```ts
const Player = object({
  name: string(),
  health: number(),
  inventory: array(object({
    id: string(),
    quantity: number()
  })),
  isConnected: boolean()
})
```

### Acceptors

An acceptor has two roles:
1. Accept or reject a proposal mutation (with a validator)
2. Do the mutation (with a mutator)

#### Validator
A validator is a simple function of the model and the paylaod.

```ts
const setHpValidator = model => payload => (
  model.health > 0 && // the player is alive
  payload.hp < MAX_POINT // an internal constant rule
)
```

If the mutation passes the validator, it will be marked as accepted and passed down to the mutator.

#### Mutator
A mutator is a simple *non pure* function. It returns nothing and mutate the model data. This is where the mutation happes

```ts
const setHpMutator = model => payload => (
  model.health += payload.hp
) 
```

## State
It is how the world sees your component.

As I stated above, the model is isolated. The state is NOT the model, but its public view.

The State is composed of:
- all the available actions for the current step
- the current control state of the component
- an observable representation of the model

## Control State

This notion directly comes for the State Machine pattern. A Control State is a stable state your app can reach.

For example a Todo of a todo list can be Complete or UnComplete.
A character of a video game can be Alive, Dead or Fighting.

Also, Ravioli does not enforce the concept of a FINITE state machine. You can have multiple control states at a time if you need. Eg a app state can be `['STARTED', 'RUNNING_ONLINE', 'FETCHING']`

A control state predicate is a pure function of the model.
```ts
const isAlive = model => model.health > 0
```
The component state exposes the current controls states of the model in an array. `myApp.state.controlStates // ['STARTED', 'RUNNING_ONLINE', 'FETCHING']`

## Representation

> Terminology, the difference between a view and a representation. By me.
>
> A view is how an exterior observer see a subject. In such, a view can be subjective and not conform to what the subject wants to look like. Eg. a view could be the rendered frame buffer or a HTML representation. And everyone know how the same code looks different from browser to browser.
>
> A representation is decided by the subject of the observation. In our context, the subject is the component and the representation some HTML tag. In such, the represention is 100% conform to the attempt of the subject.

### Is a function of the model

`R = f(m) // Math semantic skillz +100` 

A representation could be anything you need: HTML markup, JSON, binary, data stream,... as long its expression is a pure function of the model.

```ts
// A object ready to send back on the client or inject in the UI.
const objectRepresentation = model => ({ name: model.name, loot: model.inventory })

// Or directly some html markup
const HTMLRepresentation = model => `
  <h2>Player inventory:</h2>
  ${
    model.inventory.length
      ? `
    <ul>
      ${model.inventory.map(({ id }) => `<li>${id}</li>`).join("")}
    </ul>
    `
      : "empty :("
  }
  `;
```

### Reactivity
All representation are reactive, even primitive value like some HTML in template literals.

```ts
// Will rerender and only if the representation is updated.
autorun(() => document.getElementById("app")!.innerHTML = player.state.representation)
```

> Ravioli comes with an adapter for React called Crafter-React but it is not published on NPM yet. It provides an observer for React component exactly like `react-mobx` to make your UI (really) reactive.

### Default representation
Each component is instantiated with a default representation which is an exact synchronised clone of the model. In such, it not violates the decoupling principle but happily trample the principles of private/public data isolation and business/functional abstraction.

In the counter example below, you can see that the representation has the same shape as the model.


# Installation

`$npm install --save @warfog/crafter @warfog/ravioli`

# Simple Example

```ts
const store = component(object({counter: number()}))
  .addAcceptor("increment", (model) => ({ mutator: () => model.counter++ }))
  .addActions({increment: "increment"})
  .create({counter: 0}) // initial model data

autorun(() => console.log(store.state.representation.counter))

store.actions.increment() // 1
store.actions.increment() // 2
store.actions.increment() // 3
```

## A bit more complex example and its cut down

What about doing a little RPG instead of the usual todo list?

We won't use react for this but just some HTML.

Here are the specs of our little game:
- as a player, I can beat a monster
- as a player, I can loot a monster
- as a player, I can see my inventory

First it won't be a real game but I will keep this base for futur tutorials and examples and will enhance it each time.

### As a player, I can beat a monster

Beat a monster means that we need... a monster. It will be a kobold!
It also means that our kobold would be alive or dead.
And finally we will need a way to hit it.

#### Model

Let's begin to write the model. The model is always in a private scope because we don't want our player messes with it
- it won't be accessed by the view.
- the end user is not aware of its internal and can't act directly on it.

To describe a model, we use Crafter which is a core package of Ravioli (and can be used in stand alone but I have no write any doc yet). 

Crafter creates a factory which will be used to instantiate our kobold.

Let give to our kobold a name property and health property.

```ts
// Model.ts
import { object, string, number, array } from "@warfog/crafter"

export const Kobold = object({
  name: string(),
  health: number() 
})
```

Cool now we are able to create some Kobold!

> Test it: 
> 
> ```ts
> console.log(Kobold.create({name: "Candle master", health: 10}))
> ```

#### Control states

Ok. Back to our spec. We now need to describe those two control states: dead and alive. Let's called them `isDead` and `isAlive`

For those who has never heard of what a control state is, let's resume as: a stable "state" that describes your app.

For our Kobold, as a character it can be "alive" or "dead". Later, when other specs will be treated, maybe it will be "casting" or "fighing".

In Ravioli, we describe those control state as a function of the model. Here how:

```ts
// Component.ts

import Ravioli from "@warfog/ravioli";

// Import our model previously created
import { Kobold } from "./Model"

const { component } = Ravioli;

const kobold = Kobold
  // A Kobold is alive when its health point are more than 0
  .setControlStatePredicate("isAlive", ({ model }) => model.health > 0)
  // and dead when its health point are 0 or below
  .setControlStatePredicate("isDead", ({ model }) => model.health <= 0)

```
> When you create a kobold you will have acces to its control state like this:
>
> ```ts
> const boss = Kobold.create({name: "Candle master", health: 10}))
> console.log(boss.state.controlStates) // ["isAlive"]
> ```

Note the control state appears in an array. In Ravioli we are not force to have only one control state at a time like in a Finite State Machine. Your app can be in mutliple control state if you need to. (more on that later)

#### Acceptor

So far, we can instantiate a living kobold. Now we need to implement a way for him to die!

As I explained above a control state is a function of the mode. So, we defined an alive kobold and a dead kobold in function of its health points.
So now we need to implement the mutation of the health points.

In Ravioli (and SAM) it is called an Acceptor.

An acceptor has two roles:
- validate the data (is this mutation allowed at this point?)
- do the mutation

For now, we will just do the mutation. And it is quite simple, like in good old javascript. Mutate the data!! 

```ts
  // Component.ts
  ...
  .addAcceptor("addHealth", model => ({ mutator: ({ hp }) => model.health += hp))
```
Good, so far we wrote a model which can mutate its health point and be alive or dead.

But as I explain earlier neither the data or the acceptor are accessible. So how the player will be able to hit this monster?

#### Action!

An action is the only way to (try) to interact with a component.
An action composes a proposal with some mutation the model will maybe accept.
An action is functional, it means that an action name should be meaningful to a user, hidding
the granularity of the model acceptors.

For our case "hit" is a good name for our action. It will return a proposal which removes 3 HP to the kobold.

```ts
 // Component.ts
 ...
 .addAction({
   hit(){
     return [{
       type: "addHealth",
       payload: { hp: -3 }
     }]
   }
 })
```

Cool. So far, we are able to hit a kobold to death! Let's make a representation to test that.

#### Representation

Our game won't be a AAA game so let's take some raw HTML to begin.

To show you how reactivity works, let's separate the render from the representation. Our component representation will be an boxed observable primitive, and our render will be a reaction to its updates.

1. Write the transformation of the model to its representation.

```ts
 // Component.ts
 ...
.setTransformation(
  "default", // ID of the transformation
  model => `
    <h1>RPG Example with Ravioli!</h1>
    <div style="display: flex; flex-direction: column; align-items: center">
      <i>You are facing a ${kobold.state.representation.name}.</i>
      <img src="https://tse2.mm.bing.net/th?id=OIP._bdxk_5JB1Vx631GnMjkrgHaGT&pid=Api&P=0&w=300&h=300" style="margin: 20px"/>
      <b style="margin: 20px">Health: ${kobold.state.representation.health}</b>
    </div>
  `
```

2. Write a autorun which will render the HTML page each time the representation is updated

```ts
// Component.ts
import { autorun } from '@warfog/crafter'

// This will run each time representation is updated
autorun(function render() {
  document.getElementById("app")!.innerHTML = kobold.state.representation
})
```

#### Instantiate a kobold!

It is time to run our app.

```ts
// add this line at the end of the component declaration
.create({
  name: "Candle Master",
  health: 10
})
```

Houra! You should see an HTML page... but without interaction. It is time to add a...

#### Hit button

> We will extract our markup to a function because the setTransformation does not have access to the actions yet.

##### Refactoring

Set our representation as an object and extract the markup to a `toTHML(representation)` function

```ts
// Component.ts

  // Replace the transformation
  ...
  .setTransformation("default", model => ({
    name: model.name,
    image:
      "https://tse2.mm.bing.net/th?id=OIP._bdxk_5JB1Vx631GnMjkrgHaGT&pid=Api&P=0&w=300&h=300",
    health: model.health
  }))

function toHTML(store) {
  return `
    <h1>RPG Example with Ravioli!</h1>
    <div style="display: flex; flex-direction: column; align-items: center">
      <i>You are facing a ${store.name}.</i>
      <img src="${store.image}" style="margin: 20px"/>
      <b style="margin: 20px">Health: ${store.health}</b>
    </div>
  `
}

autorun(function render() {
  document.getElementById("app")!.innerHTML = kobold.state.representation
})
```
##### Extract the actions

`const {hit} = kobold.representation.actions`

##### Add a Hit button

Let's do it quick and dirty, for the HTML page to access the actions, we set it as a global object


```ts
window.hit = function() {
  kobold.actions.hit();
};

window.loot = function() {
  if (kobold.state.representation.loot.length) {
    kobold.actions.drop(kobold.state.representation.loot[0].id);
  }
};
  `
    ...
    <b style="margin: 20px">Health: ${store.health}</b>
    // Add the button
    <button onClick="hit();">Hit!</button>
  </div>
  `
```

Refresh your app. Click on hit and beat it!!

Oh wait. The health is now below 0 :(

To fix this we set a second transformation when the kobold will is dead.

#### Bind representation to control states

##### Refactor

To bind a transformation to a control state, we just need to pass the desired control state to the `setTransformation` function.

```ts
// replace the previous transform
.setTransformation("alive", {
    predicate: "isAlive", // This transformation will only be used when the kobold is alive.
    computation: model => ({
      name: model.name,
      image:
        "https://tse2.mm.bing.net/th?id=OIP._bdxk_5JB1Vx631GnMjkrgHaGT&pid=Api&P=0&w=300&h=300",
      health: model.health
    })
  })
```

Also rename the function `toHTML` to `isALive`

##### Add a representation when the kobold is dead

```ts
// place this one just after the "alive" transform
 .setTransformation("dead", {
    predicate: "isDead",
    computation: model => ({ name: model.name })
  })
```

Add a new html markup function

```ts
function isAlive(store: AliveKobold) {
...
}
function isDead(store: DeadKobold) {
  return `
    <h1>RPG Example with Ravioli!</h1>
    <div style="display: flex; flex-direction: column; align-items: center">
      <i>You have killed the ${name: store.name}, loot it.</i>
    </div>
  `;
}
```

Refresh the app. Hit the Kobold. Now, when the component reach the "isDead" control state, a new view is displayed! Congratulations, you beat the Candle Master!

Our first ticket is complete!! Next!

### As a player, I can loot a monster

> Its body still warm, you decide to loot your fallen ennemy.

For this ticket, we will only focus on the loot of the kobold. Not the inventory of the player.

First our model will need an inventory. Second, we will need an acceptor to remove item from this inventory. Last, we will need an action to pick up an item. Let's go.

#### Add the inventory shape to the model

We will add a field inventory which is an array of item in our model.

```ts
...
// place this in the root model object
inventory: array(object{
  id: string(), // item id
  quantity: number() // slot quantity
})
...
```
#### Add acceptor

We now need to add an acceptor for removing an item from the inventory. Note again, the name and the purpose is not revelant from a functional point of view but is from a business point of view. 
```ts
  .addAcceptor("removeFromInventory", model => ({ mutator: ({id}) => {
    model.inventory.splice(model.inventory.findIndex(item => item.id === id), 1)
  }}))
```

#### Add action

```ts
  .addActions({
    hit()...,
    dropItem({ id }: { id: string }) {
      return [{
        type: "removeFromInventory",
        payload: { id }
      }]
    }
  })
```

Wait a minute. Is there any Vuex users here? Does this sound familliar to you? I mean this implementation does not do anything other than passing the payload
to a mutation.

For this case that you may encouter multiple times, there is a shortcut.

```ts
  .addActions({
    hit()...,
    // Again, note the difference of meaning between a functional action and a business mutation.
    dropItem: "removeFromInventory"
  })
```

You are welcome.

### Add loot button

As for hit button, let's add a global function `loot` to trigger the actions.

```ts
window.loot = function() {
  if (kobold.state.representation.loot.length) {
    kobold.actions.drop(kobold.state.representation.loot[0]);
  }
}
```

>Note this is an example of an anti pattern.
>
>Indeed the `if` condition is a business rule. In a game it is the role of the Game Master to accept or reject the pick action, because it knows about what is inside inventory of all players and NPCs.
>
>Still, it works, but it could be a vulnerability in our game. If the client manages to by pass this condition, it will be able to pickup as many item as he wants.
>
> Never trust the client! 100% of cheaters are players!
>
> We will refactor this in a futur step.

### Update the html markup

We will display the inventory of the dead kobold. Update the `isDead` function with this:

```js
function isDead(store: DeadKobold) {
  return `
    ...
    <i>You have killed the ${name: store.name}, loot it.</i>
    <ul>
      ${store.loot.map(({ id }) => `<li>${id}</li>`).join("")}
    </ul>
    <button onClick="loot()">Loot</button>
  </div>
  `
```

Now, refresh and rekill the kobold and loot it. Its loot list should empty.

Congratulations, we finished our second specs: **As a player, I can loot a monster**

Now let's make this player more tangible.

## As a player, I can see my inventory

There is two way to solve this. Use a second component or update the existing one to add a player field.

For the sake of the example I will go to add a second component to show you that you can use more than one store in your app.

### Model

Our player needs only an inventory field.

```ts
// Model.ts
export const Player = component(
  object({
    inventory: array(
      object({
        id: string(),
        quantity: number()
      })
    )
  })
)
```

### Add acceptor

We just need to be able to add an item to the inventory.

```ts
// Component.ts
import { Kobold, Player } from './Model'

...
Player
  .addAcceptor("addToInventory", model => ({
    mutator(item: { id: string; quantity: number }) {
      model.inventory.push(item);
    }
  }))

```

### Add action

Let's do it simple. As we have access to the ids of the loot. We can pass it to the action. Then the role of the action will be to ensure that just one item will be added.

```ts
  // Component.ts
  ...
  .addAction({
    pickItem: function({ id }: { id: string }) {
      return [
        {
          type: "addToInventory",
          payload: { id, quantity: 1 }
        }
      ];
    }
  })
```

Now we will trigger our action in the same global `loot` function. Two actions on two
different components will be triggers sequentially.
The `autorun` which renders the app will update two times.

```ts
  // Component.ts
  window.loot = function() {
    if (kobold.state.representation.loot.length) {
      player.actions.pickItem(kobold.state.representation.loot[0]);
      kobold.actions.drop(kobold.state.representation.loot[0].id);
    }
  };
```

### Representation

This time, our representation does not have to access any action. So we will set it up directly in the component.

```ts
  // Component.ts
  ...
  .setTransformation('default', model => `
    <h2>Player inventory:</h2>
      ${
        model.inventory.length
          ? `
        <ul>
          ${model.inventory.map(({ id }) => `<li>${id}</li>`).join("")}
        </ul>
        `
          : "empty :("
      }
    `)
```

### Instantiation

Let's create it! Hint, when you don't pass any value to create, the factory will get the default value of each type ('' for string, NaN for number, [] for array...)

```ts
  // Component.ts
  ...
  .create()
``` 

And voilà! Now your player sees its inventory picking each items on the dead Kobold.

### Conclusion

This was a detailled explanation on how Ravioli works with a simple example. There is field of improvments which will be treated in futur blog post on my [dev.to](https://dev.to/dagatsoin):
- merge the two components into a single tree to
- make one render when clicking on loot instead of two
- improve security to prevent user to add too many items

# API

// TODO

# Licence

For now Ravioli has no licence and is not free to use commercialy. That means you can experience with it but not use it for commercial purpose.
As I need to to eat, I am thinking about paid service to support the development. I will update this section when my plans will be ready.

# Performance

Ravioli is not written with performance in mind but developper experience in mind. Treat a 100k+ array of complexe objects in no time is out of scope here.
However, the performance it provides is quite descent from the majority of the app.
And a lot of performance improvments should be still possible (use proxy instead of getter/setter to minimize memory heap, cache some node values, ...)   

## Dev

### VSCode remote friendly.

This project is compatible with VS Code remote.

1. Install and launch Docker
2. Open the project in VS Code, click "Open in a container" on the lower right pop up.
