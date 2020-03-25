import { CrafterContainer, getGlobal, object, string, autorun, toInstance, createTransformer, number, array, identifier, boolean } from "crafter/src"
import { reference } from "crafter/src/lib/reference"
import { component } from "../src"

test("Minimal poc of reactive representation", function() {
  const privateContext = new CrafterContainer()
  const publicContext = getGlobal().$$crafterContext as CrafterContainer

  // The model is in a private context.
  const model = object({name: string()}).create({name: 'Fraktos'}, {context: privateContext})
  
  // A model transformation is a pure fonction of the model.
  const representationTransformation = (m: typeof model): any => ({nickName: m.name})

  // We turn this computation into a reactive transformer.
  // This transformation is used in the public context but its source is private context
  // As a result, it will never be stale even if its source changes.
  const reactiveRepresentationTransformation = createTransformer(representationTransformation, {
    contexts: {
      source: privateContext,
      output: publicContext
    }
  })

  // Our goal is that external world uses this representation as a normal observable object.
  // So we put it in a computed reaction to make sure to keep the ref alive by preventing to recreate it at each reaction.
  // This way we can traverse it just with dot notation instead to call a recomputation
  // like with a normal transform `reactiveRepresentationTransformation(model)`
  // - keeps isolation between public/private context
  // - allow easy migration (copy past from vanilla js will work because no specific api is used)
  // - allow serialization (dot path can be serialized)

  const state = {
    get representation(): {
      nickName: string
    } {
      return reactiveRepresentationTransformation(model)
    }
  }
  
  let render
  // Simulate a component

  // This autorun of the pulic context will never be stale when the model of the private context will change
  // as this dependencies are from the `reactiveRepresentationTransformation` which is in public context.
  autorun(() => render = `<h1>Profile of ${state.representation.nickName}</h1>`)

  // Initial value of the component
  expect(render).toBe(`<h1>Profile of Fraktos</h1>`)
  
  privateContext.transaction(() => model.name = 'Fraktar')

  // Both transformer and autorun from public context are still valid.
  expect(publicContext.snapshot.observerGraph.nodes.every(node => !node.isStale)).toBeTruthy()
  expect(render).toBe(`<h1>Profile of Fraktos</h1>`)

  // Present the patch of the private context to the public context.
  publicContext.presentPatch([{path: `${toInstance(model).$id}/name`, op: 'replace', value: 'Fraktar'}])

  // The patch made both the autorun and the transformation of the public context to be stale and to update.
  // The render is now up to date.
  expect(render).toBe(`<h1>Profile of Fraktar</h1>`)
})

test("Use multiple transformers for a representation", function(){
  // Model

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

  const Model = object({
    isConnected: boolean(),
    player: Player,
    world: World
  })

  const privateContext = new CrafterContainer()
  const publicContext = getGlobal().$$crafterContext

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
  }, {contexts: {source: privateContext, output: publicContext}})

  let entityTransformRun = 0
  const entityRep = createTransformer((entity: typeof Entity['Type']) => {
    entityTransformRun++
    return {
      id: entity.id,
      inventory: entity.inventory.map(e => ({id: e.id, quantity: e.quantity})),
      health: entity.stats.health,
      name: entity.name
    }
  }, {contexts: {source: privateContext, output: publicContext}})

  let worldTransformRun = 0
  const worldRep = createTransformer((world: typeof World['Type']) => {
    worldTransformRun++
    return {
      entities: world.entities
        .filter(({id}) => id !== 'player0')
        .map(entityRep)
    }
  }, {contexts: {source: privateContext, output: publicContext}})

  let reactStoreComputedRun = 0
  const reactStore = (model: typeof Model['Type']) => {
    reactStoreComputedRun++
    return {
      isAppOnline: model.isConnected,
      player: playerRep(model.player),
      world: worldRep(model.world)
    }
  }

  const snapshot = {
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
  }

  const test = component(Model)
    .addAcceptor('setName', model => ({
      acceptor({id}: {id: string}) {
        return !!model.world.entities.find(({id: _id}) => _id === id)
      },
      mutator({id, name}: {id: string, name: string}) {
        model.world.entities.find(({id: _id}) => _id === id)!.name = name
      }
    }))
    .addActions({setName: 'setName'})
    .setTransformation('default', reactStore)
    .create(snapshot, { contexts: {public: publicContext, private: privateContext}})

  let render: typeof test['state']['representation']

  // React app
  autorun(() => {
    render = test.state.representation
  })

  expect(playerTransformRun).toBe(1)
  expect(entityTransformRun).toBe(2)
  expect(worldTransformRun).toBe(1)
  expect(reactStoreComputedRun).toBe(1)

  expect(render!.player.name).toBe('Fraktar')

  test.actions.setName({id: 'player0', name: 'Fraktos'})

  expect(playerTransformRun).toBe(2)
  expect(entityTransformRun).toBe(2)
  expect(worldTransformRun).toBe(1)
  expect(reactStoreComputedRun).toBe(2)

  expect(render!.player.name).toBe('Fraktos')
})