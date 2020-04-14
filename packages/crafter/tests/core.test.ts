import { observable, autorun, getGlobal } from "../src"

test("Crafter tracks leaf access not node access", function() {
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