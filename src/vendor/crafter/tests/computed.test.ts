import { observable } from '../src/lib/observable'
import * as STManager from '../src/STManager'
import { autorun } from '../src/observer/Autorun'
import { computed } from '../src/observer/Computed'
import { IObservable } from '../src/IObservable'

test('Computed is evaluated and register in the manager lazily. Aka, when trigger from an autorun', function() {
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

  expect(STManager.getState().observerGraph.nodes.length).toBe(0)
  const dispose = autorun(() => {
    autoRunCount++
    appRepresentation.get()
  })

  expect(STManager.getState().observerGraph.nodes.length).toBe(2)

  expect(statsRepRunCount).toBe(0)
  expect(appRepRunCount).toBe(1)
  expect(autoRunCount).toBe(1)

  STManager.transaction(() => {
    model.isAlive = true
  })

  expect(STManager.getState().observerGraph.nodes.length).toBe(3)
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
  const initialId = (statsRepresentation.get() as IObservable).$id

  STManager.transaction(() => {
    model.health = 11
  })

  const newId = (statsRepresentation.get() as IObservable).$id
  expect(newId === initialId).toBeTruthy()
})

test('Computed is a reactive source', function() {
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
  expect(STManager.getState().observerGraph.nodes.length).toBe(3)
  expect(representation.stats).toEqual({ health: 10 })

  STManager.transaction(() => {
    model.stats.health = 11
  })

  expect(run).toBe(2)
  expect(representation.stats).toEqual({ health: 11 })
  dispose()
})

test('2 Computed (child, parent) using the same deps. The child shoud run first.', function() {
  const model = observable({
    name: 'Fraktar',
    isAlive: false,
    stats: {
      health: 10,
      force: 4,
    },
  })

  const runOrder: string[] = []

  const statsRepresentation = computed(() => {
    runOrder.push('statsRepresentation')
    return { health: model.isAlive ? model.stats.health : 0 }
  })

  const appRepresentation = computed(() => {
    runOrder.push('appRepresentation')
    return {
      name: model.name,
      health: model.isAlive ? statsRepresentation.get() : undefined,
    }
  })

  const dispose = autorun(() => {
    runOrder.push('autorun')
    appRepresentation.get()
  })
  STManager.transaction(() => {
    runOrder.push('MUTATE')
    model.isAlive = true
  })

  expect(runOrder.slice()).toEqual([
    'autorun', // The autorun is evaluated eagerly and the computed function are evaluated leazyly. So the autorun run first.
    'appRepresentation', //The autorun call appRepresentation, which is its first run. Nothe that stats representation is not called because isAlive is false.
    'MUTATE', // The transaction happens.
    'appRepresentation', // The only observer dependant of the transaction change is appRepresentation. So the computed function reevalute.
    'statsRepresentation', // This time, the appRepresentation needs to call statsRepresentation. So this computation is finally ran.
    'autorun', // After the appRepresentation run. The manager looks if it is a dependecy of another observer. It founds that the autorun depends on it. Run!
  ])
  dispose()
})

test('Unused computed are not recomputed when their deps change', function() {
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
    appRepresentation.get()
  })

  expect(statsRepRunCount).toBe(1)
  expect(appRepRunCount).toBe(1)
  expect(autoRunCount).toBe(1)

  STManager.transaction(() => {
    model.isAlive = false
  })
  expect(statsRepRunCount).toBe(2)
  expect(appRepRunCount).toBe(2)
  expect(autoRunCount).toBe(2)

  // the deps of appRep is not refreshed ?

  STManager.transaction(() => {
    model.stats.health = 1
  })

  expect(statsRepRunCount).toBe(2)
  expect(appRepRunCount).toBe(2)
  expect(autoRunCount).toBe(2)
  dispose()
})
