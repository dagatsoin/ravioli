import {
  applySnapshot,
  clone,
  getNode,
  getSnapshot,
  INodeInstance,
  isInstance,
  isNode,
  map,
  number,
  object,
  string,
} from '../src'
import * as STManager from '../src/STManager'

test('Create empty instance', function() {
  const Players = map(string())
  const players = Players.create()
  expect(players.size).toBe(0)
})

test('Create map of primitives', function() {
  const Players = map(string())
  const players = Players.create([
    [0, 'Fraktar'],
    [1, 'Dreadbond'],
    [2, 'Elwein'],
  ])
  expect(isInstance(players)).toBeTruthy()
  expect(isNode(players)).toBeTruthy()
  expect(players.get(0)).toBe('Fraktar')
  // test with passing a map
  const m = new Map([
    [0, 'Fraktar'],
    [1, 'Dreadbond'],
    [2, 'Elwein'],
  ])
  const players2 = Players.create(m)
  expect(players2.get(0)).toBe('Fraktar')
})

test('Can be created during a transaction', function() {
  STManager.transaction(() => {
    const a = map(string()).create([[0, 'a']])
    expect(a.get(0)).toEqual('a')
  })
})

test('Create map of objects', function() {
  const Players = map(
    object({
      name: string(),
      level: number(),
      hp: number(),
    })
  )
  const players = Players.create([
    [
      0,
      {
        name: 'Fraktar',
        level: 1,
        hp: 10,
      },
    ],
  ])

  expect(isInstance(players)).toBeTruthy()
  expect(isNode(players)).toBeTruthy()
  expect(players.get(0)!.name).toBe('Fraktar')
})

test('set value', function() {
  // Map with primitives
  const model0 = object({ map: map(string()) })
  const instance0 = model0.create()
  STManager.transaction(() => {
    // Set wrong value
    instance0.map = new Map([
      [0, { name: 'Fraktar' }],
      [1, { name: 'Elweïn' }],
    ]) as any
    expect((instance0.map as any).size).toBe(0)
    // Set right value
    instance0.map = new Map([
      [0, 'a'],
      [1, 'b'],
    ])
    expect(instance0.map.size).toBe(2)
  })
  // Map with object
  const model1 = object({ map: map(object({ name: string() })) })
  const instance1 = model1.create()
  STManager.transaction(() => {
    // Set wrong value
    instance1.map = new Map([
      [0, 'a'],
      [1, 'b'],
    ]) as any
    expect((instance1.map as any).size).toBe(0)
    // Set right value
    instance1.map = new Map([
      [0, { name: 'Fraktar' }],
      [1, { name: 'Elweïn' }],
    ])
    expect(instance1.map.size).toBe(2)
    expect(instance1.map.get(0)).toEqual({ name: 'Fraktar' })
  })
})

test('get value', function() {
  const Players = map(string())
  const players = Players.create([
    [0, 'Fraktar'],
    [1, 'Dreadbond'],
    [2, 'Elwein'],
  ])
  expect(getNode(players).$value.get(0)).toBe('Fraktar')
  expect(getNode(players).$value.get(1)).toBe('Dreadbond')
  expect(getNode(players).$value.get(2)).toBe('Elwein')
})

test('clone', function() {
  const Players = map(string())
  const players = Players.create([
    [0, 'Fraktar'],
    [1, 'Dreadbond'],
    [2, 'Elwein'],
  ])

  const cloned = clone(players)

  expect(Array.from(cloned.values())).toEqual([
    'Fraktar',
    'Dreadbond',
    'Elwein',
  ])
})

test('attach', function() {
  function getPath(node: INodeInstance<any>) {
    return node.$path.substr(node.$path.indexOf('/'))
  }
  const model = object({ map: map(object({ name: string() })) })
  const instance = model.create()
  const arrNode = getNode(instance.map)
  expect(getPath(arrNode)).toBe('/map')
  STManager.transaction(() => {
    instance.map = new Map([
      [0, { name: 'Fraktar' }],
      [1, { name: 'Elweïn' }],
    ])
  })
  expect(getPath(getNode(instance.map.get(0)))).toBe('/map/0')
})

test('take snapshot', function() {
  const Players = map(string())
  const players = Players.create([
    [0, 'Fraktar'],
    [1, 'Dreadbond'],
    [2, 'Elwein'],
  ])
  expect(getSnapshot(players)).toEqual([
    [0, 'Fraktar'],
    [1, 'Dreadbond'],
    [2, 'Elwein'],
  ])
})

test('apply snapshot', function() {
  const Players = map(string())

  const players = Players.create()

  STManager.transaction(() => {
    applySnapshot(players, [
      [0, 'Fraktar'],
      [1, 'Dreadbond'],
      [2, 'Elwein'],
    ])
    expect(players.get(0)).toBe('Fraktar')
  })
});

describe('Map methods', function() {
  const Players = map(
    object({
      name: string(),
      level: number(),
      hp: number(),
    })
  )
  let players: typeof Players.Type

  beforeEach(() => {
    players = Players.create([
      [
        0,
        {
          name: 'Fraktar',
          level: 1,
          hp: 8,
        },
      ],
      [
        1,
        {
          name: 'Elwein',
          level: 2,
          hp: 4,
        },
      ],
      [
        2,
        {
          name: 'Dreadbond',
          level: 2,
          hp: 5,
        },
      ],
    ])
  })

  test('clear', function() {
    expect(players.size).toBe(3)
    STManager.transaction(() => players.clear())
    expect(players.size).toBe(0)
  })
  test('delete', function() {
    expect(players.size).toBe(3)
    STManager.transaction(() => players.delete(2))
    expect(players.size).toBe(2)
  })
  test('forEach', function() {
    STManager.transaction(() => players.forEach(value => value.level++))
    expect(players.get(0)!.level).toBe(2)
  })
  test('get', function() {
    expect(players.get(0)!.level).toBe(1)
  })
  test('has', function() {
    expect(players.has(0)).toBeTruthy()
  })
  test('set', function() {
    STManager.transaction(() => {
      players.set(3, { name: 'Ghost', level: 4, hp: 8 })
    })
    expect(players.get(3)!.name).toBe('Ghost')
  })
  test('size', function() {
    expect(players.size).toBe(3)
  })
  test('entries', function() {
    expect(Array.from(players.entries())).toEqual([
      [
        0,
        {
          name: 'Fraktar',
          level: 1,
          hp: 8,
        },
      ],
      [
        1,
        {
          name: 'Elwein',
          level: 2,
          hp: 4,
        },
      ],
      [
        2,
        {
          name: 'Dreadbond',
          level: 2,
          hp: 5,
        },
      ],
    ])
  })
  test('keys', function() {
    expect(Array.from(players.keys())).toEqual([0, 1, 2])
  })
  test('values', function() {
    expect(Array.from(players.values())).toEqual([
      {
        name: 'Fraktar',
        level: 1,
        hp: 8,
      },
      {
        name: 'Elwein',
        level: 2,
        hp: 4,
      },
      {
        name: 'Dreadbond',
        level: 2,
        hp: 5,
      },
    ])
  })
})
