import { observable, autorun, getGlobal, string, toInstance, Reaction, noop } from "../src"

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
  const s = string().create('Fraktar')
  const reaction = new Reaction(noop)
  reaction.observe(() => toInstance(s).$value)
  // Has registered
  expect(context.snapshot.dependencyGraph).toBe({
    edges: [{ target: reaction.id, source: toInstance(s).$id }],
    nodes: [s]
  })
  reaction.dispose()
  // Has unregistered
  expect(context.snapshot.dependencyGraph).toBe({
    edges: [],
    nodes: []
  })
})

test("graph", function() {
  const context = getGlobal().$$crafterContext
  test("simple graph", function(){
    const model = observable({
      name: "Fraktar",
      health: 1
    })
    const reaction = new Reaction(() => {})
    reaction.observe(() => model.name)
    expect(context.snapshot.dependencyGraph).toEqual({
      edges: [{target: reaction.id, source: toInstance(model).$data.name.$id}],
      nodes: [toInstance(model).$data.name]
    })
  })
})