import { array } from '../src/array/factory'
import { getSnapshot, toInstance, toNode } from '../src/helpers'
import { isInstance, isLeafType, isNodeType } from '../src/lib'
import { object } from '../src/object'
import { number, string } from '../src/Primitive'
import { getGlobal } from '../src'

test('Create complexe object Type', function() {
  const Player = object({
    name: string(),
    level: number(),
    stats: object({
      force: number(),
      health: number(),
    }),
  })

  expect(isNodeType(Player)).toBeTruthy()
  expect(isNodeType((Player as any).properties.stats)).toBeTruthy()
  expect(
    isLeafType((Player as any).properties.stats.properties.health)
  ).toBeTruthy()
})

test('Create instance from a complexe object Type', function() {
  const Player = object({
    name: string(),
    level: number(),
    stats: object({
      force: number(),
      health: number(),
    }),
  })
  const player1 = Player.create({
    name: 'Fraktar',
    level: 10,
    stats: {
      force: 1,
      health: 4,
    },
  })
  expect(isInstance(player1)).toBeTruthy()
  expect(isInstance(toNode(player1).$data.name)).toBeTruthy()
  expect(player1.name).toBe('Fraktar')
  expect(player1.stats.force).toBe(1)
  expect(player1.stats).toEqual({
    force: 1,
    health: 4,
  })
  expect(Object.keys(player1.stats).sort()).toEqual(['force', 'health'])
})

test('value', function() {
  const model = object({
    name: string(),
  }).create({ name: 'Fraktar' })
  expect(toNode(model).$value).toEqual({ name: 'Fraktar' })
})

test('snapshot', function() {
  const Slot = object({
    id: string(),
    quantity: number(),
  })

  const slot = Slot.create({
    id: 'sword',
    quantity: 1,
  })

  expect(getSnapshot(toInstance(slot))).toEqual({
    id: 'sword',
    quantity: 1,
  })
})

test('Validate a snapshot against an object Type', function() {
  const Player = object({
    name: string(),
    level: number(),
    stats: object({
      force: number(),
      health: number(),
    }),
  })
  expect(
    Player.isValidSnapshot({
      name: 'Fraktar',
      level: 10,
      stats: {
        force: 1,
        health: 4,
      },
    })
  ).toBeTruthy()
  expect(
    Player.isValidSnapshot({
      name: 'Fraktar',
      level: 10,
      stats: {
        force: '10',
        health: 4,
      },
    })
  ).toBeFalsy()
})

test('object can have array member', function() {
  const Player = object({
    name: string(),
    level: number(),
    hp: number(),
    inventory: array(
      object({
        itemId: string(),
        quantity: number(),
      })
    ),
  })
  expect(
    (Player as any).properties.inventory.itemType.properties.itemId
  ).toBeDefined()
})

test('Instance should have a parent', function() {
  const Player = object({
    name: string(),
    stats: object({
      health: number(),
    }),
  })

  // fixme stats is not created because no value?
  const stats = Player.create({ name: 's', stats: { health: 4 } }).stats

  expect(toNode(stats).$parent).toBeDefined()
})

test('valid value', function() {
  const Model = object({foo: string(), nested: object({bar: string()})})
  const model = Model.create()
  const snapshot = getSnapshot(toInstance(model))
  expect(Model.isValidValue(snapshot)).toBeTruthy()
  expect(Model.isValidValue(model)).toBeTruthy()
})