import { observable } from '../src/lib/observable'
import { getTypeFromValue } from "../src/lib/getTypeFromValue"
import { toInstance, getSnapshot, sync, getChildKey, getTargetKey, isOwnLeafPath, path } from '../src/helpers'
import { getGlobal } from '../src'

test("format path", function() {
  expect(path("/", "/player", "stats")).toBe("/player/stats")
  expect(path("/", "/", "player")).toBe("/player")
  expect(path("/player", "/stats")).toBe("/player/stats")
  expect(path("/player", "/stats/")).toBe("/player/stats")
})

test("getTargetKey", function(){
  expect(getTargetKey("/")).toBe("/")
  expect(getTargetKey("/player")).toBe("player")
  expect(getTargetKey("/player/stats")).toBe("stats")
})

test("getChildKey", function(){
  expect(getChildKey("/", "/player/stats/health")).toBe("player")
  expect(getChildKey("/player/", "/player/stats/health")).toBe("stats")
  expect(getChildKey("/player/stats/", "/player/stats/health")).toBe("health")
})

test("isOwnLeafPath", function(){
  expect(isOwnLeafPath("/", "/player")).toBeTruthy()
  expect(isOwnLeafPath("/player", "/player/stats")).toBeTruthy()
  expect(isOwnLeafPath("/player", "/player/stats/health")).toBeFalsy()
})

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