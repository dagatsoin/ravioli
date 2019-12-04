import { object } from '../src/object'
import { array } from '../src/array'
import { string, number } from '../src/Primitive'
import { transaction } from '../src/STManager'
import { setValue } from '../src/utils'

test('Node internal props are not enumerable', function() {
  expect(Object.keys(object({ foo: string() }).create())).toEqual(['foo'])
  expect(Object.keys(array(string()).create())).toEqual([])
})

it('Should create an instance with default value', function() {
  expect(
    object({
      foo: string('foo'),
    }).create().foo
  ).toEqual('foo')
})

it('Should set a value to a complex object', function() {
  const Player = object({
    name: string(),
    inventory: array(object({ id: string(), count: number() })),
  })
  const player = Player.create()

  transaction(function() {
    setValue(player, {
      name: 'Fraktar',
      inventory: [{ id: 'sword', count: 1 }],
    })
  })
  expect(player.inventory.slice()).toEqual([{ id: 'sword', count: 1 }])
})
