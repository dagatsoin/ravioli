/* import { autorun, object, array, getContext, toInstance, getSnapshot, number, string, boolean, identifier, computed, CrafterContainer, getGlobal, toNode, ObserverType, IInstance } from "../src"
import { createTransformer } from "../src/transformer"
import { reference } from "../src/lib/reference"

test("transform to primitive", function() {
  const Model = object({count: number(0)})
  const model = Model.create()
  let count

  const transforModel = createTransformer((m: typeof Model['Type']) => m.count, {isBoxed: true})

  autorun(() => {
    count = transforModel(model)
  })

  getContext(toInstance(model)).transaction(() => {
    model.count++
  })

  expect(count).toEqual(1)
})

/**
 * Special case: recreation an array during the transformation.
 * This should result in an observable array.
 *//*
test("transform to observable object", function() {
  const Model = object({
    name: string(),
    inventory: array(object({id: string(), quantity: number(), isEquiped: boolean()}))
  })
  const model = Model.create({
    name: 'fraktar',
    inventory: [{id: 'sword', quantity: 0, isEquiped: false}]
  })

  let test: {
    name: string
    stuff: {name: string}[]
  } = {
    name: '',
    stuff: []
  }

  const transforModel = createTransformer((m: typeof Model['Type']) => ({
    name: m.name,
    stuff: m.inventory
      .filter(item => item.isEquiped)
      .map(({id}) => ({name: id}))
  }))

  autorun(() => {
    test = transforModel(model)
  })

  expect(test.name).toEqual('fraktar')
  expect(test.stuff.slice()).toEqual([])

  getContext(toInstance(model)).transaction(() => {
    model.inventory[0].isEquiped = true
  })

  expect(test.name).toEqual('fraktar')
  expect(test.stuff.slice().length).toBe(1)
  expect(test.stuff.slice()).toEqual([{name: 'sword'}])
})

test("transform to non observable object", function() {
  const Model = object({
    name: string(),
    age: number()
  })
  const model = Model.create({
    name: 'fraktar',
    age: 38
  })
  let profil

  const transforModel = createTransformer((m: typeof Model['Type']) => ({
    name: m.name,
    age: m.age
  }), {isBoxed: true})

  autorun(() => {
    profil = transforModel(model)
  })

  getContext(toInstance(model)).transaction(() => {
    model.name = 'elwein'
    model.age = 37
  })

  expect(profil).toEqual({
    name: 'elwein',
    age: 37
  })
})

test("test with model with arrays to non observable object", function() {
  const Model = object({
    players: array(string()),
    levels: array(number())
  })
  const model = Model.create()
  let stats

  const toStats = createTransformer((m: typeof Model['Type']) => ({
    players: m.players.length,
    averageLevel: (m.levels.reduce((s, l) => s + l, 0)/m.players.length) || 0
  }))

  autorun(() => {
    stats = toStats(model)
  })

  getContext(toInstance(model)).transaction(() => {
    model.players.push('elwein')
    model.levels.push(37)
  })

  expect(stats).toEqual({
    players: 1,
    averageLevel: 37
  })
})

test("run only when input changes", function() {
  const model0 = object({count: number(0)}).create()
  const model1 = object({count: number(0)}).create()
  
  let countOfModel0
  let countOfModel1

  let autorunRun = 0
  let transformRun = 0
  const transform = createTransformer((m0: any) => {
    transformRun++
    return m0.count
  })
  autorun(() => {
    autorunRun++
    countOfModel0 = transform(model0)
    countOfModel1 = model1.count
  })
  getContext(toInstance(model0)).transaction(() => {
    model0.count++
    model1.count++
  })

  expect(countOfModel0).toBe(1)
  expect(countOfModel1).toBe(1)
  expect(autorunRun).toBe(2)
  expect(transformRun).toBe(2)

  getContext(toInstance(model0)).transaction(() => {
    model1.count++
  })

  expect(countOfModel0).toBe(1)
  expect(countOfModel1).toBe(2)
  expect(autorunRun).toBe(3)
  expect(transformRun).toBe(2)
})

test("nested tranformation", function(){
  const Model = object({
    players: array(string()),
    levels: array(number())
  })
  const model = Model.create()
  let stats

  const toAverageLevel = createTransformer((levels: number[]) => (levels.reduce((s, l) => s + l, 0)/levels.length) || 0)

  const toStats = createTransformer((m: typeof Model['Type']) => ({
    players: m.players.length,
    averageLevel: toAverageLevel(m.levels)
  }))

  autorun(() => {
    stats = toStats(model)
  })

  getContext(toInstance(model)).transaction(() => {
    model.players.push('elwein')
    model.levels.push(37)
  })

  expect(stats).toEqual({
    players: 1,
    averageLevel: 37
  })
})

test("transform", function() {
  const Node = object({
    id: number()
  })

  const Edge = object({
    source: number(),
    target: number()
  })

  const Graph = object({
    edges: array(Edge),
    nodes: array(Node),
  })

  const graph = Graph.create()

  const states: any[] = []

  const serializeState = createTransformer((s: typeof Graph['Type']) => ({
      nodes: s.nodes.map(serializeBox as any),
      edges: s.edges.map(serializeArrow as any),
  }), {isBoxed: true})


  const serializeBox = createTransformer((node: typeof Node) => getSnapshot(node), {isBoxed: true})

  const serializeArrow = createTransformer((edge: typeof Edge) => getSnapshot(edge), {isBoxed: true})

  autorun(() => {
    const s = serializeState(graph)
    states.push(s)
})

  getContext(toInstance(graph)).transaction(() => {
    graph.nodes.push(Node.create({id: 0}))
    graph.nodes.push(Node.create({id: 1}))
    graph.edges.push(Edge.create({source: 0, target: 1}))
  })
  getContext(toInstance(graph)).transaction(() => {
    graph.edges.push(Edge.create({source: 1, target: 0}))
  })
  expect(states.length).toEqual(3)
  expect(states[1].nodes).toEqual([{id: 0}, {id: 1}])
})

test("Defer transformation by using two contexts", function() {
  getGlobal().$$crafterContext.clearContainer()
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

  // Instantiate

  const model = Model.create({
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
  }, {context: privateContext})

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
  const reactStore = computed(() => {
    reactStoreComputedRun++
    return {
      isAppOnline: model.isConnected,
      player: playerRep(model.player),
      world: worldRep(model.world)
    }
  }, {contexts: {source: privateContext, output: publicContext}})

  let test: any

  // React app
  autorun(() => {
    test = reactStore.get()
  })

  let migration: any

  expect(playerTransformRun).toBe(1)
  expect(entityTransformRun).toBe(2)
  expect(worldTransformRun).toBe(1)
  expect(reactStoreComputedRun).toBe(1)

  privateContext.transaction(() => {
    model.player.entity.name = 'Fraktos'
    migration = toNode(model).$migration
  })

  expect(playerTransformRun).toBe(1)
  expect(entityTransformRun).toBe(2)
  expect(worldTransformRun).toBe(1)
  expect(reactStoreComputedRun).toBe(1)
  
  expect(test.player.name).toBe('Fraktar')

  publicContext.presentPatch(migration.forward.map((command: any) => ({
    ...command,
    path: toInstance(model).$id + command.path
  })))

  expect(test.player.name).toBe('Fraktos')

  expect(playerTransformRun).toBe(2)
  expect(entityTransformRun).toBe(2)
  expect(worldTransformRun).toBe(1)
  expect(reactStoreComputedRun).toBe(2)

})

describe("Set id to the transformed view", function() {
  const context = getGlobal().$$crafterContext
  test("boxed value", function(){
    context.clearContainer()
    const transform = createTransformer((m) => m, {computedId: "customId"})
    const dispose = autorun(() => transform('foo'))
    expect(context.snapshot.dependencyGraph.nodes.find(n => n.type === ObserverType.Computed)!.id).toBe("customId")
    dispose()
  })
  test("observable value", function(){
    context.clearContainer()
    const transform = createTransformer((m) => ({foo: m}), {computedId: "customId", valueId: "valueId"})
    let value: IInstance<any>
    const dispose = autorun(() => value = toInstance(transform('foo')))
    expect(value!.$id).toBe("valueId")
    expect(context.snapshot.dependencyGraph.nodes.find(n => n.type === ObserverType.Computed)!.id).toBe("customId")
    dispose()
  })
}) */