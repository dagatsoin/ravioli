import { getGlobal } from '../src/utils/utils'
import { observable } from '../src/lib/observable'
import { toInstance, toLeaf, noop } from '../src/helpers'
import { autorun, string, Reaction } from '../src'

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

  // Check array structure
  const modelInstance = toInstance(model)
  const inventoryInstance = toInstance(modelInstance.$data.inventory)
  const swordInstance = toInstance(model.inventory[0])
  const leafInstance = toLeaf(swordInstance.$data.id)
  expect(inventoryInstance.$parent).toBe(modelInstance)
  expect(swordInstance.$parent).toBe(inventoryInstance)
  expect(leafInstance.$parent).toBe(swordInstance)

  // Check map structure
  const tokensMapInstance = toInstance(modelInstance.$data.tokens)
  const tokenInstance = toLeaf((tokensMapInstance as any).$data.get('000'))
  expect(tokensMapInstance.$parent).toBe(modelInstance)
  expect(tokenInstance.$parent).toBe(tokensMapInstance)

  // Test nested object access
  autorun(() => {
    model.name
    model.stats
    model.stats.health
    const paths  = Array.from(context.snapshot.observedPaths.values())[0]
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
    const paths  = Array.from(context.snapshot.observedPaths.values())[0]
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
    const paths  = Array.from(context.snapshot.observedPaths.values())[0]
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
    const paths  = Array.from(context.snapshot.observedPaths.values())[0]
    expect(paths.map(p => {
      const segments = p.split('/').filter(s => !!s.length)
      segments.shift()
      return '/' + segments.join('/')
    })).toEqual([ '/stats', '/name' ])
  })
  
  // Test with array
  autorun(() => {
    model.inventory
    const paths  = Array.from(context.snapshot.observedPaths.values())[0]
    expect(paths.map(p => {
      const segments = p.split('/').filter(s => !!s.length)
      segments.shift()
      return '/' + segments.join('/')
    })).toEqual([ '/inventory' ])
  })

  // Test nested object access
  autorun(() => {
    model.achievements
    const paths  = Array.from(context.snapshot.observedPaths.values())[0]
    expect(paths.map(p => {
      const segments = p.split('/').filter(s => !!s.length)
      segments.shift()
      return '/' + segments.join('/')
    })).toEqual([ '/achievements' ])
  })
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
})
