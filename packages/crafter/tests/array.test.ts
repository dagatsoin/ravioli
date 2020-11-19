import { ArrayCommand, Operation } from '../src/lib/JSONPatch'
import { array } from '../src/array'
import { string, number } from '../src/Primitive'
import { isInstance } from '../src/lib/Instance'
import { isNode } from "../src/lib/isNode"
import { toNode, getContext, clone, toInstance, getSnapshot } from '../src/helpers'
import { object } from '../src/object'
import { INodeInstance } from '../src/lib/INodeInstance'

test('Create array of primitive', function() {
  const Players = array(string())
  const players = Players.create(['Fraktar', 'Dreadbond', 'Elwein'])
  expect(isInstance(players)).toBeTruthy()
  expect(isNode(players)).toBeTruthy()
  expect(players[0]).toBe('Fraktar')
  expect(toNode(players).$state.migration).toEqual({ backward: [], forward: [] })
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
  getContext(toInstance(instance)).step(() => {
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

test('value', function() {
  const Model = array(
    object({
      name: string(),
    })
  ).create([{ name: 'Fraktar' }])
  expect(toNode(toInstance(Model)).$value).toEqual([{ name: 'Fraktar' }])
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

  expect(
    Inventory.getSnapshot(toNode<typeof Inventory['Type']>(inventory))
  ).toEqual([
    {
      id: 'sword',
      quantity: 1,
    },
  ])
})

test('apply snapshot', function() {
  const Item = object({
    id: string(),
    quantity: number(),
    stats: object({
      phase: number(),
      xp: number(),
    }),
  })
  const Inventory = array(Item)

  const inventory = Inventory.create()

  getContext(toInstance(inventory)).step(() => {
    Inventory.applySnapshot(toNode<typeof Inventory['Type']>(inventory), [
      {
        id: 'sword',
        quantity: 1,
        stats: {
          phase: 2,
          xp: 2,
        },
      },
    ])
    expect(inventory[0].id).toBe('sword')
  })
})

describe('attach/detach', function() {
  function getPath(node: INodeInstance<any, any>): string {
    return node.$path.substr(node.$path.indexOf('/'))
  }

  test('attach', function() {
    const model = object({ arr: array(object({ name: string() })) })
    const instance = model.create()
    const arrNode = toNode(instance.arr)
    expect(getPath(arrNode)).toBe('/arr')
    getContext(toInstance(instance)).step(
      () => (instance.arr = [{ name: 'Fraktar' }, { name: 'Elweïn' }])
    )
    expect(getPath(toNode(instance.arr[0]))).toBe('/arr/0')
  })

  test('detach', function() {
    const model = array(object({ name: string() }))
    const instance = model.create([{ name: 'Fraktar' }])
    const nodeRef = instance[0]
    getContext(toInstance(instance)).step(() => instance.pop())
    expect(toNode(nodeRef).$parent).toBeUndefined()
    expect(toNode(nodeRef).$parentKey).toBe('')
  })
})

test('Use node.getValue() to turn an ArrayType into a native Array', function() {
  const Players = array(string())
  const players = Players.create(['Fraktar', 'Dreadbond', 'Elwein'])
  expect(players.slice()).toEqual(['Fraktar', 'Dreadbond', 'Elwein'])
})

describe('Basic JSON command', function() {
  const World = object({
    players: array(
      object({
        name: string(),
        level: number(),
        hp: number(),
      })
    ),
    connectedPlayers: array(string()),
  })

  let world: typeof World.Type

  beforeEach(() => {
    world = World.create({
      players: [
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
        {
          name: 'Cha',
          level: 2,
          hp: 5,
        },
        {
          name: 'Ghost',
          level: 2,
          hp: 5,
        },
      ],
      connectedPlayers: ['Fraktar', 'Elwein', 'Dreadbond', 'Cha', 'Ghost'],
    })
  })

  test('add', function() {
    getContext(toInstance(world)).step(() => {
      toNode(world).$present<ArrayCommand>([{
        op: Operation.add,
        path: '/players/5',
        value: {
          name: 'Troll',
          hp: 0,
          level: 5,
        },
      }])
    })
    expect(world.players[5].name).toBe('Troll')
  })

  test('replace', function() {
    getContext(toInstance(world)).step(() => {
      toNode(world).$present<ArrayCommand>([{
        op: Operation.replace,
        path: '/players/4',
        value: {
          name: 'Troll',
          hp: 0,
          level: 5,
        },
      }])
    })
    expect(world.players[4].name).toBe('Troll')
  })

  test('remove', function() {
    getContext(toInstance(world)).step(() => {
      toNode(world).$present<ArrayCommand>([{
        op: Operation.remove,
        path: '/players/4',
      }])
    })
    expect(world.players[4]).toBeUndefined()
  })

  test('move', function() {
    getContext(toInstance(world)).step(() => {
      toNode(world).$present<ArrayCommand>([{
        op: Operation.move,
        from: '/players/0',
        path: '/players/1',
      }])
    })
    expect(world.players[1].name).toBe('Fraktar')
  })

  test('copy', function() {
    getContext(toInstance(world)).step(() => {
      toNode(world).$present<ArrayCommand>([{
        op: Operation.copy,
        from: '/players/0',
        path: '/players/1',
      }])
    })
    expect(world.players[1].name).toBe('Fraktar')
  })
})

describe('Array methods', function() {
  // Put the array into an object to test the $attach methods
  const World = object({
    players: array(
      object({
        name: string(),
        level: number(),
        hp: number(),
      })
    ),
    connectedPlayers: array(string()),
  })

  let world: typeof World.Type

  beforeEach(() => {
    world = World.create({
      players: [
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
        {
          name: 'Cha',
          level: 2,
          hp: 5,
        },
        {
          name: 'Ghost',
          level: 2,
          hp: 5,
        },
      ],
      connectedPlayers: ['Fraktar', 'Elwein', 'Dreadbond', 'Cha', 'Ghost'],
    })
  })

  describe('copyWithin', function() {
    test('primitive', function() {
      getContext(toInstance(world)).step(() => {
        expect(world.connectedPlayers.copyWithin(0, 1, 2).slice()).toEqual([
          'Elwein',
          'Elwein',
          'Dreadbond',
          'Cha',
          'Ghost',
        ])
      })
    })

    test('objects', function() {
      getContext(toInstance(world)).step(() => {
        world.players.copyWithin(0, 1, 3)
        expect(world.players[0].name).toBe('Elwein')
        expect(world.players[1].name).toBe('Dreadbond')
        expect(toNode(world.players[0]).$path).toEqual('/players/0')
        expect(toNode(world.players[1]).$path).toEqual('/players/1')
        expect(toNode(world.players[2]).$path).toEqual('/players/2')
        expect(toNode(world.players[3]).$path).toEqual('/players/3')
      })
    })

    describe('JSON command', function() {
      test('on object array: JSON patch generation', function() {
        getContext(toInstance(world)).step(() => {
          world.players.copyWithin(0, 1, 3)
          expect(toNode(world.players).$state.migration).toEqual({
            forward: [
              {
                op: Operation.copyWithin,
                path: '/players',
                target: 0,
                start: 1,
                end: 3,
              },
            ],
            backward: [
              {
                op: Operation.splice,
                path: '/players',
                value: [
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
                ],
                deleteCount: 2,
                start: 0,
              },
            ],
          })
        })
      })

      test('on object array: JSON patch apply forward', function() {
        let shouldBe: any
        getContext(toInstance(world)).step(() => {
          shouldBe = clone(world)
            .players.copyWithin(0, 1, 3)
            .slice()
        })

        const forward: ArrayCommand[] = [
          {
            op: Operation.copyWithin,
            path: '/players',
            target: 0,
            start: 1,
            end: 3,
          },
        ]
        getContext(toInstance(world)).step(() => toNode(world.players).$present<ArrayCommand>(forward))
        expect(world.players.slice()).toEqual(shouldBe)
        expect(toNode(world.players[0]).$path).toEqual('/players/0')
        expect(toNode(world.players[1]).$path).toEqual('/players/1')
      })

      test('on object array: JSON patch apply backward', function() {
        const shouldBe = getSnapshot(world).players
        let arrayToReverse: any
        getContext(toInstance(world)).step(() => {
          arrayToReverse = world.players.copyWithin(0, 1, 3)
        })
        const reverse: ArrayCommand = {
          op: Operation.splice,
          path: '/players',
          value: [
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
          ],
          deleteCount: 2,
          start: 0,
        }
        getContext(toInstance(world)).step(() =>
          toNode(toInstance(arrayToReverse)).$present<ArrayCommand>([reverse])
        )
        const reversed = getSnapshot(toInstance(arrayToReverse))
        expect(reversed).toEqual(shouldBe)
        expect(toNode(world.players[0]).$path).toEqual('/players/0')
        expect(toNode(world.players[1]).$path).toEqual('/players/1')
      })

      test('on primitive array: JSON patch generation', function() {
        getContext(toInstance(world)).step(() => {
          world.connectedPlayers.copyWithin(0, 1, 3)
          expect(toNode(world.players).$state.migration).toEqual({
            forward: [
              {
                op: Operation.copyWithin,
                path: '/connectedPlayers',
                target: 0,
                start: 1,
                end: 3,
              },
            ],
            backward: [
              {
                op: Operation.splice,
                path: '/connectedPlayers',
                start: 0,
                deleteCount: 2,
                value: ['Fraktar', 'Elwein'],
              },
            ],
          })
        })
      })

      test('on primitive array: JSON patch apply forward', function() {
        let shouldBe: any
        getContext(toInstance(world)).step(() => {
          shouldBe = clone(world)
            .connectedPlayers.copyWithin(0, 1, 3)
            .slice()
        })
        const forward: ArrayCommand[] = [
          {
            op: Operation.copyWithin,
            path: '/connectedPlayers',
            target: 0,
            start: 1,
            end: 3,
          },
        ]
        getContext(toInstance(world)).step(() => toNode(world.connectedPlayers).$present<ArrayCommand>(forward))
        expect(world.connectedPlayers.slice()).toEqual(shouldBe)
      })

      test('on primitive array: JSON patch apply backward', function() {
        const shouldBe = getSnapshot(world.connectedPlayers)
        let arrayToReverse: any
        getContext(toInstance(world)).step(
          () => (arrayToReverse = world.connectedPlayers.copyWithin(0, 1, 3))
        )
        const reverse: ArrayCommand[] = [
          {
            op: Operation.replace,
            path: '/connectedPlayers/0',
            value: 'Fraktar',
          },
          {
            op: Operation.replace,
            path: '/connectedPlayers/1',
            value: 'Elwein',
          },
        ]
        getContext(toInstance(world)).step(() => toNode(toInstance(arrayToReverse)).$present<ArrayCommand>(reverse))
        const reversed = getSnapshot(toInstance(arrayToReverse))
        expect(reversed).toEqual(shouldBe)
      })
    })
  })

  test('concat', function() {
    expect(
      world.players.concat({ name: 'Ghost', hp: 20, level: 5 }).length
    ).toBe(6)

    // With primitives
    const newA = world.connectedPlayers.concat(['guest'])
    expect(newA.slice()).toEqual([
      'Fraktar',
      'Elwein',
      'Dreadbond',
      'Cha',
      'Ghost',
      'guest',
    ])
  })

  describe('pop', function() {
    test('primitive', function() {
      getContext(toInstance(world)).step(() => {
        expect(world.connectedPlayers.pop()).toBe('Ghost')
        expect(world.connectedPlayers.slice()).toEqual([
          'Fraktar',
          'Elwein',
          'Dreadbond',
          'Cha',
        ])
      })
    })

    test('objects', function() {
      getContext(toInstance(world)).step(() => {
        expect(world.players.pop()!.name).toBe('Ghost')
        expect(world.players.length).toBe(4)
      })
    })

    describe('JSON command', function() {
      test('on object array: JSON patch generation', function() {
        getContext(toInstance(world)).step(() => {
          world.players.pop()
          expect(toNode(world.players).$state.migration).toEqual({
            forward: [
              {
                op: Operation.pop,
                path: '/players',
              },
            ],
            backward: [
              {
                op: Operation.push,
                path: '/players',
                value: [
                  {
                    name: 'Ghost',
                    level: 2,
                    hp: 5,
                  },
                ],
              },
            ],
          })
        })
      })

      test('on object array: JSON patch apply forward', function() {
        let shouldBe: any
        getContext(toInstance(world)).step(() => {
          const _clone = clone(world)
          _clone.players.pop()
          shouldBe = _clone.players.slice()
        })

        getContext(toInstance(world)).step(() =>
          toNode(world.players).$present<ArrayCommand>([{
            op: Operation.pop,
            path: '/players',
          }])
        )
        expect(world.players.slice()).toEqual(shouldBe)
      })

      test('on object array: JSON patch apply backward', function() {
        const cloned = clone(world)
        const shouldBe = getSnapshot(cloned).players
        const arrayToReverse = world
        getContext(toInstance(world)).step(() => {
          world.players.pop()
        })
        getContext(toInstance(world)).step(() =>
          toNode(arrayToReverse).$present<ArrayCommand>([{
            op: Operation.push,
            path: '/players',
            value: [
              {
                name: 'Ghost',
                level: 2,
                hp: 5,
              },
            ],
          }])
        )
        const reversed = getSnapshot(toInstance(arrayToReverse)).players
        expect(reversed).toEqual(shouldBe)
      })

      test('on primitive array: JSON patch generation', function() {
        getContext(toInstance(world)).step(() => {
          world.connectedPlayers.pop()
          expect(toNode(world.players).$state.migration).toEqual({
            forward: [
              {
                op: Operation.pop,
                path: '/connectedPlayers',
              },
            ],
            backward: [
              {
                op: Operation.push,
                path: '/connectedPlayers',
                value: ['Ghost'],
              },
            ],
          })
        })
      })

      test('on primitive array: JSON patch apply forward', function() {
        let shouldBe: any
        getContext(toInstance(world)).step(() => {
          const _clone = clone(world)
          _clone.connectedPlayers.pop()
          shouldBe = _clone.connectedPlayers.slice()
        })

        getContext(toInstance(world)).step(() =>
          toNode(world.connectedPlayers).$present<ArrayCommand>([{
            op: Operation.pop,
            path: '/connectedPlayers',
          }])
        )

        expect(world.connectedPlayers.slice()).toEqual(shouldBe)
      })

      test('on primitive array: JSON patch apply backward', function() {
        const shouldBe = getSnapshot(world.connectedPlayers)
        const cloned = clone(world)
        const arrayToReverse = cloned.connectedPlayers
        getContext(toInstance(world)).step(() => {
          arrayToReverse.pop()
          toNode(toInstance(arrayToReverse)).$present<ArrayCommand>([{
            op: Operation.push,
            path: '/connectedPlayers',
            value: ['Ghost'],
          }])
        })
        const reversed = getSnapshot(world)
        const sn = reversed.connectedPlayers
        expect(sn).toEqual(shouldBe)
      })
    })
  })

  test('reduce an object array', function() {
    expect(world.players.reduce((total, { hp }) => hp + total, 0)).toBe(27)
  })

  test('reduce a primitive array', function() {
    const model = array(number()).create([1, 2, 3])
    expect(model.reduce((total, n) => total + n, 0)).toBe(6)
  })


  test('reduceRight', function() {
    expect(world.players.reduceRight((total, { hp }) => hp + total, 0)).toBe(27)
  })

  describe('fill', function() {
    test('primitive', function() {
      getContext(toInstance(world)).step(() => {
        expect(world.connectedPlayers.fill('guest').slice()).toEqual([
          'guest',
          'guest',
          'guest',
          'guest',
          'guest',
        ])
      })
    })

    test('objects', function() {
      getContext(toInstance(world)).step(() => {
        world.players.fill(
          {
            name: 'Dreadbond',
            level: 2,
            hp: 5,
          },
          1,
          4
        )
        expect(world.players[0].name).toBe('Fraktar')
        expect(world.players[1].name).toBe('Dreadbond')
        expect(world.players[2].name).toBe('Dreadbond')
        expect(world.players[3].name).toBe('Dreadbond')
        expect(world.players[4].name).toBe('Ghost')
        expect(toNode(world.players[1]).$path).toEqual('/players/1')
        expect(toNode(world.players[2]).$path).toEqual('/players/2')
        expect(toNode(world.players[3]).$path).toEqual('/players/3')
      })
    })

    describe('JSON command', function() {
      test('on object array: JSON patch generation', function() {
        getContext(toInstance(world)).step(() => {
          world.players.fill(
            {
              name: 'Dreadbond',
              level: 2,
              hp: 5,
            },
            1,
            4
          )
          expect(toNode(world.players).$state.migration).toEqual({
            forward: [
              {
                op: Operation.fill,
                path: '/players',
                value: {
                  name: 'Dreadbond',
                  level: 2,
                  hp: 5,
                },
                start: 1,
                end: 4,
              },
            ],
            backward: [
              {
                op: Operation.splice,
                path: '/players',
                value: [
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
                  {
                    name: 'Cha',
                    level: 2,
                    hp: 5,
                  },
                ],
                deleteCount: 3,
                start: 1,
              },
            ],
          })
        })
      })

      test('on object array: JSON patch apply forward', function() {
        let shouldBe: any
        getContext(toInstance(world)).step(() => {
          shouldBe = clone(world)
            .players.fill(
              {
                name: 'Dreadbond',
                level: 2,
                hp: 5,
              },
              1,
              4
            )
            .slice()
        })

        getContext(toInstance(world)).step(() =>
          toNode(toInstance(world.players)).$present<ArrayCommand>([{
            op: Operation.fill,
            path: '/players',
            value: {
              name: 'Dreadbond',
              level: 2,
              hp: 5,
            },
            start: 1,
            end: 4,
          }])
        )
        expect(world.players.slice()).toEqual(shouldBe)
        expect(world.players[0].name).toBe('Fraktar')
        expect(world.players[1].name).toBe('Dreadbond')
        expect(world.players[2].name).toBe('Dreadbond')
        expect(world.players[3].name).toBe('Dreadbond')
        expect(world.players[4].name).toBe('Ghost')
        expect(toNode(world.players[1]).$path).toEqual('/players/1')
        expect(toNode(world.players[2]).$path).toEqual('/players/2')
        expect(toNode(world.players[3]).$path).toEqual('/players/3')
      })

      test('on object array: JSON patch apply backward', function() {
        const shouldBe = getSnapshot(toInstance(world)).players
        let arrayToReverse: any
        getContext(toInstance(world)).step(() => {
          arrayToReverse = world.players.fill(
            {
              name: 'Dreadbond',
              level: 2,
              hp: 5,
            },
            1,
            4
          )
        })
        getContext(toInstance(world)).step(() =>
          toNode(toInstance(arrayToReverse)).$present<ArrayCommand>([{
            op: Operation.splice,
            path: '/players',
            value: [
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
              {
                name: 'Cha',
                level: 2,
                hp: 5,
              },
            ],
            deleteCount: 3,
            start: 1,
          }])
        )
        const reversed = getSnapshot(toInstance(world)).players
        expect(reversed).toEqual(shouldBe)
        expect(world.players[0].name).toBe('Fraktar')
        expect(world.players[1].name).toBe('Elwein')
        expect(world.players[2].name).toBe('Dreadbond')
        expect(world.players[3].name).toBe('Cha')
        expect(world.players[4].name).toBe('Ghost')
        expect(toNode(world.players[1]).$path).toEqual('/players/1')
        expect(toNode(world.players[2]).$path).toEqual('/players/2')
        expect(toNode(world.players[3]).$path).toEqual('/players/3')
      })

      test('on primitive array: JSON patch generation', function() {
        getContext(toInstance(world)).step(() => {
          world.connectedPlayers.fill('Dreadbond', 1, 4)
          expect(toNode(world.connectedPlayers).$state.migration).toEqual({
            forward: [
              {
                op: Operation.fill,
                path: '/connectedPlayers',
                value: 'Dreadbond',
                start: 1,
                end: 4,
              },
            ],
            backward: [
              {
                op: Operation.splice,
                path: '/connectedPlayers',
                start: 1,
                deleteCount: 3,
                value: ['Elwein', 'Dreadbond', 'Cha'],
              },
            ],
          })
        })
      })

      test('on primitive array: JSON patch apply forward', function() {
        let shouldBe: any
        getContext(toInstance(world)).step(() => {
          shouldBe = clone(world)
            .connectedPlayers.fill('Dreadbond', 1, 3)
            .slice()
        })
        getContext(toInstance(world)).step(() =>
          toNode(toInstance(world.connectedPlayers)).$present<ArrayCommand>([{
            op: Operation.fill,
            path: '/connectedPlayers',
            value: 'Dreadbond',
            start: 1,
            end: 3,
          }])
        )

        expect(world.connectedPlayers.slice()).toEqual(shouldBe)
      })

      test('on primitive array: JSON patch apply backward', function() {
        const shouldBe = getSnapshot(toInstance(world)).connectedPlayers
        let arrayToReverse: any
        getContext(toInstance(world)).step(
          () => (arrayToReverse = world.connectedPlayers.copyWithin(0, 1, 3))
        )
        getContext(toInstance(world)).step(() =>
          toNode(toInstance(arrayToReverse)).$present<ArrayCommand>([{
            op: Operation.splice,
            path: '/connectedPlayers',
            start: 0,
            deleteCount: 3,
            value: ['Fraktar', 'Elwein', 'Dreadbond'],
          }])
        )
        const reversed = getSnapshot(toInstance(world))
        const sn = reversed.connectedPlayers
        expect(sn).toEqual(shouldBe)
      })
    })
  })

  test('find', function() {
    expect(world.players.find(p => p.name === 'Fraktar')!.hp).toBe(8)

    // With primitives
    const a = array(number()).create([0, 1, 2, 3])
    expect(a.find(n => n === 2)).toEqual(2)

    const i = array(object({ name: string() })).create()
    expect(i.find(({ name }) => name === '')).toBeUndefined()
  })

  test('findIndex', function() {
    expect(world.players.findIndex(p => p.name === 'Fraktar')).toBe(0)

    // With primitives
    const a = array(number()).create([0, 1, 2, 3])
    expect(a.findIndex(n => n === 2)).toEqual(2)
  })

  test('indexOf', function() {
    expect(world.players.indexOf(world.players[0])).toBe(0)

    // With primitives
    const a = array(number()).create([0, 1, 2, 3])
    expect(a.indexOf(1)).toEqual(1)
  })

  test('lastIndexOf', function() {
    expect(world.players.lastIndexOf(world.players[0])).toBe(0)

    // With primitives
    const a = array(number()).create([0, 1, 2, 0])
    expect(a.lastIndexOf(0)).toEqual(3)
  })

  test('every', function() {
    expect(world.players.every(p => p.hp > 0)).toBeTruthy()
  })

  test('join', function() {
    const a = array(string()).create(['a', 'b', 'c', 'd'])
    expect(a.join('')).toEqual('abcd')
  })

  describe('reverse', function() {
    test('reversion', function() {
      getContext(toInstance(world)).step(() => {
        world.players.reverse()
        expect(world.players.map(({ name }) => name)).toEqual([
          'Ghost',
          'Cha',
          'Dreadbond',
          'Elwein',
          'Fraktar',
        ])
        expect(toNode(world.players[0]).$parentKey).toBe(0)
        expect(toNode(world.players[1]).$parentKey).toBe(1)
        expect(toNode(world.players[2]).$parentKey).toBe(2)
        expect(toNode(world.players[3]).$parentKey).toBe(3)
        expect(toNode(world.players[4]).$parentKey).toBe(4)
      })
    })
    test('JSON patch generation', function() {
      getContext(toInstance(world)).step(() => {
        world.connectedPlayers.reverse()
        expect(toNode(world.connectedPlayers).$state.migration).toEqual({
          forward: [
            {
              op: Operation.reverse,
              path: '/connectedPlayers',
            },
          ],
          backward: [
            {
              op: Operation.reverse,
              path: '/connectedPlayers',
            },
          ],
        })
      })
    })

    test('JSON patch apply forward', function() {
      let shouldBe: any
      getContext(toInstance(world)).step(() => {
        shouldBe = clone(world)
          .connectedPlayers.reverse()
          .slice()
      })
      getContext(toInstance(world)).step(() =>
        toNode(world.connectedPlayers).$present<ArrayCommand>([{
          op: Operation.reverse,
          path: '/connectedPlayers',
        }])
      )

      expect(world.connectedPlayers.slice()).toEqual(shouldBe)
    })

    test('JSON patch apply backward', function() {
      const shouldBe = getSnapshot(toInstance(world)).connectedPlayers
      let arrayToReverse: any
      getContext(toInstance(world)).step(
        () => (arrayToReverse = world.connectedPlayers.reverse())
      )
      getContext(toInstance(world)).step(() =>
        toNode(toInstance(arrayToReverse)).$present<ArrayCommand>([{
          op: Operation.reverse,
          path: '/connectedPlayers',
        }])
      )
      const reversed = getSnapshot(toInstance(world))
      const sn = reversed.connectedPlayers
      expect(sn).toEqual(shouldBe)
    })
  })

  describe('shift', function() {
    test('primitive', function() {
      getContext(toInstance(world)).step(() => {
        expect(world.connectedPlayers.shift()).toEqual('Fraktar')
      })
      expect(world.connectedPlayers.length).toBe(4)
    })

    test('objects', function() {
      getContext(toInstance(world)).step(() => {
        expect(world.players.shift()!.name).toEqual('Fraktar')
      })
      expect(world.players.length).toBe(4)
    })

    describe('JSON command', function() {
      test('on object array: JSON patch generation', function() {
        getContext(toInstance(world)).step(() => {
          world.players.shift()
          expect(toNode(world.players).$state.migration).toEqual({
            forward: [
              {
                op: Operation.shift,
                path: '/players',
              },
            ],
            backward: [
              {
                op: Operation.unshift,
                path: '/players',
                value: [
                  {
                    name: 'Fraktar',
                    level: 1,
                    hp: 8,
                  },
                ],
              },
            ],
          })
        })
      })

      test('on object array: JSON patch apply forward', function() {
        let shouldBe: any
        getContext(toInstance(world)).step(() => {
          shouldBe = clone(world)
          shouldBe.players.shift()
        })

        getContext(toInstance(world)).step(() =>
          toNode(world.players).$present<ArrayCommand>([{
            op: Operation.shift,
            path: '/players',
          }])
        )
        expect(toNode(world.players)).toBe(4)
      })

      test('on object array: JSON patch apply backward', function() {
        const shouldBe = getSnapshot(toInstance(world)).players

        getContext(toInstance(world)).step(() => {
          world.players.shift()
        })
        getContext(toInstance(world)).step(() =>
          toNode(world).$present<ArrayCommand>([{
            op: Operation.splice,
            path: '/players',
            value: [
              {
                name: 'Fraktar',
                level: 1,
                hp: 8,
              },
            ],
            start: 0,
            deleteCount: 0,
          }])
        )
        const reversed = getSnapshot(toInstance(world)).players
        expect(reversed).toEqual(shouldBe)
        expect(toNode(world.players[1]).$path).toEqual('/players/1')
        expect(toNode(world.players[2]).$path).toEqual('/players/2')
      })
    })
  })

  test('some', function() {
    expect(world.players.some(p => p.hp > 0)).toBeTruthy()
  })

  test('includes', function() {
    // With objects
    const Fraktar = world.players[0]
    expect(world.players.includes(Fraktar)).toBeTruthy()
    // With primitives
    const a = array(number()).create([0, 1, 2, 3])
    expect(a.includes(2)).toBeTruthy()
  })

  describe('push', function() {
    test('primitive', function() {
      getContext(toInstance(world)).step(() => {
        expect(world.connectedPlayers.push('guest')).toEqual(6)
      })
      expect(world.connectedPlayers.length).toBe(6)
    })

    test('objects', function() {
      getContext(toInstance(world)).step(() => {
        expect(world.players.push({ name: 'guest', level: 0, hp: 0 })).toEqual(
          6
        )
      })
      expect(world.players.length).toBe(6)
      expect(toNode(world.players[5]).$path).toBe('/players/5')
    })

    describe('JSON command', function() {
      test('on object array: JSON patch generation', function() {
        getContext(toInstance(world)).step(() => {
          world.players.push({ name: 'guest', level: 0, hp: 0 })
          expect(toNode(world.players).$state.migration).toEqual({
            forward: [
              {
                op: Operation.push,
                path: '/players',
                value: [{ name: 'guest', level: 0, hp: 0 }],
              },
            ],
            backward: [
              {
                op: Operation.splice,
                path: '/players',
                start: 5,
                deleteCount: 1,
              },
            ],
          })
        })
      })

      test('on object array: JSON patch apply forward', function() {
        let shouldBe: any
        getContext(toInstance(world)).step(() => {
          shouldBe = clone(world)
          shouldBe.players.push({ name: 'guest', level: 0, hp: 0 })
        })

        getContext(toInstance(world)).step(() =>
          toNode(toInstance(world.players)).$present<ArrayCommand>([{
            op: Operation.push,
            path: '/players',
            value: [{ name: 'guest', level: 0, hp: 0 }],
          }])
        )
        expect(getSnapshot(toInstance(world.players[5]))).toEqual({
          name: 'guest',
          level: 0,
          hp: 0,
        })
        expect(toNode(world.players[5]).$path).toBe('/players/5')
      })

      test('on object array: JSON patch apply backward', function() {
        const shouldBe = getSnapshot(toInstance(world)).players

        getContext(toInstance(world)).step(() => {
          world.players.push({ name: 'guest', level: 0, hp: 0 })
        })
        getContext(toInstance(world)).step(() =>
          toNode(world).$present<ArrayCommand>([{
            op: Operation.pop,
            path: '/players',
          }])
        )
        const reversed = getSnapshot(toInstance(world)).players
        expect(reversed).toEqual(shouldBe)
      })
    })
  })
  describe('splice', function() {
    test('primitive', function() {
      getContext(toInstance(world)).step(() => {
        world.connectedPlayers.splice(0, 1, 'Elwein')
        expect(world.connectedPlayers.slice()).toEqual([
          'Elwein',
          'Elwein',
          'Dreadbond',
          'Cha',
          'Ghost',
        ])
      })
    })

    test('objects', function() {
      getContext(toInstance(world)).step(() => {
        world.players.splice(0, 1, getSnapshot(toInstance(world.players[1])))
        expect(world.players[0].name).toBe('Elwein')
        expect(world.players[1].name).toBe('Elwein')
        expect(toNode(world.players[0]).$path).toEqual('/players/0')
        expect(toNode(world.players[1]).$path).toEqual('/players/1')
        expect(toNode(world.players[2]).$path).toEqual('/players/2')
        expect(toNode(world.players[3]).$path).toEqual('/players/3')
      })
    })

    describe('JSON command', function() {
      test('on object array, length is untouched: JSON patch generation', function() {
        getContext(toInstance(world)).step(() => {
          world.players.splice(1, 2, world.players[0], world.players[0])
          expect(toNode(world.players).$state.migration).toEqual({
            forward: [
              {
                op: Operation.splice,
                path: '/players',
                value: [
                  {
                    name: 'Fraktar',
                    level: 1,
                    hp: 8,
                  },
                  {
                    name: 'Fraktar',
                    level: 1,
                    hp: 8,
                  },
                ],
                deleteCount: 2,
                start: 1,
              },
            ],
            backward: [
              {
                op: Operation.splice,
                path: '/players',
                value: [
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
                ],
                deleteCount: 2,
                start: 1,
              },
            ],
          })
        })
      })

      test('on object array, change to bigger array: JSON patch generation', function() {
        getContext(toInstance(world)).step(() => {
          world.players.splice(
            1,
            2,
            {
              name: 'Troll',
              level: 0,
              hp: 0,
            },
            {
              name: 'Troll',
              level: 0,
              hp: 0,
            },
            {
              name: 'Troll',
              level: 0,
              hp: 0,
            }
          )
          expect(toNode(world.players).$state.migration).toEqual({
            forward: [
              {
                op: Operation.splice,
                path: '/players',
                value: [
                  {
                    name: 'Troll',
                    level: 0,
                    hp: 0,
                  },
                  {
                    name: 'Troll',
                    level: 0,
                    hp: 0,
                  },
                  {
                    name: 'Troll',
                    level: 0,
                    hp: 0,
                  },
                ],
                deleteCount: 2,
                start: 1,
              },
            ],
            backward: [
              {
                op: Operation.splice,
                path: '/players',
                value: [
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
                ],
                deleteCount: 3,
                start: 1,
              },
            ],
          })
        })
      })

      test('on object array, change to smaller array: JSON patch generation', function() {
        getContext(toInstance(world)).step(() => {
          world.players.splice(
            1,
            4,
            {
              name: 'Troll',
              level: 0,
              hp: 0,
            },
            {
              name: 'Troll',
              level: 0,
              hp: 0,
            },
            {
              name: 'Troll',
              level: 0,
              hp: 0,
            }
          )
          expect(toNode(world.players).$state.migration).toEqual({
            forward: [
              {
                op: Operation.splice,
                path: '/players',
                value: [
                  {
                    name: 'Troll',
                    level: 0,
                    hp: 0,
                  },
                  {
                    name: 'Troll',
                    level: 0,
                    hp: 0,
                  },
                  {
                    name: 'Troll',
                    level: 0,
                    hp: 0,
                  },
                ],
                deleteCount: 4,
                start: 1,
              },
            ],
            backward: [
              {
                op: Operation.splice,
                path: '/players',
                value: [
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
                  {
                    name: 'Cha',
                    level: 2,
                    hp: 5,
                  },
                  {
                    name: 'Ghost',
                    level: 2,
                    hp: 5,
                  },
                ],
                deleteCount: 3,
                start: 1,
              },
            ],
          })
        })
      })

      test('on object array, length is untouched: JSON patch apply forward', function() {
        let shouldBe: any
        getContext(toInstance(world)).step(() => {
          shouldBe = clone(world)
          shouldBe.players.splice(
            1,
            1,
            {
              name: 'Fraktar',
              level: 1,
              hp: 8,
            },
            {
              name: 'Fraktar',
              level: 1,
              hp: 8,
            }
          )
        })

        getContext(toInstance(world)).step(() =>
          toNode(toInstance(world.players)).$present<ArrayCommand>([{
            op: Operation.splice,
            path: '/players',
            start: 1,
            deleteCount: 1,
            value: [
              {
                name: 'Fraktar',
                level: 1,
                hp: 8,
              },
              {
                name: 'Fraktar',
                level: 1,
                hp: 8,
              },
            ],
          }])
        )
        expect(getSnapshot(toInstance(world.players))).toEqual(
          getSnapshot(toInstance(shouldBe.players))
        )
        expect(toNode(world.players[1]).$path).toEqual('/players/1')
        expect(toNode(world.players[2]).$path).toEqual('/players/2')
      })

      test('on object array, length is untouched: JSON patch apply backward', function() {
        const shouldBe = getSnapshot(toInstance(world)).players
        let arrayToReverse: any
        getContext(toInstance(world)).step(() => {
          arrayToReverse = clone(world)
          arrayToReverse.players.splice(1, 1, {
            name: 'Fraktar',
            level: 1,
            hp: 8,
          })
        })
        getContext(toInstance(world)).step(() =>
          toNode(toInstance(arrayToReverse)).$present<ArrayCommand>([{
            op: Operation.splice,
            path: '/players',
            value: [
              {
                name: 'Elwein',
                level: 2,
                hp: 4,
              },
            ],
            deleteCount: 1,
            start: 1,
          }])
        )
        const reversed = getSnapshot(toInstance(arrayToReverse)).players
        expect(reversed).toEqual(shouldBe)
        expect(toNode(world.players[0]).$path).toEqual('/players/0')
        expect(toNode(world.players[1]).$path).toEqual('/players/1')
      })

      test('on object array, change to smaller array: JSON patch apply forward', function() {
        getContext(toInstance(world)).step(() => {
          const smallerArray = clone(world)
          smallerArray.players.splice(
            1,
            4,
            {
              name: 'Troll',
              level: 0,
              hp: 0,
            },
            {
              name: 'Troll',
              level: 0,
              hp: 0,
            },
            {
              name: 'Troll',
              level: 0,
              hp: 0,
            }
          )
          const targetSnapshot = getSnapshot(toInstance(smallerArray))
          getContext(toInstance(world)).step(() =>
            toNode(world).$present<ArrayCommand>([{
              op: Operation.splice,
              path: '/players',
              value: [
                {
                  name: 'Troll',
                  level: 0,
                  hp: 0,
                },
                {
                  name: 'Troll',
                  level: 0,
                  hp: 0,
                },
                {
                  name: 'Troll',
                  level: 0,
                  hp: 0,
                },
              ],
              deleteCount: 4,
              start: 1,
            }])
          )
          expect(getSnapshot(toInstance(world))).toEqual(targetSnapshot)
        })
      })

      test('on object array, change to smaller array: JSON patch apply backward', function() {
        getContext(toInstance(world)).step(() => {
          const smallerArray = clone(world)
          smallerArray.players.splice(
            1,
            4,
            {
              name: 'Troll',
              level: 0,
              hp: 0,
            },
            {
              name: 'Troll',
              level: 0,
              hp: 0,
            },
            {
              name: 'Troll',
              level: 0,
              hp: 0,
            }
          )
          toNode(smallerArray).$present<ArrayCommand>([{
            op: Operation.splice,
            path: '/players',
            value: [
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
              {
                name: 'Cha',
                level: 2,
                hp: 5,
              },
              {
                name: 'Ghost',
                level: 2,
                hp: 5,
              },
            ],
            deleteCount: 3,
            start: 1,
          }])
          expect(getSnapshot(toInstance(smallerArray))).toEqual(
            getSnapshot(toInstance(world))
          )
        })
      })

      test('on object array, change to bigger array: JSON patch apply forward', function() {
        getContext(toInstance(world)).step(() => {
          const bigger = clone(world)
          bigger.players.splice(
            1,
            2,
            {
              name: 'Troll',
              level: 0,
              hp: 0,
            },
            {
              name: 'Troll',
              level: 0,
              hp: 0,
            },
            {
              name: 'Troll',
              level: 0,
              hp: 0,
            }
          )
          const targetSnapshot = getSnapshot(toInstance(bigger))
          toNode(world).$present<ArrayCommand>([{
            op: Operation.splice,
            path: '/players',
            value: [
              {
                name: 'Troll',
                level: 0,
                hp: 0,
              },
              {
                name: 'Troll',
                level: 0,
                hp: 0,
              },
              {
                name: 'Troll',
                level: 0,
                hp: 0,
              },
            ],
            deleteCount: 2,
            start: 1,
          }])
          expect(getSnapshot(toInstance(world))).toEqual(targetSnapshot)
        })
      })

      test('on object array, change to bigger array: JSON patch apply backward', function() {
        getContext(toInstance(world)).step(() => {
          const biggerArray = clone(world)
          biggerArray.players.splice(
            1,
            2,
            { name: 'Troll', level: 0, hp: 0 },
            { name: 'Troll', level: 0, hp: 0 },
            { name: 'Troll', level: 0, hp: 0 }
          )
          toNode(biggerArray).$present<ArrayCommand>([{
            op: Operation.splice,
            path: '/players',
            value: [
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
            ],
            deleteCount: 3,
            start: 1,
          }])
          expect(getSnapshot(toInstance(biggerArray))).toEqual(
            getSnapshot(toInstance(world))
          )
        })
      })

      test('on primitive array, length is untouched: JSON patch generation', function() {
        getContext(toInstance(world)).step(() => {
          world.connectedPlayers.splice(0, 1, 'Elwein')
          expect(toNode(world.players).$state.migration).toEqual({
            forward: [
              {
                op: Operation.splice,
                path: '/connectedPlayers',
                start: 0,
                deleteCount: 1,
                value: ['Elwein'],
              },
            ],
            backward: [
              {
                op: Operation.splice,
                path: '/connectedPlayers',
                start: 0,
                deleteCount: 1,
                value: ['Fraktar'],
              },
            ],
          })
        })
      })

      test('on primitive array, change to smaller array: JSON patch generation', function() {
        getContext(toInstance(world)).step(() => {
          world.connectedPlayers.splice(1, 4, 'Troll', 'Troll', 'Troll')
          expect(toNode(world).$state.migration).toEqual({
            forward: [
              {
                op: Operation.splice,
                path: '/connectedPlayers',
                value: ['Troll', 'Troll', 'Troll'],
                deleteCount: 4,
                start: 1,
              },
            ],
            backward: [
              {
                op: Operation.splice,
                path: '/connectedPlayers',
                value: ['Elwein', 'Dreadbond', 'Cha', 'Ghost'],
                deleteCount: 3,
                start: 1,
              },
            ],
          })
        })
      })

      test('on primitive array, length is untouched: JSON patch apply forward', function() {
        let shouldBe: any
        getContext(toInstance(world)).step(() => {
          shouldBe = clone(world)
          shouldBe.connectedPlayers.splice(1, 1, 'Troll')
        })

        getContext(toInstance(world)).step(() =>
          toNode(world).$present<ArrayCommand>([{
            op: Operation.splice,
            path: '/connectedPlayers',
            start: 1,
            deleteCount: 1,
            value: ['Troll'],
          }])
        )
        expect(world.connectedPlayers.slice()).toEqual(
          shouldBe.connectedPlayers.slice()
        )
      })

      test('on primitive array, length is untouched: JSON patch apply backward', function() {
        const shouldBe = getSnapshot(toInstance(world)).connectedPlayers
        const arrayToReverse = clone(world).connectedPlayers
        getContext(toInstance(world)).step(() => {
          arrayToReverse.splice(1, 1, 'Troll')
        })
        getContext(toInstance(world)).step(() =>
          toNode(toInstance(arrayToReverse)).$present<ArrayCommand>([{
            op: Operation.splice,
            path: '/connectedPlayers',
            value: ['Elwein'],
            deleteCount: 1,
            start: 1,
          }])
        )
        const reversed = getSnapshot(toInstance(arrayToReverse))
        expect(reversed).toEqual(shouldBe)
      })

      test('on primitive array, change to smaller array: JSON patch apply forward', function() {
        getContext(toInstance(world)).step(() => {
          const smallerArray = clone(world)
          smallerArray.connectedPlayers.splice(1, 4, 'Troll', 'Troll', 'Troll')
          const targetSnapshot = getSnapshot(toInstance(smallerArray))
          toNode(world).$present<ArrayCommand>([{
            op: Operation.splice,
            path: '/connectedPlayers',
            value: ['Troll', 'Troll', 'Troll'],
            deleteCount: 4,
            start: 1,
          }])
          expect(getSnapshot(toInstance(world))).toEqual(targetSnapshot)
        })
      })

      test('on primitive array, change to smaller array: JSON patch apply backward', function() {
        getContext(toInstance(world)).step(() => {
          const smallerArray = clone(world)
          smallerArray.connectedPlayers.splice(1, 4, 'Troll', 'Troll', 'Troll')
          toNode(smallerArray).$present<ArrayCommand>([{
            op: Operation.splice,
            path: '/connectedPlayers',
            value: ['Elwein', 'Dreadbond', 'Cha', 'Ghost'],
            deleteCount: 3,
            start: 1,
          }])
          expect(getSnapshot(toInstance(smallerArray))).toEqual(
            getSnapshot(toInstance(world))
          )
        })
      })

      test('on primitive array, change to bigger array: JSON patch apply forward', function() {
        getContext(toInstance(world)).step(() => {
          const bigger = clone(world)
          bigger.connectedPlayers.splice(1, 2, 'Troll', 'Troll', 'Troll')
          const targetSnapshot = getSnapshot(toInstance(bigger))
          toNode(world).$present<ArrayCommand>([{
            op: Operation.splice,
            path: '/connectedPlayers',
            value: ['Troll', 'Troll', 'Troll'],
            deleteCount: 2,
            start: 1,
          }])
          expect(getSnapshot(toInstance(world))).toEqual(targetSnapshot)
        })
      })

      test('on primitive array, change to bigger array: JSON patch apply backward', function() {
        getContext(toInstance(world)).step(() => {
          const biggerArray = clone(world)
          biggerArray.connectedPlayers.splice(1, 2, 'Troll', 'Troll', 'Troll')
          toNode(biggerArray).$present<ArrayCommand>([{
            op: Operation.splice,
            path: '/connectedPlayers',
            value: ['Elwein', 'Dreadbond'],
            deleteCount: 3,
            start: 1,
          }])
          expect(getSnapshot(toInstance(biggerArray))).toEqual(
            getSnapshot(toInstance(world))
          )
        })
      })
    })
  })

  test('sort', function() {
    getContext(toInstance(world)).step(() => {
      expect(
        world.players.sort((a: any, b: any) => (a.name > b.name ? 1 : -1))[0]
          .name
      ).toBe('Cha')
    })
  })

  test('sort via JSON commands', function() {
    const ids = toNode(world.players)
      .$data.map(toInstance)
      .map(({ $id }: any) => $id)
    const commands = [
      {
        op: Operation.sort,
        path: '/players',
        commands: [
          {
            id: ids[0],
            from: 0,
            to: 4,
          },
          {
            id: ids[1],
            from: 1,
            to: 2,
          },
          {
            id: ids[2],
            from: 2,
            to: 3,
          },
          {
            id: ids[3],
            from: 3,
            to: 1,
          },
          {
            id: ids[4],
            from: 4,
            to: 0,
          },
        ],
      },
    ]
    getContext(toInstance(world)).step(() => toNode(toInstance(world.players)).$present<ArrayCommand>(commands))
    expect(world.players[4].name).toBe('Fraktar')
  })

  describe('unshift', function() {
    test('with primitive array', function() {
      getContext(toInstance(world)).step(() => {
        world.connectedPlayers.unshift('Troll', 'Troll')
      })
      expect(world.connectedPlayers.slice()).toEqual([
        'Troll',
        'Troll',
        'Fraktar',
        'Elwein',
        'Dreadbond',
        'Cha',
        'Ghost',
      ])
    })
    test('with object array', function() {
      getContext(toInstance(world)).step(() => {
        world.players.unshift(
          {
            name: 'Troll',
            hp: 0,
            level: 0,
          },
          {
            name: 'Troll',
            hp: 0,
            level: 0,
          }
        )
      })
      expect(getSnapshot(toInstance(world.players))).toEqual([
        {
          name: 'Troll',
          hp: 0,
          level: 0,
        },
        {
          name: 'Troll',
          hp: 0,
          level: 0,
        },
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
        {
          name: 'Cha',
          level: 2,
          hp: 5,
        },
        {
          name: 'Ghost',
          level: 2,
          hp: 5,
        },
      ])
    })
    test('with primitive array: JSON patch generation', function() {
      getContext(toInstance(world)).step(() => {
        world.connectedPlayers.unshift('Troll', 'Troll')
        expect(toNode(world).$state.migration).toEqual({
          forward: [
            {
              op: Operation.unshift,
              path: '/connectedPlayers',
              value: ['Troll', 'Troll'],
            },
          ],
          backward: [
            {
              op: Operation.splice,
              path: '/connectedPlayers',
              start: 0,
              deleteCount: 2,
            },
          ],
        })
      })
    })
    test('with object array: JSON patch generation', function() {
      getContext(toInstance(world)).step(() => {
        world.players.unshift(
          {
            name: 'Troll',
            hp: 0,
            level: 0,
          },
          {
            name: 'Troll',
            hp: 0,
            level: 0,
          }
        )
        expect(toNode(world).$state.migration).toEqual({
          forward: [
            {
              op: Operation.unshift,
              path: '/players',
              value: [
                {
                  name: 'Troll',
                  hp: 0,
                  level: 0,
                },
                {
                  name: 'Troll',
                  hp: 0,
                  level: 0,
                },
              ],
            },
          ],
          backward: [
            {
              op: Operation.splice,
              path: '/players',
              start: 0,
              deleteCount: 2,
            },
          ],
        })
      })
    })

    test('with primitive array: JSON patch forward application', function() {
      getContext(toInstance(world)).step(() =>
        toNode(world).$present<ArrayCommand>([{
          op: Operation.unshift,
          path: '/connectedPlayers',
          value: ['Troll', 'Troll'],
        }])
      )
      expect(world.connectedPlayers.slice()).toEqual([
        'Troll',
        'Troll',
        'Fraktar',
        'Elwein',
        'Dreadbond',
        'Cha',
        'Ghost',
      ])
    })
    test('with object array: JSON patch forward application', function() {
      getContext(toInstance(world)).step(() =>
        world.players.unshift(
          {
            name: 'Troll',
            hp: 0,
            level: 0,
          },
          {
            name: 'Troll',
            hp: 0,
            level: 0,
          }
        )
      )
      expect(getSnapshot(toInstance(world.players))).toEqual([
        {
          name: 'Troll',
          hp: 0,
          level: 0,
        },
        {
          name: 'Troll',
          hp: 0,
          level: 0,
        },
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
        {
          name: 'Cha',
          level: 2,
          hp: 5,
        },
        {
          name: 'Ghost',
          level: 2,
          hp: 5,
        },
      ])
    })
    test('with primitive array: JSON patch backward application', function() {
      getContext(toInstance(world)).step(() => {
        world.connectedPlayers.unshift('Troll', 'Troll')
      })
      getContext(toInstance(world)).step(() =>
        toNode(world).$present<ArrayCommand>([{
          op: Operation.splice,
          path: '/connectedPlayers',
          start: 0,
          deleteCount: 2,
        }])
      )
      expect(world.connectedPlayers.slice()).toEqual([
        'Fraktar',
        'Elwein',
        'Dreadbond',
        'Cha',
        'Ghost',
      ])
    })
    test('with object array: JSON patch backward application', function() {
      getContext(toInstance(world)).step(() =>
        world.players.unshift(
          {
            name: 'Troll',
            hp: 0,
            level: 0,
          },
          {
            name: 'Troll',
            hp: 0,
            level: 0,
          }
        )
      )
      getContext(toInstance(world)).step(() =>
        toNode(world).$present<ArrayCommand>([{
          op: Operation.splice,
          path: '/players',
          start: 0,
          deleteCount: 2,
        }])
      )
      expect(getSnapshot(toInstance(world.players))).toEqual([
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
        {
          name: 'Cha',
          level: 2,
          hp: 5,
        },
        {
          name: 'Ghost',
          level: 2,
          hp: 5,
        },
      ])
    })
  })

  test('set length', function() {
    getContext(toInstance(world)).step(() => {
      world.players.length = 1
      expect(toNode(world.players).$state.migration).toEqual({
        forward: [
          {
            op: Operation.setLength,
            value: 1,
            path: '/players',
          },
        ],
        backward: [
          {
            op: Operation.splice,
            start: 1,
            deleteCount: 0,
            path: '/players',
            value: [
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
              {
                name: 'Cha',
                level: 2,
                hp: 5,
              },
              {
                name: 'Ghost',
                level: 2,
                hp: 5,
              },
            ],
          },
        ],
      })
    })
    expect(world.players.length).toBe(1)
    expect(world.players[2]).toBeUndefined()
  })

  test('toString', function() {
    expect(world.players.toString()).toBe(
      '[object Object],[object Object],[object Object],[object Object],[object Object]'
    )
  })

  test('filter', function() {
    expect(world.players.filter(p => p.level > 1).length).toBe(4)

    // With primitives
    const a = array(number()).create([0, 1, 2, 3])
    expect(a.filter(c => c > 1)).toEqual([2, 3])
  })
})
