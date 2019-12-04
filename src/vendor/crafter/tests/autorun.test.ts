import * as STManager from '../src/STManager'
import { observable } from '../src/lib/observable'
import { autorun } from '../src/observer/Autorun'

type Transform = <M, I>(
  model: M,
  initialValue: I,
  transformer: (m: M, i: I) => void
) => { value: I }

declare const transform: Transform

test('Autorun', function() {
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

  function health(base: number) {
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
  STManager.transaction(() => {
    model.stats.health = 5
  })
  expect(derivation.health).toEqual(10)
  dispose()
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

  expect(STManager.getState().observerGraph.nodes.length).toBe(0)

  const dispose = autorun(() => {
    autoRunCount++
    model.isAlive
  })

  expect(STManager.getState().observerGraph.nodes.length).toBe(1)
  expect(autoRunCount).toBe(1)
  dispose()
})
