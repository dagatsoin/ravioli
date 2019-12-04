import {
  applySnapshot,
  array,
  clone,
  getNode,
  getSnapshot,
  getValue,
  INodeInstance,
  isInstance,
  isNode,
  number,
  object,
  string,
} from '../src'
import * as STManager from '../src/STManager'

test('Create array of primitive', function() {
  const Players = array(string())
  const players = Players.create(['Fraktar', 'Dreadbond', 'Elwein'])
  expect(isInstance(players)).toBeTruthy()
  expect(isNode(players)).toBeTruthy()
  expect(players[0]).toBe('Fraktar')
  expect(getNode(players).$patch).toEqual([])
})

test('Can be created during a transaction', function() {
  const a = array(string()).create(['a', 'b'])
  STManager.transaction(() => {
    expect(a.slice()).toEqual(['a', 'b'])
  })
})

test('Create array of object', function() {
  const Players = array(
    object({
      name: string(),
      level: number(),
      hp: number(),
    })
  )
  const players = Players.create([
    {
      name: 'Fraktar',
      level: 1,
      hp: 10,
    },
  ])

  expect(isInstance(players)).toBeTruthy()
  expect(isNode(players)).toBeTruthy()
  expect(players[0].name).toBe('Fraktar')
})

test('set value', function() {
  const model = object({ arr: array(string()) })
  const instance = model.create()
  STManager.transaction(() => {
    // Set wrong value
    instance.arr = [{ name: 'Fraktar' }, { name: 'Elweïn' }] as any
    expect(instance.arr.slice()).toEqual([])
    // Set right value
    instance.arr = ['a', 'b']
    expect(instance.arr.slice()).toEqual(['a', 'b'])
  })
})

test('clone', function() {
  const Players = array(string())
  const players = Players.create(['Fraktar', 'Dreadbond', 'Elwein'])
  const cloned = clone(players)
  expect(cloned.slice()).toEqual(['Fraktar', 'Dreadbond', 'Elwein'])
})

test('take snapshot', function() {
  const Inventory = array(
    object({
      id: string(),
      quantity: number(),
    })
  )

  const inventory = Inventory.create([
    {
      id: 'sword',
      quantity: 1,
    },
  ])

  expect(getSnapshot(inventory)).toEqual([
    {
      id: 'sword',
      quantity: 1,
    },
  ])
})

test('apply snapshot', function() {
  const Inventory = array(
    object({
      id: string(),
      quantity: number(),
    })
  )

  const inventory = Inventory.create()

  STManager.transaction(() => {
    applySnapshot(inventory, [
      {
        id: 'sword',
        quantity: 1,
      },
    ])
    expect(inventory[0].id).toBe('sword')
  })
})

test('attach', function() {
  function getPath(node: INodeInstance<any>) {
    return node.$path.substr(node.$path.indexOf('/'))
  }
  const model = object({ arr: array(object({ name: string() })) })
  const instance = model.create()
  const arrNode = getNode(instance.arr)
  expect(getPath(arrNode)).toBe('/arr')
  STManager.transaction(
    () => (instance.arr = [{ name: 'Fraktar' }, { name: 'Elweïn' }])
  )
  expect(getPath(getNode(instance.arr[0]))).toBe('/arr/0')
})

test('Use node.getValue() to turn an ArrayType into a native Array', function() {
  const Players = array(string())
  const players = Players.create(['Fraktar', 'Dreadbond', 'Elwein'])
  expect(players.slice()).toEqual(['Fraktar', 'Dreadbond', 'Elwein'])
})

describe('Array methods', function() {
  const Players = array(
    object({
      name: string(),
      level: number(),
      hp: number(),
    })
  )
  let players: typeof Players.Type

  beforeEach(() => {
    players = Players.create([
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

  test('copyWithin', function() {
    STManager.transaction(() => {
      expect(players.copyWithin(0, 1)[0].name).toBe('Elwein')
    })


    // With primitives
    const a = array(string()).create(['a', 'b', 'c', 'd', 'e'])
    STManager.transaction(() => {
      a.copyWithin(0, 2, 4)
      expect(getValue(a).slice()).toEqual(['c', 'd', 'c', 'd', 'e'])

      // Test generated patch in strict json patch mode
      expect(getNode(a).$patch).toEqual([
        {
          op: 'copy',
          from: '/2',
          path: '/0',
        },
        {
          op: 'copy',
          from: '/3',
          path: '/1',
        },
      ])
    })
  })

  test('concat', function() {
    expect(players.concat({ name: 'Ghost', hp: 20, level: 5 }).length).toBe(4)

    // With primitives
    const a = array(string()).create(['a', 'b', 'c', 'd', 'e'])
    const newA = a.concat(['f'])
    expect(getValue(newA).slice()).toEqual(['a', 'b', 'c', 'd', 'e', 'f'])
  })

  test('pop', function() {
    STManager.transaction(() => {
      expect(players.pop()!.name).toBe('Dreadbond')
      expect(players.length).toBe(2)

      // Check the patch
      expect(getNode(players).$patch).toEqual([
        { op: 'remove', path: '/3' },
        { op: 'replace', path: '/length', value: 2 },
      ])
    })
  })

  test('reduce', function() {
    expect(players.reduce((total, { hp }) => hp + total, 0)).toBe(17)
  })

  test('reduceRight', function() {
    expect(players.reduceRight((total, { hp }) => hp + total, 0)).toBe(17)
  })

  test('fill', function() {
    STManager.transaction(() => {
      expect(
        players
          .fill(
            {
              name: 'Ghost',
              hp: 30,
              level: 6,
            },
            -2
          )
          .slice()
      ).toEqual([
        {
          name: 'Fraktar',
          level: 1,
          hp: 8,
        },
        {
          name: 'Ghost',
          hp: 30,
          level: 6,
        },
        {
          name: 'Ghost',
          hp: 30,
          level: 6,
        },
      ])
      expect(getNode(players).$patch).toEqual([
        {
          op: 'replace',
          path: '/1',
          value: {
            name: 'Ghost',
            hp: 30,
            level: 6,
          },
        },
        {
          op: 'replace',
          path: '/2',
          value: {
            name: 'Ghost',
            hp: 30,
            level: 6,
          },
        },
      ])
    })
  })

  test('find', function() {
    expect(players.find(p => p.name === 'Fraktar')!.hp).toBe(8)

    // With primitives
    const a = array(number()).create([0, 1, 2, 3])
    expect(a.find(n => n === 2)).toEqual(2)
  })

  test('findIndex', function() {
    expect(players.findIndex(p => p.name === 'Fraktar')).toBe(0)

    // With primitives
    const a = array(number()).create([0, 1, 2, 3])
    expect(a.findIndex(n => n === 2)).toEqual(2)
  })

  test('indexOf', function() {
    expect(players.indexOf(players[0])).toBe(0)

    // With primitives
    const a = array(number()).create([0, 1, 2, 3])
    expect(a.indexOf(1)).toEqual(1)
  })

  test('lastIndexOf', function() {
    expect(players.lastIndexOf(players[0])).toBe(0)

    // With primitives
    const a = array(number()).create([0, 1, 2, 0])
    expect(a.lastIndexOf(0)).toEqual(3)
  })

  test('every', function() {
    expect(players.every(p => p.hp > 0)).toBeTruthy()
  })

  test('join', function() {
    const a = array(string()).create(['a', 'b', 'c', 'd'])
    expect(a.join('')).toEqual('abcd')
  })

  test('reverse', function() {
    const a = array(string()).create(['a', 'b', 'c', 'd'])
    STManager.transaction(() => {
      a.reverse()
      expect(a.slice()).toEqual(['d', 'c', 'b', 'a'])
      expect(getNode(a).$patch).toEqual([
        { op: 'replace', path: '/0', value: 'd' },
        { op: 'replace', path: '/1', value: 'c' },
        { op: 'replace', path: '/2', value: 'b' },
        { op: 'replace', path: '/3', value: 'a' },
      ])
    })
  })

  test('shift', function() {
    const a = array(string()).create(['a', 'b', 'c', 'd'])
    STManager.transaction(() => {
      a.shift()
      expect(getNode(a).$patch).toEqual([
        { op: 'move', from: '/1', path: '/0' },
        { op: 'move', from: '/2', path: '/1' },
        { op: 'move', from: '/3', path: '/2' },
        { op: 'remove', path: '/3' },
        { op: 'replace', path: '/length', value: 3 },
      ])
    })
  })

  test('some', function() {
    expect(players.some(p => p.hp > 0)).toBeTruthy()
  })

  test('includes', function() {
    // With objects
    const Fraktar = players[0]
    expect(players.includes(Fraktar)).toBeTruthy()
    // With primitives
    const a = array(number()).create([0, 1, 2, 3])
    expect(a.includes(2)).toBeTruthy()
  })

  test('push', function() {
    STManager.transaction(() => {
      expect(
        players.push({
          name: 'Ghost',
          level: 1,
          hp: 9,
        })
      ).toBe(4)

      expect(getNode(players).$patch).toEqual([
        {
          op: 'add',
          path: '/3',
          value: {
            name: 'Ghost',
            level: 1,
            hp: 9,
          },
        },
        { op: 'replace', path: '/length', value: 4 },
      ])
    })
  })

  test('splice', function() {
    STManager.transaction(() => {
      expect(players.splice(0, 1)[0].name).toBe('Fraktar')
    })

    // With primitives
    const a = array(string()).create(['a', 'b', 'c', 'd'])
    STManager.transaction(() => {
      a.splice(1, 1, 'e', 'f')
      expect(getValue(a).slice()).toEqual(['a', 'e', 'f', 'c', 'd'])

      // Test generated patch in strict json patch mode
      expect(getNode(a).$patch).toEqual([
        { from: '/2', op: 'move', path: '/3' },
        { from: '/3', op: 'move', path: '/4' },
        { op: 'add', path: '/5', value: 'd' },
        { op: 'replace', path: '/1', value: 'e' },
        { op: 'replace', path: '/2', value: 'f' },
        { op: 'replace', path: '/length', value: 5 },
      ])
    })
    STManager.transaction(() => {
      a.splice(2, 3, 'x')
      expect(getValue(a).slice()).toEqual(['a', 'e', 'x'])

      // Test generated patch in strict json patch mode
      expect(getNode(a).$patch).toEqual([
        { op: 'replace', path: '/2', value: 'x' },
        { op: 'remove', path: '/3' },
        { op: 'remove', path: '/4' },
        { op: 'replace', path: '/length', value: 3 },
      ])
    })
  })

  test('sort', function() {
    STManager.transaction(() => {
      expect(
        players.sort((a: any, b: any) => (a.name > b.name ? 1 : -1))[0].name
      ).toBe('Dreadbond')
      expect(getNode(players).$patch).toEqual([
        {
          op: 'replace',
          path: '/0',
          value: {
            name: 'Dreadbond',
            level: 2,
            hp: 5,
          },
        },
        {
          op: 'replace',
          path: '/1',
          value: {
            name: 'Elwein',
            level: 2,
            hp: 4,
          },
        },
        {
          op: 'replace',
          path: '/2',
          value: {
            name: 'Fraktar',
            level: 1,
            hp: 8,
          },
        },
      ])
    })
  })

  test('unshift', function() {
    STManager.transaction(() => {
      expect(
        players.unshift({
          name: 'Ghost',
          level: 1,
          hp: 9,
        })
      ).toBe(4)

      expect(getNode(players).$patch).toEqual([
        {
          op: 'add',
          path: '/3',
          value: {
            name: 'Dreadbond',
            level: 2,
            hp: 5,
          },
        },
        {
          op: 'move',
          from: '/1',
          path: '/2',
        },
        {
          op: 'move',
          from: '/0',
          path: '/1',
        },
        {
          op: 'replace',
          path: '/0',
          value: {
            name: 'Ghost',
            level: 1,
            hp: 9,
          },
        },
        { op: 'replace', path: '/length', value: 4 },
      ])
    })
  })

  test('toString', function() {
    expect(players.toString()).toBe(
      '[object Object],[object Object],[object Object]'
    )
  })

  test('filter', function() {
    expect(players.filter(p => p.level > 1).length).toBe(2)

    // With primitives
    const a = array(number()).create([0, 1, 2, 3])
    expect(a.filter(c => c > 1)).toEqual([2, 3])
  })
})