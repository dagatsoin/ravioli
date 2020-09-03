// import { getGlobal } from '../src/utils/utils'
// import { observable } from '../src/lib/observable'
import { toInstance,/*  toLeaf, noop ,*/ getSnapshot, getContext, applySnapshot } from '../src/helpers'
// import { autorun, string, Reaction } from '../src'
// import { Graph } from '../src/Graph'
import { number, object, string, StepLifeCycle, Migration, autorun } from '../src'

beforeEach(function() {
  (global as any).$$crafterContext.clearContainer()
})

describe('Data im/mutability', function(){
  const model = object({
    name: string('Fraktar'),
    level: number(1),
    stats: object({
      force: number(1),
      health: number(1)
    })
  }).create()
  const context = getContext(toInstance(model))
  const initialSnapshot = getSnapshot(model)
  context.step(() => model.stats.force++)

  test('value mutability', function() {
    expect(model.stats.force).toBe(2)
  })
  test('snapshot immutability', function(){
    expect(getSnapshot(model)).not.toEqual(initialSnapshot)
  })
})

describe('Migration generation', function() {
  describe('- All children value are replaced', function() {
    test('parent node writes the global mutation in the context', function() {
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
                force: 2,
                health: 10
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
        force: 2
      })
    })
  })
  describe('- Some children did not changed', function() {
    test('parent node writes the details of the mutation in the context', function() {
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
        expect(toInstance(toInstance(player.stats).$data.health).$state.didChange).toBeTruthy()
        expect(toInstance(player).$$container.snapshot.migration).toEqual({
          forward: [
            {
              op: 'replace',
              value: 10,
              path: '/player2/stats/health'
            }
          ],
          backward: [
            {
              op: 'replace',
              value: 1,
              path: '/player2/stats/health'
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
  })
})
 
describe('Reactivity', function() {
  const model = object({
    name: string('Fraktar'),
    level: number(1),
    stats: object({
      force: number(1),
      health: number(1)
    })
  }).create()
  const context = getContext(toInstance(model))
  const initialSnapshot = getSnapshot(model)

  // autorun list to dispose at the end
  const disposers: Array<()=>void> = []

  afterEach(function() {
    disposers.forEach(d => d())
    applySnapshot(model, initialSnapshot)
  })

  describe('Node replacement', function() {
    test('- triggers observer tracking a leaf with changed value.', function() {
      let run = 0
      disposers.push(autorun(() => {
        // Observe the player
        model.stats.health
        run++
      }))
      const cb = () => {
        context.removeStepListener(StepLifeCycle.WILL_PROPAGATE, cb)
      }
      context.addStepListener(StepLifeCycle.WILL_PROPAGATE, cb)
      context.step(() => model.stats = { force: 1, health: 10})
      expect(run).toEqual(2)
    })
    test('- does not trigger observer tracking a leaf with unchanged value.', function() {
      let run = 0
      autorun(() => {
        // Observe the player
        model.stats.health
        run++
      })
      context.step(() => model.stats = { force: 2, health: 1})
      expect(run).toEqual(1)
    })
    test.todo('- triggers an observer tracking the node itself if its value changed.')
    test.todo('- does not trigger an observer tracking the node itself if its value did not changed.')
  })
   describe('Leaf replacement', function() {
    test.todo('- does not trigger an observable tracking the parent node.')
    test('- triggers observer if the value changed.', function() {
      let run = 0
      autorun(() => {
        // Observe the player
        model.stats.health
        run++
      })
      context.step(() => model.stats = { force: 1, health: 10})
      expect(run).toEqual(2)
    })
    test('- does not trigger observer if the value did not change.', function() {
      let run = 0
      autorun(() => {
        // Observe the player
        model.stats.health
        run++
      })
      context.step(() => model.stats = { force: 2, health: 1})
      expect(run).toEqual(1)
    })
  })
})

/*
test("Crafter tracks leaf accesses", function() {
  const context = getGlobal().$$crafterContext
  context.clearContainer()
  const model = observable({
    name: "Fraktar",
    stats: {
      health: 10
    },
    inventory: [
      {id: "sword", quantity: 1},
      {id: "shield", quantity: 1}
    ],
    titles: ["Lord of the Pump", "Black cat"],
    achievements: new Map([
      ['firstBlood', {title: "First blood"}],
      ['firstQuest', {title: "First quest"}],
    ]),
    tokens: new Map([
      ['000', "login"],
      ['001', "logout"]
    ])
  })

  // Test nested object access
  autorun(() => {
    model.name
    model.stats
    model.stats.health
    const paths  = Array.from(context.snapshot.spiedObserversDependencies.values())[0]
    expect(paths.map(p => {
      const segments = p.split('/').filter(s => !!s.length)
      segments.shift()
      return '/' + segments.join('/')
    })).toEqual([ '/name', '/stats/health' ])
  })
  
  // Test with array
  autorun(() => {
    model.inventory
    model.inventory[0].id
    model.titles[1]
    const paths  = Array.from(context.snapshot.spiedObserversDependencies.values())[0]
    expect(paths.map(p => {
      const segments = p.split('/').filter(s => !!s.length)
      segments.shift()
      return '/' + segments.join('/')
    })).toEqual([ '/inventory/0/id', '/titles/1' ])
  })

  // Test nested object access
  autorun(() => {
    model.achievements.get('firstBlood')!.title
    model.tokens.get('000')
    model.tokens.get('001')
    const paths  = Array.from(context.snapshot.spiedObserversDependencies.values())[0]
    expect(paths.map(p => {
      const segments = p.split('/').filter(s => !!s.length)
      segments.shift()
      return '/' + segments.join('/')
    })).toEqual([ '/achievements/firstBlood/title', '/tokens/000', '/tokens/001' ])
  })
})

test("Crafter tracks node accesses", function() {
  const context = getGlobal().$$crafterContext
  context.clearContainer()
  const model = observable({
    name: "Fraktar",
    stats: {
      health: 10
    },
    inventory: [
      {id: "sword", quantity: 1},
      {id: "shield", quantity: 1}
    ],
    titles: ["Lord of the Pump", "Black cat"],
    achievements: new Map([
      ['firstBlood', {title: "First blood"}],
      ['firstQuest', {title: "First quest"}],
    ]),
    tokens: new Map([
      ['000', "login"],
      ['001', "logout"]
    ])
  })

  // Test nested object access
  autorun(() => {
    model.stats
    model.name
    const paths  = Array.from(context.snapshot.spiedObserversDependencies.values())[0]
    expect(paths.map(p => {
      const segments = p.split('/').filter(s => !!s.length)
      segments.shift()
      return '/' + segments.join('/')
    })).toEqual([ '/stats', '/name' ])
  })
  
  // Test with array
  autorun(() => {
    model.inventory
    const paths  = Array.from(context.snapshot.spiedObserversDependencies.values())[0]
    expect(paths.map(p => {
      const segments = p.split('/').filter(s => !!s.length)
      segments.shift()
      return '/' + segments.join('/')
    })).toEqual([ '/inventory' ])
  })

  // Test nested object access
  autorun(() => {
    model.achievements
    const paths  = Array.from(context.snapshot.spiedObserversDependencies.values())[0]
    expect(paths.map(p => {
      const segments = p.split('/').filter(s => !!s.length)
      segments.shift()
      return '/' + segments.join('/')
    })).toEqual([ '/achievements' ])
  })
})

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