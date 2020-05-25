import { observable } from '../src/lib/observable'
import { autorun } from '../src/observer/Autorun'
import { computed } from '../src/observer/Computed'
import { getContext, toInstance } from '../src/helpers'
import { createTracker } from '../src/lib/Tracker'
import { getGlobal } from '../src/utils/utils'
import { array, string } from '../src'

type Transform = <M, I>(
  model: M,
  initialValue: I,
  transformer: (m: M, i: I) => void
) => { value: I }

const context = getGlobal().$$crafterContext

beforeEach(context.clearContainer)

test('Simple autorun', function(){
  const model = observable({
    name: 'Fraktar'
  })
  let run = 0
  const dispose = autorun(() => {
    run++
    model.name
  })
  getContext(toInstance(model)).transaction(() => model.name = 'Fraktos')
  dispose()
  expect(run).toBe(2)
})

test('Simple autorun with a nested property dependency', function(){
  const model = observable({
    profile: { name: 'Fraktar' }
  })
  let run = 0
  const dispose = autorun(() => {
    run++
    model.profile.name
  })
  getContext(toInstance(model)).transaction(() => model.profile.name = 'Fraktos')
  dispose()
  expect(run).toBe(2)
})

test('Autorun with computed', function() {
  getGlobal().$$crafterContext.clearContainer()
  const model = observable({
    name: 'Fraktar',
    buffs: [
      {
        type: 'increase',
        stat: 'health',
        amount: 5,
      },
    ],
    inventory: [
      {
        id: 'sword',
        quantity: 1,
      },
    ],
    
    stats: {
      health: 10,
      force: 4,
      aura: 18,
      phase: 2,
    },
  })

  const health = computed(() => {
    const healthBuff = model.buffs.find(b => b.stat === 'health')
    return model.stats.health + (healthBuff ? healthBuff.amount : 0)
  })

  const derivation: any = {}

  const dispose = autorun(() => {
    derivation.name = model.name
    derivation.health = health.get()
    derivation.aura = model.stats.aura
    derivation.phase = model.stats.phase
  })
  context.transaction(() => {
    model.stats.health = 5
  })
  expect(derivation.health).toEqual(10)
  context.transaction(() => {
    model.stats.health = 6
  })
  expect(derivation.health).toEqual(11)
  dispose()
  expect(context.snapshot.dependencyGraph.nodes.length).toBe(0)
}) 

test('Autorun is called as creation and register in the manager', function() {
  getGlobal().$$crafterContext.clearContainer()
  const model = observable({
    name: 'Fraktar',
    isAlive: true,
    stats: {
      health: 10,
      force: 4,
    },
  })

  let autoRunCount = 0

  expect(context.snapshot.dependencyGraph.nodes.length).toBe(0)

  const dispose = autorun(() => {
    autoRunCount++
    // eslint-disable-next-line no-unused-expressions
    model.isAlive
  })

  expect(context.snapshot.dependencyGraph.nodes.length).toBe(2)
  expect(autoRunCount).toBe(1)
  dispose()
  expect(context.snapshot.dependencyGraph.nodes.length).toBe(0)
})

test('Nested autorun execution. Trigger an autorun while another autorun is running.', function() {
  const context = getGlobal().$$crafterContext
  context.clearContainer()
  const oData = observable({ x: 1 })

  // Mimic reactive props of crafter-react
  const tracker = createTracker('Tracker', getContext(toInstance(oData)))
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
  const y = computed(() => props.y, {isBoxed: true})
  const dispose0 = autorun(({isFirstRun}) => {
    render(y.get())
    if (!isFirstRun) {
      // Since async render implementation in React, the child render is done after the parent render.
      expect(isParentRunning).toBeFalsy()
    }
  })

  // Parent component
  let isParentRunning = false
  const dispose1 = autorun(() => {
    isParentRunning = true
    props.y = oData.x 
    isParentRunning = false
  })
  
  context.transaction(() => oData.x = 2)
  expect(rendering).toEqual(2)
  context.transaction(() => oData.x = 2)
  expect(rendering).toEqual(2)
  dispose0()
  dispose1()
  expect(context.snapshot.dependencyGraph.nodes.length).toBe(0)
})

test('Throwing during first run will dispose the autorun', function() {
  getGlobal().$$crafterContext.clearContainer()
  expect(() => autorun(() => {
    throw new Error('BOOT ERROR!')
  })).toThrow()
  expect(context.snapshot.dependencyGraph.nodes.length).toBe(0)
})

test('Throwing during an autorun will dispose the autorun', function() {
  getGlobal().$$crafterContext.clearContainer()
  const model = observable({count: 1})
  autorun(() => {
    if (model.count === 1) {
      context.transaction(() => model.count --)
    } else {
      throw new Error('BOOM!')
    }
  })
})

test("array length reaction", function(){
  getGlobal().$$crafterContext.clearContainer()
  const model = array(string()).create()
  let length
  autorun(() => length = model.length)
  getContext(toInstance(model)).transaction(() => model.push('fraktar'))
  expect(length).toBe(1)
})