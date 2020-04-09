import { map } from "../src/map/factory"
import { string, number } from "../src/Primitive"
import { isInstance } from "../src/lib/Instance"
import { isNode } from "../src/lib/isNode"
import { object } from "../src/object/factory"
import { toNode, clone, toInstance, getContext } from "../src/helpers"
import { INodeInstance } from "../src/lib/INodeInstance"
import { getGlobal } from '../src/utils/utils'

test('Create empty instance', function() {
  const Players = map(string())
  const players = Players.create()
  expect(players.size).toBe(0)
})

test('Create map of primitives', function() {
  const Players = map(string())
  const players = Players.create([
    ['0', 'Fraktar'],
    ['1', 'Dreadbond'],
    ['2', 'Elwein'],
  ])
  expect(isInstance(players)).toBeTruthy()
  expect(isNode(players)).toBeTruthy()
  expect(players.get('0')).toBe('Fraktar')
  // test with passing a map
  const m = new Map([
    ['0', 'Fraktar'],
    ['1', 'Dreadbond'],
    ['2', 'Elwein'],
  ])
  const players2 = Players.create(m)
  expect(players2.get('0')).toBe('Fraktar')
})

test('Can be created during a transaction', function() {
  const context = getGlobal().$$crafterContext
  context.transaction(() => {
    const a = map(string()).create([['0', 'a']])
    expect(a.get('0')).toEqual('a')
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
  expect(players.get('0')!.name).toBe('Fraktar')
})

test('set value', function() {
  // Map with primitives
  const model0 = object({ map: map(string()) })
  const instance0 = model0.create()
  getContext(toInstance(instance0)).transaction(() => {
    instance0.map = new Map([
      ['0', 'a'],
      ['1', 'b'],
    ])
    expect(instance0.map.size).toBe(2)
  })
  // Map with object
  const model1 = object({ map: map(object({ name: string() })) })
  const instance1 = model1.create()
  getContext(toInstance(instance1)).transaction(() => {
    instance1.map = new Map([
      ['0', { name: 'Fraktar' }],
      ['1', { name: 'Elweïn' }],
    ])
    expect(instance1.map.size).toBe(2)
    expect(instance1.map.get('0')).toEqual({ name: 'Fraktar' })
  })
})

test('get value', function() {
  const Players = map(string())
  const players = Players.create([
    ['0', 'Fraktar'],
    ['1', 'Dreadbond'],
    ['2', 'Elwein'],
  ])
  expect(toNode<typeof Players['Type']>(players).$value.get('0')).toBe('Fraktar')
  expect(toNode<typeof Players['Type']>(players).$value.get('1')).toBe(
    'Dreadbond'
  )
  expect(toNode<typeof Players['Type']>(players).$value.get('2')).toBe('Elwein')
})

test('clone', function() {
  const Players = map(string())
  const players = Players.create([
    ['0', 'Fraktar'],
    ['1', 'Dreadbond'],
    ['2', 'Elwein'],
  ])

  const cloned = clone(toNode<typeof Players['Type']>(players))

  expect(Array.from(cloned.values())).toEqual([
    'Fraktar',
    'Dreadbond',
    'Elwein',
  ])
})

describe('attach/detach', function() {
  function getPath(node: INodeInstance<any>): string {
    return node.$path.substr(node.$path.indexOf('/'))
  }

  test('attach', function() {
    const model = object({ map: map(object({ name: string() })) })
    const instance = model.create()
    const arrNode = toNode(instance.map)
    expect(getPath(arrNode)).toBe('/map')
    getContext(toInstance(instance)).transaction(() => {
      instance.map = new Map([
        ['0', { name: 'Fraktar' }],
        ['1', { name: 'Elweïn' }],
      ])
    })
    expect(getPath(toNode(instance.map.get('0')))).toBe('/map/0')
  })

  test('detach', function() {
    const model = map(object({ name: string() }))
    const instance = model.create([['0', { name: 'Fraktar' }]])
    const nodeRef = instance.get('0')
    getContext(toInstance(instance)).transaction(() => instance.delete(0))
    expect(toNode(nodeRef).$parent).toBeUndefined()
    expect(toNode(nodeRef).$parentKey).toBe('')
  })
})

describe('Basic JSON operation', function() {
  const World = object({
    entities: map(
      object({
        type: string(),
      })
    ),
  })

  let world: typeof World.Type

  beforeEach(() => {
    world = World.create({
      entities: new Map([
        [
          '0',
          {
            type: 'Player',
          },
        ],
        [
          '1',
          {
            type: 'Player',
          },
        ],
        [
          '2',
          {
            type: 'Item',
          },
        ],
        [
          '3',
          {
            type: 'Item',
          },
        ],
      ]),
    })
  })

  test('add', function() {
    getContext(toInstance(world)).transaction(() => {
      toNode(world).$applyOperation({
        op: 'add',
        path: '/entities/4',
        value: {
          type: 'Weapon',
        },
      })
    })
    expect(world.entities.get('4')?.type).toBe('Weapon')
  })

  test('replace', function() {
    getContext(toInstance(world)).transaction(() => {
      toNode(world).$applyOperation({
        op: 'replace',
        path: '/entities/3',
        value: {
          type: 'Weapon',
        },
      })
    })
    expect(world.entities.get('3')?.type).toBe('Weapon')
  })

  test('remove', function() {
    const removedNode = toNode(world.entities.get('3'))
    getContext(toInstance(world)).transaction(() => {
      toNode(world).$applyOperation({
        op: 'remove',
        path: '/entities/3',
      })
    })
    expect(world.entities.has(3)).toBeFalsy()
    expect(removedNode.$parent).toBeUndefined()
    expect(world.entities.size).toBe(3)
  })

  test('move', function() {
    const movedNode = toNode(world.entities.get('2'))
    getContext(toInstance(world)).transaction(() => {
      toNode(world).$applyOperation({
        op: 'move',
        from: '/entities/2',
        path: '/entities/1',
      })
    })
    expect(world.entities.get('1')?.type).toBe('Item')
    expect(movedNode.$parent).toBeUndefined()
  })

  test('copy', function() {
    getContext(toInstance(world)).transaction(() => {
      toNode(world).$applyOperation({
        op: 'copy',
        from: '/entities/2',
        path: '/entities/1',
      })
    })
    expect(world.entities.get('1')?.type).toBe('Item')
  })
})

test('value', function() {
  const Model = map(
    object({
      name: string(),
    })
  )
  const model = Model.create([['0', { name: 'Fraktar' }]])
  expect(toNode<typeof Model['Type']>(model).$value instanceof Map).toBeTruthy()
  expect(toNode<typeof Model['Type']>(model).$value.get('0')).toEqual({
    name: 'Fraktar',
  })
})

test('take snapshot', function() {
  const Players = map(string())
  const players = Players.create([
    ['0', 'Fraktar'],
    ['1', 'Dreadbond'],
    ['2', 'Elwein'],
  ])
  expect(
    Players.getSnapshot(toInstance<typeof Players['Type']>(players))
  ).toEqual([
    ['0', 'Fraktar'],
    ['1', 'Dreadbond'],
    ['2', 'Elwein'],
  ])
})

test('apply snapshot', function() {
  const Players = map(string())

  const players = Players.create()

  getContext(toInstance(players)).transaction(() => {
    Players.applySnapshot(toNode<typeof Players['Type']>(players), [
      ['0', 'Fraktar'],
      ['1', 'Dreadbond'],
      ['2', 'Elwein'],
    ])
    expect(players.get('0')).toBe('Fraktar')
  })
})

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
    getContext(toInstance(players)).transaction(() => players.clear())
    expect(players.size).toBe(0)
  })
  test('delete', function() {
    expect(players.size).toBe(3)
    getContext(toInstance(players)).transaction(() => players.delete(2))
    expect(players.size).toBe(2)
  })
  test('forEach', function() {
    getContext(toInstance(players)).transaction(() => players.forEach(value => value.level++))
    expect(players.get('0')!.level).toBe(2)
  })
  test('get', function() {
    expect(players.get('0')!.level).toBe(1)
  })
  test('has', function() {
    expect(players.has('0')).toBeTruthy()
  })
  test('set', function() {
    getContext(toInstance(players)).transaction(() => {
      players.set(3, { name: 'Ghost', level: 4, hp: 8 })
    })
    expect(players.get('3')!.name).toBe('Ghost')
  })
  test('size', function() {
    expect(players.size).toBe(3)
  })
  test('entries', function() {
    expect(Array.from(players.entries())).toEqual([
      [
        '0',
        {
          name: 'Fraktar',
          level: 1,
          hp: 8,
        },
      ],
      [
        '1',
        {
          name: 'Elwein',
          level: 2,
          hp: 4,
        },
      ],
      [
        '2',
        {
          name: 'Dreadbond',
          level: 2,
          hp: 5,
        },
      ],
    ])
  })
  test('keys', function() {
    expect(Array.from(players.keys())).toEqual(['0', '1', '2'])
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
