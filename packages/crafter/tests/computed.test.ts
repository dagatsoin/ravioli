import { sync, toInstance, getContext } from '../src/helpers'
import { getObservable, observable } from '../src/lib/observable'
import { autorun } from '../src/observer/Autorun'
import { computed } from '../src/observer/Computed'
import { number } from '../src/Primitive'
import { object } from '../src/object'
import { getGlobal } from '../src/utils/utils'

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

test('Computed is a reactive source', function() {
  context.clearContainer()
  const model = observable({
    name: 'Fraktar',
    stats: {
      health: 10,
      force: 4,
    },
  })

  const statsRepresentation = computed(() => ({ health: model.stats.health }))

  const representation = {
    name: model.name,
    stats: { health: model.stats.health },
  }

  let run = 0
  const dispose = autorun(() => {
    run++
    representation.name = model.name
    representation.stats = statsRepresentation.get()
  })
  expect(context.snapshot.observerGraph.nodes.length).toBe(2)
  expect(representation.stats).toEqual({ health: 10 })

  context.transaction(() => {
    model.stats.health = 11
  })

  expect(run).toBe(2)
  expect(representation.stats).toEqual({ health: 11 })
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

it('should clone an observable and sync its value on each change', function() {
  const titles = new Map()
  titles.set(0, 'Noob')
  titles.set(1, 'Not so bad')
  const source = observable({
    name: 'Fraktar',
    inventory: [
      {
        id: 'sword',
        quantity: 2,
      },
    ],
    titles,
    questLog: {
      current: {
        id: 0,
        todo: ['dzdz', 'dzqd'],
      },
    },
  })
  const target = sync(source)

  expect(target.questLog.current.id).toBe(0)
  context.transaction(() => {
    source.questLog.current.id = 1
  })
  expect(target.questLog.current.id).toBe(1)
})

describe('Unbox value when returning a primitive', function() {
  test("model is a primitive", function() {
    const model = number().create(0)
    const computedValue = computed(() => model)
    autorun(({isFirstRun, dispose}) => {
      if (isFirstRun) {
        expect(computedValue.get()).toEqual(0)
      } else {
        expect(computedValue.get()).toEqual(1)
        dispose()
      }
    })
    context.transaction(() => toInstance(model).$setValue(1))
  })

  test("model is a an object", function() {
    const model = object({count: number()}).create({count: 0})
    const computedValue = computed(() => model.count)
    autorun(({isFirstRun, dispose}) => {
      if (isFirstRun) {
        expect(computedValue.get()).toEqual(0)
      } else {
        expect(computedValue.get()).toEqual(1)
        dispose()
      }
    })
    context.transaction(() => model.count++)
  })

  test("react when the computed value is a primitive", function() {
    const model = object({count: number()}).create({count: 0})
    const computedValue = computed(() => model.count)
    let count
    autorun(() => count = computedValue.get())
    getContext(toInstance(model)).transaction(() => model.count++)
    expect(count).toBe(1)
  })

  test("react when the computed value is not observable", function() {
    const model = object({count: number()}).create({count: 0})
    const computedValue = computed(() => ({count: model.count}), {isObservable: false})
    let count
    autorun(() => count = computedValue.get().count)
    getContext(toInstance(model)).transaction(() => model.count++)
    expect(count).toBe(1)
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
 */
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
  let reshaped

  const dispose = autorun(() => reshaped = representation.get())

  const context = getGlobal().$$crafterContext
  
  expect(reshaped.stats.health).toBe(10)

  context.transaction(() => {
    model.health = 0
  })
  
  expect(reshaped.stats).toBeUndefined()

  dispose()
})