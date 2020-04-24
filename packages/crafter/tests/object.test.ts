import { array } from '../src/array/factory'
import { getSnapshot, toInstance, toNode, getContext } from '../src/helpers'
import { isInstance, isLeafType, isNodeType } from '../src/lib'
import { object } from '../src/object'
import { number, string } from '../src/Primitive'
import { getGlobal } from '../src/utils/utils'
import { computed } from '../src/observer/Computed'
import { autorun } from '../src/observer/Autorun'

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

/**
 * In some case (Computed scenario) the value may have more or less key than the previous value.
 * 
 * Example : A Computed value "player"
 * If it is alive its stats are present in the return value. If it is dead the stats field are not present.
 * 
 * After reran the computed expression, Computed will reset the value of its observable container.
 * If the previous value if this observable had a "stats" field, it must be removed.
 * 
 * In short, we must dynamicaly adapt the Computed Type on each run.
 * 
 * To implements that, we need to check, for a given valid value, if the shape of the observable is conform.
 * If not, we need to detect the extra or missing keys in the Type properties and create or remove them.
 */
test("Reshape an existing type", function() {
  const Model = object({
    stats: object({
      health: number()
    })
  })

  const model = Model.create({stats: {health: 0}})
  
  const context = getGlobal().$$crafterContext
  
  context.transaction(() => {
    // simulate a reaction
    (context as any).state.spyReactionQueue.push("xx")
    toInstance(model).$setValue({stats: undefined});
    (context as any).state.spyReactionQueue.pop()
  })

  expect(model.stats?.health).toBeUndefined()

  context.transaction(() => {
    // simulate a reaction
    (context as any).state.spyReactionQueue.push("xx")
    toInstance(model).$setValue({stats: {health: 10}});
    (context as any).state.spyReactionQueue.pop()
  })

  expect(model.stats.health).toBe(10)
})

test('Accept computed as property', function() {
  const player = object({
    armor: number(),
    health: number(),
    stat: computed((self: any) => ({
      health: self.armor + self.health
    }))
  }).create({armor: 1, health: 1} as any)

  let stat
  
  expect(player.stat.health).toBe(2)
  
  autorun(() => stat = {...player.stat})

  expect(stat).toEqual({ health: 2 })

  getContext(toInstance(player)).transaction(() => player.health = 2)

  expect(stat).toEqual({ health: 3 })
})

test("replace the value with $setValue", function(){
  const model = object({
    name: string(),
    stats: object({
      health: number()
    })
  }).create()
  getContext(toInstance(model)).transaction(() => {
    toInstance(model).$setValue({
      name: "Fraktar",
      stats: {
        health: 10
      }
    })
  })
  expect(getSnapshot(model)).toEqual({
    name: "Fraktar",
    stats: {
      health: 10
    }
  })
})