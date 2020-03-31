import { toNode, getContext, toInstance } from '../src/helpers'
import { observable } from '../src/lib/observable'
import { object } from '../src/object/factory'
import { string, number } from '../src/Primitive'
import { array } from '../src/array'
import { Operation } from '../src/lib/JSONPatch'

const Player = object({
  name: string(),
  inventory: array(
    object({
      id: string(),
      count: number(),
    })
  ),
})

let player: typeof Player.Type

beforeEach(function() {
  player = Player.create()
})

it('should have patch after an Arr.splice', function() {
  getContext(toInstance(player)).transaction(() => {
    player.inventory = player.inventory.splice(0, 1)
    expect(toNode(player).$patch.forward.length > 0)
  })
  expect(toNode(player).$patch.forward.length === 0)
})

test('apply patch', function() {
  const target = observable({
    name: 'Fraktar',
    inventory: [
      { id: 'sword', quantity: 1 },
      { id: 'shield', quantity: 1 },
    ],
    some: {
      nested: {
        field: 'foo',
      },
      map: new Map([['key', { field: 'value' }]]),
    },
  })
  const node = toNode(target)
  getContext(toInstance(target)).transaction(() =>
    ([
      { op: 'replace', path: '/name', value: 'Fraktos' },
      { op: 'remove', path: '/inventory/1' },
      { op: 'replace', path: '/some/nested/field', value: 'bar' },
      { op: 'replace', path: '/some/map/key', value: { field: 'new value' } },
    ] as any).forEach((op: Operation) => node.$applyOperation(op))
  )
  expect(target.name).toBe('Fraktos')
  expect(target.inventory[1]).toBeUndefined()
  expect(target.inventory.length).toBe(1)
  expect(target.some.nested.field).toBe('bar')
  expect(target.some.map.get('key')!.field).toBe('new value')
})
