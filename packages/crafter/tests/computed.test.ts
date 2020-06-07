/* import { toInstance, getContext, toLeaf } from '../src/helpers'
import { getObservable, observable } from '../src/lib/observable'
import { autorun } from '../src/observer/Autorun'
import { computed } from '../src/observer/Computed'
import { number, string } from '../src/Primitive'
import { object } from '../src/object'
import { getGlobal } from '../src/utils/utils'
import { isInstance } from '../src/lib/Instance'
import { CrafterContainer } from '../src'

const context = getGlobal().$$crafterContext

beforeEach(context.clearContainer)

test("Computed notifies read when accessed", function() {
  context.clearContainer()
  const model = object({
    stats: object({
      health: number()
    })
  }).create({stats: {health: 0}})
   
  const observed = computed(() => model.stats.health)

  let observedPaths
  let leafId

  const dispose = autorun(() => {
    observed.get()
    const spyId = context.snapshot.spyReactionQueue[0]
    leafId = toLeaf(context.snapshot.dependencyGraph.nodes[context.snapshot.dependencyGraph.nodes.length - 1]).$id
    observedPaths = context.snapshot.spiedObserversDependencies.get(spyId)
  })
  expect(observedPaths).toEqual(["/" + leafId])
  dispose()
})

test('Computed is evaluated and register in the manager lazily, when triggered from an autorun', function() {
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

  expect(context.snapshot.dependencyGraph.nodes.length).toBe(0)
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
  /* expect(context.snapshot.dependencyGraph.nodes.length).toBe(4)

  expect(statsRepRunCount).toBe(0)
  expect(appRepRunCount).toBe(1)
  expect(autoRunCount).toBe(1)

  context.transaction(() => {
    model.isAlive = true
  })

  expect(context.snapshot.dependencyGraph.nodes.length).toBe(3)
  expect(statsRepRunCount).toBe(1)
  expect(appRepRunCount).toBe(2)
  expect(autoRunCount).toBe(2)
  dispose()
})

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