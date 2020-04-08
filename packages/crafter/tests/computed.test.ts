import { toInstance, getContext } from '../src/helpers'
import { observable } from '../src/lib/observable'
import { autorun } from '../src/observer/Autorun'
import { computed } from '../src/observer/Computed'
import { number, string } from '../src/Primitive'
import { object } from '../src/object'
import { getGlobal } from '../src/utils/utils'
import { isInstance } from '../src/lib/Instance'
import { CrafterContainer } from '../src'

const context = getGlobal().$$crafterContext

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
  })

  expect(context.snapshot.observerGraph.nodes.length).toBe(0)
  const dispose = autorun(() => {
    autoRunCount++
    appRepresentation.get()
  })

  expect(context.snapshot.observerGraph.nodes.length).toBe(2)

  expect(statsRepRunCount).toBe(0)
  expect(appRepRunCount).toBe(1)
  expect(autoRunCount).toBe(1)

  context.transaction(() => {
    model.isAlive = true
  })

  expect(context.snapshot.observerGraph.nodes.length).toBe(3)
  expect(statsRepRunCount).toBe(1)
  expect(appRepRunCount).toBe(2)
  expect(autoRunCount).toBe(2)
  dispose()
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
    })) // Need to set isBoxed param. Otherwize it will return an INodeInstance
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
})