// import { getGlobal } from '../src/utils/utils'
// import { observable } from '../src/lib/observable'
import { toInstance,/*  toLeaf, noop ,*/ getSnapshot, getContext, applySnapshot, getValue, setValue } from '../../src/helpers'
// import { autorun, string, Reaction } from '../src'
// import { Graph } from '../src/Graph'
import { number, object, string, StepLifeCycle, Migration, autorun } from '../../src'

beforeEach(function() {
  (global as any).$$crafterContext.clearContainer()
})

describe('Migration generation', function() {
  describe('- A node has been replaced', function() {
    /**
     * When a node is replaced, the command will be accepted
     * only if at least one of the sub value is different.
     */
    test('some value changed', function() {
      const player = object({
        name: string('Fraktar'),
        level: number(1),
        stats: object({
          health: number(1),
          force: number(1)
        })
      }).create(undefined, {id: "player"})
      const context = getContext(toInstance(player))
      const cb = () => {
        context.removeStepListener(StepLifeCycle.WILL_END, cb)
        expect(context.snapshot.migration).toEqual(toInstance(player.stats).$state.migration)
        expect(context.snapshot.migration).toEqual({
          forward: [
            {
              op: 'replace',
              value: {
                health: 10,
                force: 1
              },
              path: '/player/stats'
            }
          ],
          backward: [
            {
              op: 'replace',
              path: '/player/stats',
              value: {
                force: 1,
                health: 1
              }
            }
          ]
        })
      }
      context.addStepListener(StepLifeCycle.WILL_END, cb)
      context.step(() => player.stats = {
        health: 10,
        force: 1
      })
    })
  
    test('no value changed', function() {
      const player = object({
        stats: object({
          health: number(1),
          force: number(1)
        })
      }).create(undefined, {id: "player2"})
      const context = getContext(toInstance(player))
      const cb = () => {
        context.removeStepListener(StepLifeCycle.WILL_END, cb)
        expect(toInstance(toInstance(player.stats).$data.force).$state.didChange).toBeFalsy()
        expect(toInstance(toInstance(player.stats).$data.health).$state.didChange).toBeFalsy()
        expect(toInstance(player).$$container.snapshot.migration).toEqual({
          forward: [],
          backward: []
        })
      }
      context.addStepListener(StepLifeCycle.WILL_END, cb)
      context.step(() => player.stats = {
        health: 1,
        force: 1
      })
    })
  })
})

describe('reactivity', function() {
  const player = object({
    name: string('Fraktar'),
    level: number(1),
    stats: object({
      health: number(1),
      force: number(1)
    })
  }).create()

  test('react on leaf change', function() {
    const dispose = autorun(function({isFirstRun}){
      player.stats.health
      if(!isFirstRun) expect(player.stats.health).toBe(2)
    })

    getContext(toInstance(player)).step(() => player.stats.health++)
    dispose()
  })

  test('react on node change, not on leaf change', function() {
    let run = 0
    const context = getContext(toInstance(player))
    const dispose = autorun(function(){
      player.stats
      run++
    })

    context.step(() => player.stats = {
      health: 10,
      force: 1
    })
    // Autorun ran twice, one for initialization, one when the node has changed. Not when the lead has changed.
    expect(run).toBe(2)
    dispose()
  })
})
/*
describe("create an updated observables graph", function() {
  const context = getGlobal().$$crafterContext

  const model = observable({
    name: "Fraktar",
    stats: {
      health: 10
    },
    inventory: [
      { id: "sword", quantity: 1},
      { id: "shield", quantity: 1}
    ],
    titles: new Map([
      ['0', 'Grabe digger'],
      ['1', 'Stone eater']
    ])
  })

  beforeEach(function() {
    toInstance(model).$applySnapshot({
      name: "Fraktar",
      stats: {
        health: 10
      },
      inventory: [
        { id: "sword", quantity: 1},
        { id: "shield", quantity: 1}
      ],
      titles: new Map([
        ['0', 'Grabe digger'],
        ['1', 'Stone eater']
      ])
    })
    context.clearContainer()
  })

  // observable ids
  const modelId = toInstance(model).$id
  const nameId = toInstance(toInstance(model).$data.name).$id
  const inventoryId = toInstance(toInstance(model).$data.inventory).$id
  const swordId = toInstance(toInstance(model).$data.inventory[0]).$id
  const shieldId = toInstance(toInstance(model).$data.inventory[1]).$id
  const titleId = toInstance(toInstance(model).$data.titles).$id
  const title0Id = toInstance(model).$data.titles.keys()[0]
  const title1Id = toInstance(model).$data.titles.keys()[1]

  function getUpdatedObservableGraph(): Graph<{$id: string, $path: string}> {
    const graph = context.snapshot.updatedObservablesGraph
    return {
      edges: [...graph.edges],
      nodes: graph.nodes.map(({$id, $path}) => ({$id, $path}))
    }
  }

  test.todo("replace a object node value")
  test.todo("replace an array node value")
  test.todo("replace a map node value")
  test("replace a leaf value", function() {
    context.transaction(function(){
      model.name = "Fraktos"
      expect(getUpdatedObservableGraph()).toEqual({
        edges: [
          {source: nameId, target: modelId}
        ],
        nodes: [
          {$id: nameId, $path: "/name"}
        ]
      })
    })
  })
  test.todo("array order command")
  test.todo("array mutation command without length change")
  test.todo("array mutation command with inferior length change")
  test.todo("array mutation command with superior length change")
  test.todo("map clear command")
  test.todo("map set command without size change")
  test.todo("map set command with superior size change")
  test.todo("map set command with inferior size")
})

test("leaf un/registers as observable in the container graph when start/finish to be observed", function() {
  const context = getGlobal().$$crafterContext
  context.clearContainer()
  const s = toLeaf(string().create('Fraktar'))
  const reaction = new Reaction(noop)
  reaction.observe(() => toInstance(s).$value)
  // Has registered
  expect(context.snapshot.dependencyGraph).toEqual({
    edges: [{ target: reaction.id, source: toInstance(s).$id }],
    nodes: [reaction, s]
  })
  reaction.dispose()
  // Has unregistered
  expect(context.snapshot.dependencyGraph).toEqual({
    edges: [],
    nodes: []
  })
})

test("node un/registers as observable in the container graph when start/finish to be observed", function() {
  const context = getGlobal().$$crafterContext
  context.clearContainer()
  const model = observable({
    player: {
      name: "Fraktar"
    }
  })
  const reaction = new Reaction(noop)
  reaction.observe(() => model.player)
  // Has registered
  // Jest internal tries to mutate the object, bypass the error using a transaction
  context.transaction(() => {
    expect(context.snapshot.dependencyGraph).toEqual({
      edges: [{ target: reaction.id, source: toInstance(model.player).$id }],
      nodes: [reaction, model.player]
    })
    reaction.dispose()
    // Has unregistered
    expect(context.snapshot.dependencyGraph).toEqual({
      edges: [],
      nodes: []
    })
  })
}) */