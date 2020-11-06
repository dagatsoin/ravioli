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

describe('life cycle', function() {
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

  describe('START', function() {
    test('State should be clean', function() {
      function cb_START() {
        context.removeStepListener(StepLifeCycle.START, cb_START)
        expect(context.snapshot).toEqual(initialContext)
      }
      context.addStepListener(StepLifeCycle.START, cb_START)
      context.step(() => model.age++)
    })
    test('Context should have one alive observer', function() {
      function cb_START() {
        context.removeStepListener(StepLifeCycle.START, cb_START)
        expect(
          context.snapshot.activeGraph.nodes.filter(isObserver).length
        ).toBe(1)
      }
      context.addStepListener(StepLifeCycle.START, cb_START)
      context.step(() => model.age++)
    })
    test('Context should have 1 observed observable', function() {
      function cb_START() {
        context.removeStepListener(StepLifeCycle.START, cb_START)
        expect(
          context.snapshot.activeGraph.nodes.filter(isObservable).length
        ).toBe(1)
      }
      context.addStepListener(StepLifeCycle.START, cb_START)
      context.step(() => model.age++)
    })
  })

  describe('DID_UPDATE', function() {
    test('Context should have 1 updated observable', function() {
      function cb_DID_UPDATE() {
        context.removeStepListener(StepLifeCycle.DID_UPDATE, cb_DID_UPDATE)
        expect(context.snapshot.updatedObservables[0]).toBe(
          toInstance(model).$data.age
        )
      }
      context.addStepListener(StepLifeCycle.DID_UPDATE, cb_DID_UPDATE)
      context.step(() => model.age++)
    })

    test('Context should have a migration', function() {
      function cb_DID_UPDATE() {
        context.removeStepListener(StepLifeCycle.DID_UPDATE, cb_DID_UPDATE)
        expect(context.snapshot.migration).toEqual({
          forward: [
            {
              op: 'replace',
              path: '/model/age',
              value: 2,
            },
          ],
          backward: [
            {
              op: 'replace',
              path: '/model/age',
              value: 1,
            },
          ],
        })
      }
      context.addStepListener(StepLifeCycle.DID_UPDATE, cb_DID_UPDATE)
      context.step(() => model.age++)
    })
  })

  describe('DID_PROPAGATE', function() {
    test('Context should have one stale observer', function() {
      function cb_DID_PROPAGATE() {
        context.removeStepListener(
          StepLifeCycle.DID_PROPAGATE,
          cb_DID_PROPAGATE
        )
        expect(
          context.snapshot.activeGraph.nodes.filter(isObserver)[0].isStale
        ).toBeTruthy()
      }
      context.addStepListener(StepLifeCycle.DID_PROPAGATE, cb_DID_PROPAGATE)
      context.step(() => model.age++)
    })
  })
})

describe('Atomicity', function() {})

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
