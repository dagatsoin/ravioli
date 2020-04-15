import { observable } from '../src/lib/observable'
import { autorun } from '../src/observer/Autorun'
import { computed } from '../src/observer/Computed'
import { getContext, toInstance } from '../src/helpers'
import { createTracker } from '../src/lib/Tracker'
import { getGlobal } from '../src/utils/utils'
import { object } from '../src/object'
import { number, string } from '../src/Primitive'
import { array } from '../src'

type Transform = <M, I>(
  model: M,
  initialValue: I,
  transformer: (m: M, i: I) => void
) => { value: I }

declare const transform: Transform

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

test('Autorun with computed', function() {
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

  function health(base: number): number {
    const healthBuff = model.buffs.find(b => b.stat === 'health')
    return base + (healthBuff ? healthBuff.amount : 0)
  }

  const derivation = {
    name: model.name,
    health: health(model.stats.health),
    aura: model.stats.aura,
    phase: model.stats.phase,
  }

  const dispose = autorun(() => {
    derivation.name = model.name
    derivation.health = health(model.stats.health)
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

  expect(context.snapshot.dependencyGraph.nodes.length).toBe(1)
  expect(autoRunCount).toBe(1)
  dispose()
  expect(context.snapshot.dependencyGraph.nodes.length).toBe(0)
})

test('Nested autorun execution. Trigger an autorun while another autorun is running.', function() {
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
      expect(isParentRunning).toBeTruthy()
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
  expect(() => autorun(() => {
    throw new Error('BOOT ERROR!')
  })).toThrow()
  expect(context.snapshot.dependencyGraph.nodes.length).toBe(0)
})

test('Throwing during an autorun will dispose the autorun', function() {
  const model = observable({count: 1})
  autorun(() => {
    if (model.count === 1) {
      context.transaction(() => model.count --)
    } else {
      throw new Error('BOOM!')
    }
  })
})

test('Accept computed as property', function() {
  const player = object({
    armor: number(),
    health: number(),
    stat: computed((self: any) => ({
      health: self.armor + self.health
    }))
  }).create({armor: 1, health: 1} as any)

  let stat
  
  expect(player.stat.health).toBe(2)
  
  autorun(() => stat = {...player.stat})

  expect(stat).toEqual({ health: 2 })

  getContext(toInstance(player)).transaction(() => player.health = 2)

  expect(stat).toEqual({ health: 3 })
})

test("array length reaction", function(){
  const model = array(string()).create()
  let length
  autorun(() => length = model.length)
  getContext(toInstance(model)).transaction(() => model.push('fraktar'))
  expect(length).toBe(1)
})