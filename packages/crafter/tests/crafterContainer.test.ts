import { observable } from '../src/lib/observable'
import { autorun, Autorun } from '../src/observer/Autorun'
import { computed } from '../src/observer/Computed'
import { createTracker } from '../src/lib/Tracker'
import { getGlobal } from '../src/utils/utils'
import { IObserver } from '../src/observer/Observer'
import { CrafterContainer, object, string, toInstance } from '../src'

const context = getGlobal().$$crafterContext

beforeEach(() => context.clearContainer())

test('prevent transaction during execution', function() {
  const model = observable({name: 'frkatar'})
  try {
    context.blockTransaction(() => context.transaction(() => model.name = 'Fraktar'))
  } catch (err) {
    expect(
        /Transaction are not allowed here./.test(err)
    ).toBeTruthy()
  }

})

test('Spy observers', function() {
  // This test ensure the consistency of nested observers or neighbours observers dependency paths
  const model = observable({
    name: 'Fraktar',
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

  const statsRepresentation = computed(() => ({
    health: healthRepresentation.get(),
    force: forceRepresentation.get(),
  }))

  const appRepresentation = computed(() => ({
    name: model.name,
    stats: statsRepresentation.get(),
  }))

  const reaction = new Autorun(() => {
    appRepresentation.get()
  })

  expect(
    context.snapshot.observerGraph.nodes.find(({id}) => reaction.id === id)?.dependencyPaths.length
  ).toBe(1)
  expect(
    context.snapshot.observerGraph.nodes.find(({id}) => (appRepresentation as unknown as IObserver).id === id)?.dependencyPaths.length
  ).toBe(2)
  expect(
    context.snapshot.observerGraph.nodes.find(({id}) => (statsRepresentation as unknown as IObserver).id === id)?.dependencyPaths.length
  ).toBe(2)
  expect(
    context.snapshot.observerGraph.nodes.find(({id}) => (healthRepresentation as unknown as IObserver).id === id)?.dependencyPaths.length
  ).toBe(2)
  expect(
    context.snapshot.observerGraph.nodes.find(({id}) => (forceRepresentation as unknown as IObserver).id === id)?.dependencyPaths.length
  ).toBe(2)

  reaction.dispose()
  
  expect(context.snapshot.observerGraph.nodes.length).toBe(0)
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
  expect(context.snapshot.observerGraph.nodes.length).toBe(0)

  const dispose = autorun(() => {
    autoRunCount++
    appRepresentation.get()
  })

  expect(context.snapshot.observerGraph.nodes.length).toBe(3)
  expect(context.snapshot.observerGraph.edges.length).toBe(2)

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
  }>(() => ({
    name: model.name,
    stats: model.stats,
  }))

  expect(context.snapshot.observerGraph.nodes.length).toBe(0)

  const disposer = autorun(() => {
    appRepresentation.get()
  })

  expect(context.snapshot.observerGraph.nodes.length).toBe(2)

  disposer()

  expect(context.snapshot.observerGraph.nodes.length).toBe(0)
})

test('State restauration after an exception during transaction', function() {
  const model0 = observable({
    name: 'Elwein',
    inventory: [
      { id: 'sword', quantity: 1 },
      { id: 'shield', quantity: 2 },
    ],
  })
  const model1 = observable({
    name: 'Fraktar',
    inventory: [
      { id: 'sword', quantity: 1 },
      { id: 'shield', quantity: 2 },
    ],
  })
  const backupGraphState = context.snapshot
  expect(() => context.transaction(() => {
    // test with nested transaction to make sure that the error will bubble
    context.transaction(() => {
    model0.inventory.push({ id: 'potion', quantity: 1 })
    expect(model0.inventory.length).toBe(3)
    model1.inventory.push({ id: 'potion', quantity: 1 })
    expect(model1.inventory.length).toBe(3)
    throw new Error('Muhahahaaaa')
  })})).toThrow()
  // Container state is restored
  expect(context.snapshot).toEqual(backupGraphState)
  // Model is restored
  expect(model0.inventory.length).toBe(2)
  expect(model1.inventory.length).toBe(2)
})

test.todo('unregister root node')

test('invalidated observer during side effect are not run twice', function() {
  const oData = observable({ x: 1 })

  // Mimic reactive props of crafter-react
  const tracker = createTracker('prop', context)
  const props = {
    _y: 1,
    get y(): number {
      tracker.reportObserved()
      return this._y
    },
    set y(n: number) {
      if (this._y !== n) { 
        this._y = n
        tracker.reportChanged()
      }
    }
  }

  let rendering
  function render(n: number): void {
    rendering = n
  }

  // Child component
  const y = computed(() => props.y)
  let ranChild = 0
  autorun(() => {
    ranChild++
    render(y.get())
  })

  // Parent component
  let ranParent = 0
  autorun(() => {
    ranParent++
    props.y = oData.x 
  })
  
  context.transaction(() => oData.x = 2)
  expect(rendering).toEqual(2)
  expect(ranParent).toBe(2)
  expect(ranChild).toBe(2)
})

test('invalidated observer during side effect are immediately stale', function() {
  const oData = observable({ x: 1 })

  // Mimic reactive props of crafter-react
  const tracker = createTracker('prop', context)
  const props = {
    _y: 1,
    get y(): number {
      tracker.reportObserved()
      return this._y
    },
    set y(n: number) {
      if (this._y !== n) { 
        this._y = n
        tracker.reportChanged()
      }
    }
  }
  let result = 0
  function render(n: number): void {
    result = n
  }

  // Child autorun
  const y = computed(() => props.y)
  autorun(() => render(y.get()))

  // Parent component
  let runs = 0
  autorun(() => {
    runs++
    props.y = oData.x 
  })
  
  context.transaction(() => oData.x = 2)
  expect(runs).toBe(2)
  expect(result).toBe(2)
})

test("Reaction between two contexts on the same node process", function() {
  const context0 = new CrafterContainer()
  const context1 = getGlobal().$$crafterContext as CrafterContainer

  // The model is in context 0
  const model = object({name: string()}).create({name: 'Fraktos'}, {context: context0})
  
  // This computed value is used in the context 1 but its source is in context 0
  // As a result, it will never be stale even if its source changes.
  const computedDerivation = computed(
    (): any => ({nickName: model.name}),
    {
      contexts: {
        source: context0,
        output: context1
      }
    }
  )

  // Also, this autorun of the context 1 will never be stale when the model of the context 0 will change
  // as this dependencies are from `computedDerivation` from context 1
  let nickName
  autorun(() => nickName = computedDerivation.get().nickName)
  
  // Demonstration.
  // Lets mutate the model
  context0.transaction(() => model.name = 'Fraktar')

  // Both computed and autorun from context 1 are still valid.
  expect(context1.snapshot.observerGraph.nodes.every(node => !node.isStale)).toBeTruthy()
  expect(nickName).toBe('Fraktos')

  // Present the patch to the other context.
  context1.presentPatch([{path: `${toInstance(model).$id}/name`, op: 'replace', value: 'Fraktar'}])
  
  // The patch made both the autorun and the computed of the context 1 to be stale and to update.
  // The nickname is now up to date.
  expect(nickName).toBe('Fraktar')
})