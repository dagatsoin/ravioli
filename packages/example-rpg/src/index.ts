import Ravioli from "@warfog/ravioli";
import { object, string, number, array } from "@warfog/crafter"

const { component } = Ravioli;


const kobold = component(
  object({
    name: string(),
    health: number(),
    inventory: array(object({ id: string(), quantity: number() }))
  })
)
  .setControlStatePredicate("isAlive", ({ model }) => model.health > 0)
  .setControlStatePredicate("isDead", ({ model }) => model.health <= 0)
  .addAcceptor(
    "setHealth",
    model =>
      ({
        mutator({ hp }: { hp: number }): void {
          model.health += hp;
        }
      })
  )
  .addAcceptor(
    'removeFromInventory',
    model => ({
      mutator({id}: {id: string}) {
        model.inventory.splice(model.inventory.findIndex(item => item.id === id), 1)
      }
    })
  ).addActions({
    hit:() => [{ type: "setHealth", payload: { hp: -3 } }],
    drop: (id: string) => [{
      type: 'removeFromInventory',
      payload: { id }
    }],
  })
  .setTransformation("alive", {
    predicate: "isAlive",
    computation: model => ({
      name: model.name,
      image: "https://tse2.mm.bing.net/th?id=OIP._bdxk_5JB1Vx631GnMjkrgHaGT&pid=Api&P=0&w=300&h=300",
      health: model.health
    })
  })
  .setTransformation("dead", {
    predicate: "isDead",
    computation: model => ({ name: model.name, loot: model.inventory })
  })
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
  render()
}

window['loot'] = function() {
  if (kobold.state.representation.loot?.length) {
    player.actions.pickItem(kobold.state.representation.loot[0])
    kobold.actions.drop(kobold.state.representation.loot[0].id)
  }
  render()
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

render()