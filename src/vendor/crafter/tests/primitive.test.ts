import { object, string } from '../src'
import { transaction } from '../src/STManager'

it('should validate value at creation', function() {
  const model0 = object({ name: string() }).create({ name: 3 } as any)
  expect(model0.name).toBe('')
  const model1 = object({ name: string() }).create({ name: 'Fraktar' })
  expect(model1.name).toBe('Fraktar')
  const model2 = object({ name: string('Fraktar') }).create()
  expect(model2.name).toBe('Fraktar')
})

it('should not validate value at mutation', function() {
  const model0 = object({ name: string() }).create()
  transaction(() => ((model0.name as any) = 3))
  expect(model0.name).toBe(3)
  const model1 = object({ name: string() }).create()
  transaction(() => (model1.name = 'Fraktar'))
  expect(model1.name).toBe('Fraktar')
})
