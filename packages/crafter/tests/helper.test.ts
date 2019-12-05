import { observable } from '../src/lib/observable'
import { getTypeFromValue } from "../src/lib/getTypeFromValue"
import { toInstance, getSnapshot } from '../src/helpers'

test('get type from value', function() {
  const type = getTypeFromValue({
    name: 'Fraktar',
    age: 18,
    inventory: [],
    surprise: undefined,
  })!

  expect(
    type.isValidSnapshot({
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

test('get type from a map', function() {
  const value = {
    name: 'Fraktar',
    titles: new Map([
      ['bronze', 'noob'],
      ['gold', 'cheater'],
    ]),
  }
  const type = getTypeFromValue(value)
  expect(type.create(value).titles.size).toBe(2)
})

test('get type from an instance', function() {
  const source = observable({
    name: 'Fraktar',
    titles: new Map([
      ['bronze', 'noob'],
      ['gold', 'cheater'],
    ]),
  })
  const type = getTypeFromValue(source)
  expect(type.create(getSnapshot(toInstance(source))).titles.size).toBe(2)
})
