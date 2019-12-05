import { string } from "../src/Primitive"
import { optional } from "../src/optional"
import { object } from "../src/object"
import { getContext, toInstance } from "../src/helpers"

test('an optional property could be undefined or have a type', function() {
  const model = object({
    name: string(),
    optionalProp: optional(string()),
  })

  const instance = model.create()

  expect(instance.optionalProp).toBeUndefined()

  getContext(toInstance(instance)).transaction(() => (instance.optionalProp = 'here I am'))

  expect(instance.optionalProp).toBe('here I am')
})
