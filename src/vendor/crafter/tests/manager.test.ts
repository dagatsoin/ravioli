import { observable } from '../src/lib/observable'
import * as STManager from '../src/STManager'
import { computed } from '../src/observer/Computed'
import { autorun } from '../src/observer/Autorun'

test('Spy observers', function() {
  // This test ensure the consistency of nested observers or neighbours observers dependency paths
  const model = observable({
    name: 'Fraktar',
    isAlive: true,
    stats: {
      health: 10,
      force: 4,
    },
  })

  const healthRepresentation = computed(() => ({
    baseHealth: model.stats.health,
  }))
  const forceRepresentation = computed(() => ({
    baseForce: model.stats.force,
  }))

  const statsRepresentation = computed(() => {
    return {
      health: healthRepresentation.get(),
      force: forceRepresentation.get(),
    }
  })

  const appRepresentation = computed(() => ({
    name: model.name,
    stats: statsRepresentation.get(),
  }))

  const dispose = autorun(() => {
    appRepresentation.get()
  })

  expect(
    STManager.getState().observerGraph.nodes[0].dependenciesPath.length
  ).toBe(1)
  expect(
    STManager.getState().observerGraph.nodes[1].dependenciesPath.length
  ).toBe(2)
  expect(
    STManager.getState().observerGraph.nodes[2].dependenciesPath.length
  ).toBe(2)
  expect(
    STManager.getState().observerGraph.nodes[3].dependenciesPath.length
  ).toBe(2)
  expect(
    STManager.getState().observerGraph.nodes[4].dependenciesPath.length
  ).toBe(2)

  dispose()
})

test('When a autorun is created, all lazy computed value are awake and added to the graph dependencies.', function() {
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
  expect(STManager.getState().observerGraph.nodes.length).toBe(0)

  const dispose = autorun(() => {
    autoRunCount++
    appRepresentation.get()
  })

  expect(STManager.getState().observerGraph.nodes.length).toBe(3)
  expect(STManager.getState().observerGraph.edges.length).toBe(2)

  expect(statsRepRunCount).toBe(1)
  expect(appRepRunCount).toBe(1)
  expect(autoRunCount).toBe(1)
  dispose()
})

test('manager perfom tree shaking when a reaction is disposed', function() {
  const model = observable({
    name: 'Fraktar',
    isAlive: true,
    stats: {
      health: 10,
      force: 4,
    },
  })

  const appRepresentation = computed<{
    name: string
    stats?: { health: number }
  }>(() => {
    return {
      name: model.name,
      stats: model.stats,
    }
  })

  expect(STManager.getState().observerGraph.nodes.length).toBe(0)

  const disposer = autorun(() => {
    appRepresentation.get()
  })

  expect(STManager.getState().observerGraph.nodes.length).toBe(2)

  disposer()

  expect(STManager.getState().observerGraph.nodes.length).toBe(0)
})
