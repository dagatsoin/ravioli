import {
  StepLifeCycle,
  object,
  string,
  number,
  getContext,
  toInstance,
  Migration,
  autorun,
  isObserver,
  IContainer,
  applySnapshot,
  CrafterContainer,
} from '../../src'
import { isObservable, observable } from '../../src/lib/observable'

describe('step lifecycle', function() {
  // We need to compare context. As other tests will update context as well, we need
  // to use another context isolated from the other tests.
  const context = new CrafterContainer()
  const snapshot = {
    name: 'Fraktar',
    age: 1,
  }
  const model = object({
    name: string(),
    age: number(),
  }).create(snapshot, { id: 'model', context })

  const dispose = autorun(() => model.age, context)

  const initialContext = context.snapshot

  beforeEach(function() {
    applySnapshot(model, snapshot)
  })

  afterAll(function() {
    dispose()
  })

  test('START', function() {
    let triggered = false
    function cb_START() {
      context.removeStepListener(StepLifeCycle.START, cb_START)
      triggered = true
    }
    context.addStepListener(StepLifeCycle.START, cb_START)
    context.step(() => model.age++)
    expect(triggered).toBeTruthy()
  })

  test('DID_UPDATE', function() {
    let triggered = false
    function cb_DID_UPDATE() {
      context.removeStepListener(StepLifeCycle.DID_UPDATE, cb_DID_UPDATE)
      triggered = true
    }
    context.addStepListener(StepLifeCycle.DID_UPDATE, cb_DID_UPDATE)
    context.step(() => model.age++)
    expect(triggered).toBeTruthy()
  })

  test('DID_PROPAGATE', function() {
    let triggered = false
    function DID_PROPAGATE() {
      context.removeStepListener(StepLifeCycle.DID_PROPAGATE, DID_PROPAGATE)
      triggered = true
    }
    context.addStepListener(StepLifeCycle.DID_PROPAGATE, DID_PROPAGATE)
    context.step(() => model.age++)
    expect(triggered).toBeTruthy()
  })
})

describe('step', function() {
  const model = observable({
    name: 'TnT',
  })
  const context = getContext(toInstance(model))

  test('Throw in a step will rollback the mutated observable', function() {
    try {
      context.step(function() {
        model.name = 'Fraktos'
      })
    } catch (e) {
      expect(model.name).toBe('TnT')
    }
  })

  test('Throw in nested step cancel the whole stack', function() {
    try {
      context.step(function() {
        model.name = 'Fraktos'
        context.step(function() {
          model.name = 'Elwein'
          throw new Error('muhahAHAHAhaha')
        })
        model.name = 'Fraktar'
      })
    } catch (e) {
      expect(model.name).toBe('TnT')
    }
  })

  test('All steps act as a big step and leads only to one learning phase', function() {
    let count = 0

    const disposer = autorun(() => {
      model.name
      count++
    })

    context.step(function() {
      model.name = 'Fraktos'
      context.step(function() {
        model.name = 'Elwein'
      })
      model.name = 'Fraktar'
    })

    expect(model.name).toBe('Fraktar')
    expect(count).toBe(2)
    disposer()
  })
})

/* import { array } from '../src/array/factory'
import { container } from '../src/lib/container/factory'
import { map } from '../src/map/factory'
import { object } from '../src/object/factory'
import { string } from '../src/Primitive'
import { getContext } from '../src/helpers'
import { observable } from '../src'

test('wrap a leaf type', function() {
  const model = object({ name: container(string()) })
  const Fraktar = model.create({ name: 'Fraktar' })
  expect(Fraktar.name).toBe('Fraktar')
})

test('array/map methods are not enumerable', function() {
  const model = object({
    array: container(array(string())),
    map: container(map(string())),
  })
  const instance = model.create({
    array: ['Fraktar'],
    map: [['0', 'Fraktar']],
  })
  expect(Object.keys(instance.array)).toEqual(['0'])
  expect(Object.keys(instance.map)).toEqual([])
  expect(instance.array.find).toBeDefined()
  expect(instance.map.clear).toBeDefined()
})

describe('array value binding', function() {
  const model = object({
    players: container(array(object({ name: string() }))),
  })
  let instance: any

  beforeEach(function() {

    instance = model.create({ players: [
      { name: 'Fraktar' },
      { name: 'Elwein' },
      { name: 'Dreadbond' },
      { name: 'Cha' },
      { name: 'Ghost' }
    ] })
  })

  test('at creation', function() {
    expect(instance.players[0]).toEqual({ name: 'Fraktar' })
    expect(Object.keys((instance as any).$data.players.$targetInstance).length).toBe(Object.keys(instance.players).length)
  })

  describe('after multiple keys removal to target array', function(){
    test('splice', function() {
      getContext(instance).transaction(() => instance.players.splice(0, 3, {name: 'Fraktos'}))
      expect(Object.keys((instance as any).$data.players.$targetInstance).length).toBe(Object.keys(instance.players).length)
    })

    test('shift', function() {
      getContext(instance).transaction(() => instance.players.shift())
      expect(Object.keys((instance as any).$data.players.$targetInstance).length).toBe(Object.keys(instance.players).length)
    })
   
    test('pop', function() {
      getContext(instance).transaction(() => instance.players.pop())
      expect(Object.keys((instance as any).$data.players.$targetInstance).length).toBe(Object.keys(instance.players).length)
    })

    test('decrease length', function() {
      getContext(instance).transaction(() => instance.players.length = 1)
      expect(Object.keys((instance as any).$data.players.$targetInstance).length).toBe(Object.keys(instance.players).length)
    })

  })

  describe('after multiple keys addition to target array', function(){
    test('splice', function() {
      getContext(instance).transaction(() => instance.players.splice(0, 1, {name: 'Troll'}, {name: 'Troll'}, {name: 'Troll'}))
      expect(Object.keys((instance as any).$data.players.$targetInstance).length).toBe(Object.keys(instance.players).length)
    })

    test('unshift', function() {
      getContext(instance).transaction(() => instance.players.unshift({name: 'Troll'}, {name: 'Troll'}))
      expect(Object.keys((instance as any).$data.players.$targetInstance).length).toBe(Object.keys(instance.players).length)
    })
   
    test('push', function() {
      getContext(instance).transaction(() => instance.players.push({name: 'Troll'}, {name: 'Troll'}))
      expect(Object.keys((instance as any).$data.players.$targetInstance).length).toBe(Object.keys(instance.players).length)
    })

    test('increase length', function() {
      getContext(instance).transaction(() => instance.players.length = 10)
      expect(Object.keys((instance as any).$data.players.$targetInstance).length).toBe(Object.keys(instance.players).length)
    })
  })
})

test('array function binding', function() {
  const model = object({
    players: container(array(object({ name: string() }))),
  })
  const instance = model.create({ players: [{ name: 'Fraktar' }] })
  expect(instance.players.slice()).toEqual([{ name: 'Fraktar' }])
}) */
