import { observable } from '../src/lib/observable'
import { isNode } from '../src/lib'
import * as STManager from '../src/STManager'
import { object, string, number } from '../src'

test('create observable and infer type', function() {
  const model = observable({
    name: 'Fraktar',
    stats: {
      health: 10,
      force: 4,
    },
  })
  expect(isNode(model) && isNode(model.stats)).toBeTruthy()
})

test('create observable with type', function() {
  const model = observable(
    {
      name: 'Fraktar',
      stats: {
        health: 10,
        force: 4,
      },
    },
    {
      type: object({
        name: string(),
        stats: object({
          health: number(),
          force: number(),
        }),
      }),
    }
  )
  expect(isNode(model) && isNode(model.stats)).toBeTruthy()
})

it('should add stale observable during transaction', function() {
  expect(STManager.countUpdatedObservables()).toEqual(0)
  const model = observable({
    //A node for this
    name: 'fraktar',
    age: 18,
    stats: {
      // A node for thisæ
      force: 10,
      health: 10,
    },
    inventory: ['sword'], // A node for this
  })
  STManager.transaction(() => {
    model.name = 'Fraktar'
    expect(STManager.countUpdatedObservables()).toEqual(1)
    model.stats.force++
    expect(STManager.countUpdatedObservables()).toEqual(2)
  })
})
