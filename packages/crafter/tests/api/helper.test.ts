import { object, string, getContext, setValue, toInstance, number, getNextPart, getLastPart, isOwnLeafPath, makePath, reduceSnapshot, Command, Operation } from '../../src'

test("setValue of a root model", function(){
  const model = object({
    name: string("Fraktos"),
    stats: object({
      health: number()
    })
  }).create()
  getContext(toInstance(model)).step(() => setValue(model, { name: "Fraktar", stats: { health: 3 }} ))
  expect(toInstance(model).$value).toEqual({ name: "Fraktar", stats: { health: 3 }})
})


test("format path", function() {
  expect(makePath("/", "/player", "stats")).toBe("/player/stats")
  expect(makePath("/", "/", "player")).toBe("/player")
  expect(makePath("/player", "/stats")).toBe("/player/stats")
  expect(makePath("/player", "/stats/")).toBe("/player/stats")
})

test("getTargetKey", function(){
  expect(getLastPart("/")).toBe("/")
  expect(getLastPart("/player")).toBe("player")
  expect(getLastPart("/player/stats")).toBe("stats")
})

test("getChildKey", function(){
  expect(getNextPart("/", "/player/stats/health")).toBe("player")
  expect(getNextPart("/player/", "/player/stats/health")).toBe("stats")
  expect(getNextPart("/player/stats/", "/player/stats/health")).toBe("health")
})

test("isOwnLeafPath", function(){
  expect(isOwnLeafPath("/", "/player")).toBeTruthy()
  expect(isOwnLeafPath("/player", "/player/stats")).toBeTruthy()
  expect(isOwnLeafPath("/player", "/player/stats/health")).toBeFalsy()
})

test("reduce patch", function() {
  const patch: Command[] = [
    {op: Operation.push, path: "/player/inventory", value: [{id: "48646"}]},
    {op: Operation.replace, path: "/pets", value: [{id: "74455"}]},
    {op: Operation.replace, path:"/player/name", value: "Fraktos"},
    {op: Operation.replace, path:"/player/stats/health", value: 5},
    {op: Operation.replace, path:"/player/stats", value: { health: 5 }},
    {op: Operation.replace, path:"/player", value: {name: "Fraktos", stats: { health: 5 }}},
  ]
  expect(reduceSnapshot(patch)).toEqual([
    {op: Operation.push, path: "/player/inventory", value: [{id: "48646"}]},
    {op: Operation.replace, path: "/pets", value: [{id: "74455"}]},
    {op: Operation.replace, path:"/player", value: {name: "Fraktos", stats: { health: 5 }}},
  ])
})



/*
test('get type from value', function() {
  const type = getTypeFromValue({
    name: 'Fraktar',
    age: 18,
    inventory: [],
    surprise: undefined,
  })!

  expect(
    type.isValidSnapshot({
      name: 'Fraktar',
      age: 18,
      inventory: [
        {
          id: 'sword',
          quantity: 1,
        },
      ],
      surprise: undefined,
    })
  ).toBeTruthy()
})

test('get type from a map', function() {
  const value = {
    name: 'Fraktar',
    titles: new Map([
      ['bronze', 'noob'],
      ['gold', 'cheater'],
    ]),
  }
  const type = getTypeFromValue(value)
  expect(type.create(value).titles.size).toBe(2)
})

test('get type from an instance', function() {
  const source = observable({
    name: 'Fraktar',
    titles: new Map([
      ['bronze', 'noob'],
      ['gold', 'cheater'],
    ]),
  })
  const type = getTypeFromValue(source)
  expect(type.create(getSnapshot(toInstance(source))).titles.size).toBe(2)
})

it('should clone an observable and sync its value on each change', function() {
  const titles = new Map()
  titles.set('0', 'Noob')
  titles.set('1', 'Not so bad')
  const source = observable({
    name: 'Fraktar',
    inventory: [
      {
        id: 'sword',
        quantity: 2,
      },
    ],
    titles,
    questLog: {
      current: {
        id: 0,
        todo: ['dzdz', 'dzqd'],
      },
    },
  })
  const target = sync(source)

  expect(target.questLog.current.id).toBe(0)
  getGlobal().$$crafterContext.transaction(() => {
    source.questLog.current.id = 1
  })
  expect(target.questLog.current.id).toBe(1)
})
*/