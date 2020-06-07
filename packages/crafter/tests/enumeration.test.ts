/* import { enumeration } from '../src/enum'
import { object } from '../src/object'
import { getContext, toInstance } from '../src/helpers'

it('should create an enumeration', function() {
  expect(
    object({ type: enumeration('player', 'grunt', 'npc') }).create({
      type: 'player',
    }).type
  ).toBe('player')
})

it('should validate value at creation', function() {
  const model = object({ type: enumeration('player', 'grunt', 'npc') }).create({
    type: 'player',
  })
  expect(model.type).toEqual('player')
})

it('should be mutable', function() {
  const model = object({ type: enumeration('player', 'grunt', 'npc') }).create({
    type: 'player',
  })
  getContext(toInstance(model)).transaction(() => (model.type = 'grunt'))
  expect(model.type).toEqual('grunt')
})
 */