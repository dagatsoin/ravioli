/**
 * A derivation is a view of the model. It hides the real data behind a readonly transformed value.
 * 
 * A derivation can be composed from other derivations, coming from the same or other models.
 * 
 * A derivation output can be any value, a primitive, a complexe object, an observable or even a binary files.
 * 
 * A derivation is a memoizing function. If the observables used in the computation have not change, it just returns
 * a ref to the current value, running updated only when needed. It is possible (and recommanded) to use derivation
 * in thight loop, like a game engine.
 * 
 * Also, if a Derivation has been recomputed but its value did not change, the Reaction won't be retriggered.
 * 
 * If you return an observable object, the reactions which use it will react only for the piece
 * of the observable which actually changed.
 * 
 * Eg: If a derivation returns this object
 * {
 *   name: "Fraktar"
 *   stats: {
 *     health: 10
 *   }
 * }
 * and a Autorun uses only the `name` field. If `health` changes, the autorun will update.
 * 
 * For maximum efficiency, it is recommanded to compose complex derivations in smaller derivations.
 * Eg: in a MMO, the world server is the model. The client just sees a derivation of this world.
 * If you put something in you inventory, the entire world does not need to recompute. So to avoid
 * useless computation (even if they are efficient), just split you inventory in a child derivation.
 * Then, only this derivation will recompute and you won't iterate over thoushands of entities.
 */

import { autorun } from '../../src/observer/Autorun'
import { derived } from '../../src/observer/Derivation'
import { number} from '../../src/Primitive'
import { object } from '../../src/object'
import { getGlobal } from '../../src/utils/utils'

const context = getGlobal().$$crafterContext

beforeEach(context.clearContainer)

describe("A derivation is reactive", function() {
  context.clearContainer()
  const model = object({
    stats: object({
      health: number()
    })
  }).create({stats: {health: 0}})
   
  const health = derived(() => model.stats.health, {isInstance: false})

  test("primitive", function() {
    let run = 0
  
    const dispose = autorun(() => {
      health.get()
      run++
    })
    context.step(() => model.stats.health++)
    expect(run).toBe(2)
    dispose()
  })
  test.todo("object")
  test.todo("observable primitive")
  test.todo("observable object")
  test.todo("observable map")
  test.todo("observable array")
})

describe("A derivation is readonly", function() {
  test.todo("I can't write on a derivated observable")
  test.todo("Even in an step")
})

test.todo("A derivation can be composed")

/* test('Computed is evaluated and register in the manager lazily, when triggered from an autorun', function() {
  const model = observable({
    name: 'Fraktar',
    isAlive: false,
    stats: {
      health: 10,
      force: 4,
    },
  })
  
  let statsRepRunCount = 0
  let appRepRunCount = 0
  let autoRunCount = 0
  
  const statsRepresentation = computed(() => {
    statsRepRunCount++
    return { health: model.isAlive ? model.stats.health : 0 }
  })
  
 const appRepresentation = computed<{
    name: string
    stats?: { health: number }
  }>(() => {
    appRepRunCount++
    return {
      name: model.name,
      stats: model.isAlive ? statsRepresentation.get() : undefined,
    }
  }, {useOptional: true})
  
  expect(context.snapshot.activeGraph.nodes.length).toBe(0)
 const dispose = autorun(() => {
    autoRunCount++
    appRepresentation.get()
  }) */

  /**
   * 4 nodes:
   * - autorun
   * - computed
   * - computed value node
   * - computed value/stats
   */
/*  expect(context.snapshot.activeGraph.nodes.length).toBe(4)

  expect(statsRepRunCount).toBe(0)
  expect(appRepRunCount).toBe(1)
  expect(autoRunCount).toBe(1)

  context.step(() => {
    model.isAlive = true
  })

  expect(context.snapshot.activeGraph.nodes.length).toBe(3)
  expect(statsRepRunCount).toBe(1)
  expect(appRepRunCount).toBe(2)
  expect(autoRunCount).toBe(2)
  dispose() *//*
})
/*
test('Computed always return the same observable', function() {
  const model = observable({
    name: 'Fraktar',
    health: 10,
    force: 4,
  })

  const statsRepresentation = computed(() => ({ health: model.health }))
  const initialId = getObservable(statsRepresentation.get()).$id

  context.transaction(() => {
    model.health = 11
  })

  const newId = getObservable(statsRepresentation.get()).$id
  expect(newId === initialId).toBeTruthy()
})

test('Unused computed are not recomputed when their deps change', function() {
  getGlobal().$$crafterContext.clearContainer()
  const model = observable({
    name: 'Fraktar',
    isAlive: true,
    stats: {
      health: 10,
      force: 4,
    },
  })

  let statsRepRunCount = 0
  let appRepRunCount = 0
  let autoRunCount = 0
  let health

  const statsRepresentation = computed(() => {
    statsRepRunCount++
    return { health: model.isAlive ? model.stats.health : 0 }
  })

  const appRepresentation = computed<{
    name: string
    stats?: { health: number }
  }>(() => {
    appRepRunCount++
    return {
      name: model.name,
      stats: model.isAlive ? statsRepresentation.get() : undefined,
    }
  })

  const dispose = autorun(() => {
    autoRunCount++
    health = appRepresentation.get().stats?.health
  })

  expect(health).toBe(10)
  expect(statsRepRunCount).toBe(1)
  expect(appRepRunCount).toBe(1)
  expect(autoRunCount).toBe(1)

  context.transaction(() => {
    model.isAlive = false
  })
  expect(statsRepRunCount).toBe(1)
  expect(appRepRunCount).toBe(2)
  expect(autoRunCount).toBe(2)

  context.transaction(() => {
    model.stats.health = 1
  })

  expect(health).toBe(undefined)
  expect(statsRepRunCount).toBe(1)
  expect(appRepRunCount).toBe(2)
  expect(autoRunCount).toBe(2)
  dispose()
})

describe('Compute a boxed value', function() {
  test("expression returns a leaf instance", function() {
    const model = number().create(0)
    const computedValue = computed(() => model) // No need to set isBoxed param.
    autorun(({isFirstRun, dispose}) => {
      const value = computedValue.get()
      expect(isInstance(value)).toBeFalsy()
      if (isFirstRun) {
        expect(value).toEqual(0)
      } else {
        expect(value).toEqual(1)
        dispose()
      }
    })
    context.transaction(() => toInstance(model).$setValue(1))
  })

  test("expression returns a non observable object", function() {
    const model = object({count: number()}).create({count: 0})
    const computedValue = computed(() => ({
      count: model.count
    }), {isBoxed: true}) // Need to set isBoxed param. Otherwize it will return an INodeInstance
    let count
    autorun(() => {
      const value = computedValue.get()
      expect(isInstance(value)).toBeFalsy()
      count = value.count
    })
    getContext(toInstance(model)).transaction(() => model.count++)
    expect(count).toBe(1)
  })

  test("expression returns a primitive", function() {
    const model = object({count: number()}).create({count: 0})
    const computedValue = computed(() => model.count,) // No need to set isBoxed param.
    let count
    autorun(() => {
      const value = computedValue.get()
      expect(isInstance(value)).toBeFalsy()
      count = value
    })
    getContext(toInstance(model)).transaction(() => model.count++)
    expect(count).toBe(1)
  })
})

describe('Compute an observable value', function() {
  test("expression returns an observable object", function() {
    const model = object({count: number()}).create({count: 0})
    const computedValue = computed(() => ({count: model.count}))
    let count
    autorun(() => {
      const value = computedValue.get()
      expect(isInstance(value)).toBeTruthy()
      count = value.count
    })
    getContext(toInstance(model)).transaction(() => model.count++)
    expect(count).toBe(1)
  })
  test("expression returns an observable array", function() {
    const model = object({count: number()}).create({count: 0})
    const computedValue = computed(() => {
      const ret = []
      for (let i = 0; i < model.count; i++) {
        ret.push(i)
      }
      return ret
    })
    let count
    autorun(() => {
      const value = computedValue.get()
      expect(isInstance(value)).toBeTruthy()
      count = value.length
    })
    getContext(toInstance(model)).transaction(() => model.count++)
    expect(count).toBe(1)
  })
  test("expression returns an observable map", function() {
    const model = object({count: number()}).create({count: 0})
    const computedValue = computed(() => {
      const ret = new Map()
      for (let i = 0; i < model.count; i++) {
        ret.set(i, i)
      }
      return ret
    })
    let size
    autorun(() => {
      const value = computedValue.get()
      expect(isInstance(value)).toBeTruthy()
      size = value.size
    })
    getContext(toInstance(model)).transaction(() => model.count++)
    expect(size).toBe(1)
  })
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
 *//*
test("Reshape an existing type", function() {
  const Model = object({
    health: number()
  })

  const representation = computed(() => ({
    stats: model.health > 0
      ? {
        health: model.health
      }
      : undefined
  }))

  const model = Model.create({health: 10})
  let reshaped: any

  const dispose = autorun(() => reshaped = representation.get())
  
  expect(reshaped.stats.health).toBe(10)

  context.transaction(() => {
    model.health = 0
  })
  
  expect(reshaped.stats).toBeUndefined()

  dispose()
})

test("Computed notify read even if its context is not running reaction", function(){
  const privateContext0 = new CrafterContainer()
  const privateContext1 = new CrafterContainer()
  const publicContext = getGlobal().$$crafterContext
  const model0 = object({count: number()}).create({count: 0}, {context: privateContext0})
  const model1 = object({foo: string()}).create({foo: 'bar'}, {context: privateContext1})
  const computed0 = computed(() => ({
    count: model0.count
  }), {contexts: {
    output: publicContext,
    source: privateContext0
  }})
  const computed1 = computed(() => ({
    foo: model1.foo
  }), {contexts: {
    output: publicContext,
    source: privateContext1
  }})
  let count = 0
  let foo = ''
  let run = 0
  autorun(() => {
    run++
    count = computed0.get().count
    foo = computed1.get().foo
  })
  privateContext1.transaction(() => model1.foo = "foo")
  publicContext.presentPatch([{
    path: toInstance(model1).$id + '/foo',
    op: 'replace',
    value: 'foo'
  } as any])
  privateContext0.transaction(() => model0.count++)
  publicContext.presentPatch([{
    path: toInstance(model0).$id + '/count',
    op: 'replace',
    value: '1'
  } as any])
  expect(run).toBe(3)
  expect(foo).toBe('foo')
  expect(count).toBe(1)
}) */