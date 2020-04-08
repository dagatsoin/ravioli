import { component } from "../src/api"
import { object, string, number, array, autorun, getGlobal, identifier, boolean, reference, createTransformer } from "@warfog/crafter"

test('default representation', function() {
  const player = component(object({
    name: string(),
    health: number(),
    inventory: array(object({ id: string(), quantity: number() }))
  }))
    .addAcceptor('addToInventory', model => ({mutator(item: {id: string, quantity: number}): void { model.inventory.push(item) }}))
    .addActions({ pickUp: (item: {id: string, quantity: number}) => [{ type: 'addToInventory', payload: item}]})
    .create({
      name: 'Fraktar',
      health: 10,
      inventory: [
        { id: 'sword', quantity: 1},
        { id: 'shield', quantity: 1},
      ]
    })

    let inventory = []

    autorun(() => {
      inventory = player.state.representation.inventory.slice()
    })
  
    expect(inventory.length).toBe(2)
  
    // Found a potion! 
    player.actions.pickUp({ id: 'potion', quantity: 1})
  
    expect(inventory.length).toBe(3)
})

test('custom representation', function() {
  const player = component(object({
    name: string(),
    health: number(),
    inventory: array(object({ id: string(), quantity: number() }))
  }))
    .addAcceptor('addToInventory', model => ({mutator(item: {id: string, quantity: number}): void { model.inventory.push(item) }}))
    .addActions({ pickUp: (item: {id: string, quantity: number}) => [{ type: 'addToInventory', payload: item}]})
    .setTransformation('alive', (model) => ({ name: model.name, inventory: model.inventory }))
    .create({
      name: 'Fraktar',
      health: 10,
      inventory: [
        { id: 'sword', quantity: 1},
        { id: 'shield', quantity: 1},
      ]
    })

    let inventory = []

    autorun(() => {
      inventory = player.state.representation.inventory.slice()
    })
  
    expect(inventory.length).toBe(2)
  
    // Found a potion!
    player.actions.pickUp({ id: 'potion', quantity: 1})
  
    expect(inventory.length).toBe(3)
})

test('transform to primitive', function() {
  getGlobal().$$crafterContext.clearContainer()
  const player = component(object({
    name: string()
  }))
    .addAcceptor('setName', model => ({mutator({name: _name}: {name: string}): void { model.name = _name }}))
    .addActions({setName: 'setName'})
    .setTransformation('toString', model => model.name)
    .create()
  
    let name = ''

    autorun(() => {
      name = player.state.representation
    })

    player.actions.setName({name: 'Fraktar'})

    expect(name).toBe('Fraktar')
})

test('transformation are not too reactive', function() {
  const Stats = object({
    health: number()
  })

  const Inventory = array(object({
    id: string(),
    quantity: number()
  }))

  const Entity = object({
    id: identifier(),
    stats: Stats,
    name: string(),
    inventory: Inventory
  })

  const Player = object({
    id: string(),
    connextionStatus: boolean(),
    entity: reference(Entity)
  })

  const World = object({
    entities: array(Entity),
  })

  // Representation

  let playerTransformRun = 0
  const playerRep = createTransformer((player: typeof Player['Type']) => {
    playerTransformRun++
    return {
      name: player.entity.name,
      stats: { health: player.entity.stats.health },
      inventory: player.entity.inventory.map(e => ({id: e.id, quantity: e.quantity})),
      connextionStatus: !!player.connextionStatus
    }
  })

  let entityTransformRun = 0
  const entityRep = createTransformer((entity: typeof Entity['Type']) => {
    entityTransformRun++
    return {
      id: entity.id,
      inventory: entity.inventory.map(e => ({id: e.id, quantity: e.quantity})),
      health: entity.stats.health,
      name: entity.name
    }
  })

  let worldTransformRun = 0
  const worldRep = createTransformer((world: typeof World['Type'], contexts) => {
    worldTransformRun++
    return {
      entities: world.entities
        .filter(({id}) => id !== 'player0')
        .map(e => entityRep(e, contexts))
    }
  })

  let reactStoreComputedRun = 0

  const App = component(object({
    isConnected: boolean(),
    player: Player,
    world: World
  }))
  .addAcceptor('setPlayerName', model => ({
    mutator({name}: {name: string}){
      model.world.entities.find(({id}) => id === "player0")!.name = name
    }
  }))
  .addActions({
    renamePlayer: 'setPlayerName'
  })
  .setTransformation("default", (model, contexts) => {
    reactStoreComputedRun++
    return {
      isAppOnline: model.isConnected,
      player: playerRep(model.player, contexts),
      world: worldRep(model.world, contexts)
    }
  })
  .create({
    isConnected: true,
    player: {
      id: 'player0',
      connextionStatus: true,
      entity: 'player0'
    },
    world: {
      entities: [{
        id: 'player0',
        name: 'Fraktar',
        stats: {
          health: 10
        },
        inventory: [{
          id: 'sword',
          quantity: 1
        }, {
          id: 'shield',
          quantity: 1
        }]
      }, {
        id: 'grunt0',
        name: 'Grunt',
        stats: {
          health: 10
        },
        inventory: [{
          id: 'sword',
          quantity: 1
        }, {
          id: 'shield',
          quantity: 1
        }]
      }, {
        id: 'grunt1',
        name: 'Grunt',
        stats: {
          health: 10
        },
        inventory: [{
          id: 'sword',
          quantity: 1
        }, {
          id: 'shield',
          quantity: 1
        }]
      }]
    }
  })

  expect(playerTransformRun).toBe(1)
  expect(entityTransformRun).toBe(2)
  expect(worldTransformRun).toBe(1)
  expect(reactStoreComputedRun).toBe(1)

  App.actions.renamePlayer({name: "Fraktos"})

  expect(playerTransformRun).toBe(1)
  expect(entityTransformRun).toBe(2)
  expect(worldTransformRun).toBe(1)
  expect(reactStoreComputedRun).toBe(1)
  
  expect(test.player.name).toBe('Fraktar')

  publicContext.presentPatch(migration.forward.map((operation: any) => ({
    ...operation,
    path: toInstance(model).$id + operation.path
  })))

  expect(test.player.name).toBe('Fraktos')

  expect(playerTransformRun).toBe(2)
  expect(entityTransformRun).toBe(2)
  expect(worldTransformRun).toBe(1)
  expect(reactStoreComputedRun).toBe(2)
})