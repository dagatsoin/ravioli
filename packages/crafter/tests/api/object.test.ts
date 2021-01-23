//import { array } from '../src/array/factory'
import { getSnapshot, toInstance, toNode, getContext, setValue } from '../../src/helpers'
import { IInstance, isInstance, isLeafType, isNodeType, Operation } from '../../src/lib'
import { object } from '../../src/object'
import { number, string } from '../../src/Primitive'
import { getGlobal } from '../../src/utils/utils'
//import { computed } from '../src/observer/Computed'
import { autorun } from '../../src/observer/Autorun'
import { IContainer } from '../../src'

describe('factory', function() {
  test('Create instance from a complexe object Type', function() {
    const Item = object({
      id: string(),
      price: number()
    })
    const Player = object({
      name: string(),
      level: number(),
      stats: object({
        base: object({
          force: number(),
          health: number(),
        })
      }),
      equipment: object({
        chest: Item,
        legs: Item
      })
    })
    const player1 = Player.create({
      name: 'Fraktar',
      level: 10,
      stats: {
        base: {
          force: 1,
          health: 4,
        }
      },
      equipment: {
        chest: {
          id: "plate",
          price: 3
        },
        legs: {
          id: "pattern",
          price: 1
        },
      }
    })
    expect(isInstance(player1)).toBeTruthy()
    expect(isInstance(toNode(player1).$data.name)).toBeTruthy()
    expect(player1.name).toBe('Fraktar')
    expect(player1.stats.base.force).toBe(1)
    expect(player1.stats).toEqual({
      base: {
        force: 1,
        health: 4,
      }
    })
    expect(Object.keys(player1.stats.base).sort()).toEqual(['force', 'health'])
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
    add(context, instance)
    expect((player as any).isAdmin).toBeTruthy()
  })
  test('remove', function() {
    remove(context, instance)
    expect((player as any).name).toBeUndefined()
  })
  test('replace', function() {
    replace(context, instance)
    expect(player.name).toBe("Fraktos")
  })
  test('move', function() {
    move(context, instance)
    expect((player as any).name).toBeUndefined()
    expect((player as any).oldName).toBe("Fraktar")
    // remove added props
    context.step(() => instance.$present([{op: Operation.remove, path: '/oldName'}]))
  })
  test('copy', function() {
    copy(context, instance)
    expect((player as any).name).toBe("Fraktar")
    expect((player as any).oldName).toBe("Fraktar")
    // remove duplicate props
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

describe('get value', function() {
  const model = object({
    name: string(),
  }).create({ name: 'Fraktar' })
  test("get value after creation", function() {
    expect(toNode(model).$value).toEqual({ name: 'Fraktar' })
  })

  test("get value after a step", function(){
    getContext(toInstance(model)).step(()=>model.name = "Fraktos")
    expect(toNode(model).$value).toEqual({ name: 'Fraktos' })
  })
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
})

function copy(context: IContainer, instance: IInstance<unknown, unknown>) {
  context.step(() => instance.$present([
    { op: Operation.add, path: '/oldName', value: '' },
    { op: Operation.copy, from: '/name', path: '/oldName' } as any
  ]))
}

function move(context: IContainer, instance: IInstance<unknown, unknown>) {
  context.step(() => instance.$present([
    { op: Operation.add, path: '/oldName', value: '' },
    { op: Operation.move, from: '/name', path: '/oldName' } as any
  ]))
}

function replace(context: IContainer, instance: IInstance<unknown, unknown>) {
  context.step(() => instance.$present([{ op: Operation.replace, path: '/name', value: 'Fraktos' }]))
}

function remove(context: IContainer, instance: IInstance<unknown, unknown>) {
  context.step(() => instance.$present([{ op: Operation.remove, path: '/name' }]))
}

function add(context: IContainer, instance: IInstance<unknown, unknown>) {
  context.step(() => instance.$present([{ op: Operation.add, path: '/isAdmin', value: true }]))
}
