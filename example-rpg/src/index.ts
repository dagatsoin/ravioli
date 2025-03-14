import { createContainer } from '../../src'

interface Item {
  id: string
  quantity: number
}

interface KoboldData {
  name: string
  health: number
  inventory: Array<Item>
}

const kobold = createContainer<KoboldData>()
  .addControlStatePredicate("isAlive", ({ data }) => data.health > 0)
  .addControlStatePredicate("isDead", ({ data }) => data.health <= 0)
  .addAcceptor("setHealth", {
    mutator: (data, { hp }: { hp: number }) => data.health += hp
  })
  .addAcceptor('removeFromInventory', {
    mutator: (data, { id }: { id: string }) => data.inventory.splice(data.inventory.findIndex(item => item.id === id), 1)
  })
  .addActions({
    hit: () => [{ type: "setHealth", payload: { hp: -3 } }],
    drop: (id: string) => [{
      type: 'removeFromInventory',
      payload: { id }
    }],
  })
  .addTransformation(({
    data, controlStates
  }) => {
    return controlStates.includes('isAlive')
    ? {
      name: data.name,
      image: "https://tse2.mm.bing.net/th?id=OIP._bdxk_5JB1Vx631GnMjkrgHaGT&pid=Api&P=0&w=300&h=300",
      health: data.health
    } : {
      name: data.name,
      loot: data.inventory
    }
  })
  .addStepReaction({
    debugName: 'render',
    do: ({data, delta}) => {
      document.getElementById("app")!.innerHTML = `
          ${delta.controlStates.includes('isAlive')
          ? aliveKobold({
            name: data.name,
            image: "https://tse2.mm.bing.net/th?id=OIP._bdxk_5JB1Vx631GnMjkrgHaGT&pid=Api&P=0&w=300&h=300",
            health: data.health
          })
          : deadKobold({ name: data.name, loot: data.inventory })
        }
        ${playerInventory(player.representationRef.current)
        }
      `;
    }
  })
  .create({
    name: "Kobold",
    health: 10,
    inventory: [{ id: "sword", quantity: 1 }, { id: "shield", quantity: 1 }]
  });

interface Player {
  inventory: Item[]
}

const player = createContainer<Player>()
  .addAcceptor('addToInventory', {
    mutator(data, item: { id: string, quantity: number }) {
      data.inventory.push(item)
    }
  })
  .addActions({
    pickItem: function ({ id }: { id: string }) {
      return [{
        type: "addToInventory",
        payload: { id, quantity: 1 }
      }]
    }
  })
  .create({inventory: []})

/** VIEW */

type AliveKobold = {
  name: string
  image: string
  health: number
}

type DeadKobold = {
  name: string
  loot: Item[]
}

window['hit'] = function () {
  kobold.actions.hit()
}

window['loot'] = function () {
  if (kobold.representationRef.current.loot?.length) {
    player.actions.pickItem(kobold.representationRef.current.loot[0])
    kobold.actions.drop(kobold.representationRef.current.loot[0].id)
  }
}

function aliveKobold(store: AliveKobold) {
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
function deadKobold(store: DeadKobold) {
  return `
    <h1>RPG Example with Ravioli!</h1>
    <div style="display: flex; flex-direction: column; align-items: center">
      <i>You have killed the kibold, loot it.</i>
      <ul>
        ${store.loot.map(({ id }) => `<li>${id}</li>`).join('')}
      </ul>
      <button onClick="loot()">Loot</button>
    </div>
  `
}

function playerInventory(playerStore: { inventory: { id: string, quantity: number }[] }) {
  return `
  <h2>Player inventory:</h2>
  ${playerStore.inventory.length
      ? `
    <ul>
      ${playerStore.inventory.map(({ id }) => `<li>${id}</li>`).join('')}
    </ul>
    `
      : 'empty :('
    }
  `
}

function isAlive(rep: typeof kobold['representationRef']['current'], controlStates: typeof kobold['controlStates']): rep is AliveKobold {
  return controlStates.includes('isAlive')
}

function render() {
  document.getElementById("app")!.innerHTML = `
    ${isAlive(kobold.representationRef.current, kobold.controlStates)
      ? aliveKobold(kobold.representationRef.current)
      : deadKobold(kobold.representationRef.current)
    }
    ${playerInventory(player.representationRef.current)
    }
  `;
}

// Initial render
render()