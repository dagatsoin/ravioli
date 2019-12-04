import { object } from '../src/object'
import { number, string } from '../src/Primitive'
import { isLeafType, isNodeType, isInstance, getLeafInstance } from '../src/lib'
import { array } from '../src/array/factory'
import { getParent, getSnapshot } from '../src/utils'
import { getNode } from '../src/helpers'

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
  expect(isInstance(getLeafInstance(getNode(player1), 'name'))).toBeTruthy()
  expect(player1.name).toBe('Fraktar')
  expect(player1.stats.force).toBe(1)
  expect(player1.stats).toEqual({
    force: 1,
    health: 4,
  })
  expect(Object.keys(player1.stats).sort()).toEqual(['force', 'health'])
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

  expect(getSnapshot(slot)).toEqual({
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
    Player.isValidValue({
      name: 'Fraktar',
      level: 10,
      stats: {
        force: 1,
        health: 4,
      },
    })
  ).toBeTruthy()
  expect(
    Player.isValidValue({
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

  expect(getParent(getNode(stats))).toBeDefined()
})
