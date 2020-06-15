//import { array } from '../src/array/factory'
import { getSnapshot, toInstance, toNode, getContext, setValue } from '../src/helpers'
import { isInstance, isLeafType, isNodeType, Operation } from '../src/lib'
import { object } from '../src/object'
import { number, string } from '../src/Primitive'
import { getGlobal } from '../src/utils/utils'
//import { computed } from '../src/observer/Computed'
import { autorun } from '../src/observer/Autorun'

describe('factory', function() {
/*   test('Object Type', function() {
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
  test("Create instance from simple object type", function() {
    const Fraktar = object({
      name: string(),
      level: number()
    }).create({
      name: "Fraktar",
      level: 1
    })
    expect(Fraktar.name).toBe("Fraktar")
    expect(Fraktar.level).toBe(1)
  })*/

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
})

describe('JSON commands', function(){
  const player = object({
    name: string('Fraktar'),
    level: number(100)
  }).create()
  const instance = toInstance(player)
  const context = getContext(instance)

  beforeEach(function() {
    context.step(function() {
      setValue(player, {
        name: 'Fraktar',
        level: 100
      })
    })
  })
  test('add', function() {
    context.step(() => instance.$present([{op: Operation.add, path: '/isAdmin', value: true}]))
    expect((player as any).isAdmin).toBeTruthy()
  })
  test('remove', function() {
    context.step(() => instance.$present([{op: Operation.remove, path: '/isAdmin'}]))
    expect((player as any).isAdmin).toBeUndefined()
  })
  test('replace', function() {
    context.step(() => instance.$present([{op: Operation.replace, path: '/name', value: 'Fraktos'}]))
    expect(player.name).toBe("Fraktos")
  })
  test('move', function() {
    context.step(() => instance.$present([
      {op: Operation.add, path: '/oldName', value: ''},
      {op: Operation.move, from: '/name', path: '/oldName'} as any
    ]))
    expect((player as any).name).toBeUndefined()
    expect((player as any).oldName).toBe("Fraktar")
    context.step(() => instance.$present([{op: Operation.remove, path: '/oldName'}]))
  })
  test('copy', function() {
    context.step(() => instance.$present([
      {op: Operation.add, path: '/oldName', value: ''},
      {op: Operation.copy, from: '/name', path: '/oldName'} as any
    ]))
    expect((player as any).name).toBe("Fraktar")
    expect((player as any).oldName).toBe("Fraktar")
    context.step(() => instance.$present([{op: Operation.remove, path: '/oldName'}]))
  })
})

describe('mutation', function() {
  const player = object({
    name: string('Fraktar'),
    level: number(1),
    stats: object({
      health: number(1),
      force: number(1)
    })
  }).create()
  
  test('replace leaf', function() {
    getContext(toInstance(player)).step(() => player.stats.health++)
    expect(player.stats.health).toBe(2)
  })

  test('replace node', function() {
    getContext(toInstance(player)).step(() => player.stats = {health: 10, force: 5})
    expect(player.stats.health).toBe(10)
  })

  test('replace root', function() {
    getContext(toInstance(player)).step(() => setValue(player, {
      name: 'Fraktos',
      level: 10,
      stats: {health: 10, force: 5}
    }))
    expect(getSnapshot(player)).toEqual({
      name: 'Fraktos',
      level: 10,
      stats: {health: 10, force: 5}
    })
  })
})

describe('reactivity', function() {
  const player = object({
    name: string('Fraktar'),
    level: number(1),
    stats: object({
      health: number(1),
      force: number(1)
    })
  }).create()

/*   test('react on leaf change', function() {
    const dispose = autorun(function({isFirstRun}){
      player.stats.health
      if(!isFirstRun) expect(player.stats.health).toBe(2)
    })
    getContext(toInstance(player)).step(() => player.stats.health++)
    dispose()
  }) */
  
  test('react on node change, not on leaf change', function() {
    let run = 0
    const context = getContext(toInstance(player))
    const dispose = autorun(function(){
      player.stats
      run++
    })
 //   context.step(() => player.stats.health++)
    context.step(() => player.stats = {
      health: 10,
      force: 1
    })
    // Autorun ran twice, one for initialization, one when the node has changed. Not when the lead has changed.
    expect(run).toBe(2)
    dispose()
  })
  
  
})

/*
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
}) */

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
  const Model = object({ foo: string(), nested: object({ bar: string() }) })
  const model = Model.create()
  const snapshot = getSnapshot(toInstance(model))
  expect(Model.isValidValue(snapshot)).toBeTruthy()
  expect(Model.isValidValue(model)).toBeTruthy()
}) /* 
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
}) */

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
