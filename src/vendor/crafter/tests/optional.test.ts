import { string, object, optional } from '../src'
import { transaction } from '../src/STManager'

test('an optional property could be undefined or have a type', function() {
  const model = object({
    name: string(),
    optionalProp: optional(string()),
  })

  const instance = model.create()

  expect(instance.optionalProp).toBeUndefined()

  transaction(() => (instance.optionalProp = 'here I am'))

  expect(instance.optionalProp).toBe('here I am')
})
