import { object } from "../src/object"
import { literal } from "../src/literal"
import { getContext, toInstance } from "../src/helpers"

test('if not set, default value is used', function() {
  expect(object({ type: literal('player') }).create().type).toBe('player')
})

it('should create a literal', function() {
  const model = object({ type: literal('player') }).create({ type: 'player' })
  expect(model.type).toBe('player')
})

it('should validate value at creation', function() {
  let model
  let error
  try {
    model = object({ type: literal('player') }).create({
      type: 'grunt' as any,
    })
  } catch (e) {
    error = e
  } finally {
    expect(error).toBeDefined()
    expect(model).toBe(undefined)
  }
})

it('should be immutable', function() {
  const model = object({ type: literal('player') }).create({ type: 'player' })
  expect(() => getContext(toInstance(model)).transaction(() => (model.type = 'grunt' as any))).toThrow()
  expect(model.type).toBe('player')
})
