import { getTypeFromValue } from '../src/lib/observable'

test('get type from value', function() {
  const type = getTypeFromValue({
    name: 'Fraktar',
    age: 18,
    inventory: [],
    surprise: undefined,
  })!

  expect(
    type.isValidValue({
      name: 'Fraktar',
      age: 18,
      inventory: [
        {
          id: 'sword',
          quantity: 1,
        },
      ],
      surprise: undefined,
    })
  ).toBeTruthy()
})
