import { array } from '../src/array/factory'
import { getSnapshot, toInstance, toNode, getContext } from '../src/helpers'
import { isInstance, isLeafType, isNodeType } from '../src/lib'
import { object, cutDownUpdateOperation } from '../src/object'
import { number, string } from '../src/Primitive'
import { getGlobal } from '../src/utils/utils'
import { map } from '../src/map/factory'

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

describe('JSON migration generation', function() {
  beforeEach(function(){
    getGlobal().$$crafterContext.clearContainer
  })

  test('object update patch contains only leaf operation', function(){
    const model = object({
      player: object({
        name: string(),
        stats: object({
          health: number()
        })
      })
    }).create({player:{ name: "Fraktar", stats: { health: 10 }}})
  
    const context = getContext(toInstance(model))
  
    context.transaction(() => {
      model.player = {name: "Fraktos", stats: { health: 5 }}
      const patch = toNode(model).$patch.forward.sort((a, b) => a.path.length - b.path.length)
      expect(patch).toEqual([
        {op: "replace", path:"/player/name", value: "Fraktos"},
        {op: "replace", path:"/player/stats/health", value: 5}
      ].sort((a, b) => a.path.length - b.path.length))
    })
  })
  test('array replacement emit patch', function() {
    const model = object({
      inventory: array(object({id: string(), quantity: number()}))
    }).create()
    const context = getContext(toInstance(model))
    context.transaction(() => {
      model.inventory = [{id:'sword', quantity: 1}]
      const patch = toNode(model).$patch.forward
      expect(patch).toEqual([
        {op: "replace", path:"/inventory", value: [{id:'sword', quantity: 1}]}
      ])
    })
  })
  test('map replacement emit patch', function() {
    const model = object({
      inventory: map(number())
    }).create()
    const context = getContext(toInstance(model))
    context.transaction(() => {
      model.inventory = new Map([['sword', 1]])
      const patch = toNode(model).$patch.forward
      expect(patch).toEqual([
        {op: "replace", path:"/inventory", value: [['sword', 1]]}
      ])
    })
  })
})

describe('apply JSON operation', function() {
  /**
   * Any update operation on an object property must be a list or leaf operation
   */
  test('cut down update operation', function(){
    expect(cutDownUpdateOperation({
      name: 'Fraktar',
      stats: {
        health: 5,
        force: 5,
        buffs: {
          force: 4
        }
      }
    }, "/")).toEqual([
      {
        op: "replace",
        path: "/name",
        value: "Fraktar"
      },
      {
        op: "replace",
        path: "/stats/health",
        value: 5
      },
      {
        op: "replace",
        path: "/stats/force",
        value: 5
      },
      {
        op: "replace",
        path: "/stats/buffs/force",
        value: 4
      }
    ])
    expect(cutDownUpdateOperation({
      name: 'Fraktar',
      stats: {
        health: 5,
        force: 5,
        buffs: {
          force: 4
        }
      }
    }, "/player")).toEqual([
      {
        op: "replace",
        path: "/player/name",
        value: "Fraktar"
      },
      {
        op: "replace",
        path: "/player/stats/health",
        value: 5
      },
      {
        op: "replace",
        path: "/player/stats/force",
        value: 5
      },
      {
        op: "replace",
        path: "/player/stats/buffs/force",
        value: 4
      }
    ])
  })
})