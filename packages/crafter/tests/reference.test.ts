/* import { reference } from '../src/lib/reference'
import { object } from '../src/object'
import { array } from '../src/array'
import { identifier } from '../src/identifier'
import { map } from '../src/map/factory'
import { string, number } from '../src/Primitive'
import { toInstance, getContext } from '../src/helpers'

test('references', function() {
  const Item = object({
    id: identifier(),
    price: number(),
  })

  const Player = object({
    inventory: array(Item),
    equipedItem: reference(Item),
    questLog: map(
      object({
        id: string(),
      })
    ),
  })

  // create a store with a normalized snapshot
  const storeInstance = Player.create({
    inventory: [
      {
        id: '42',
        price: 10,
      },
    ],
    questLog: [['0', { id: '5' }]],
    equipedItem: '42',
  })

  // because `equipedItem` is declared to be a reference, it returns the actual item node with the matching identifier
  expect(storeInstance.equipedItem.price).toBe(10)
})

test('snapshot', function() {
  const Player = object({ id: identifier(), name: string() })
  const Model = object({ player: reference(Player) })
  // Create a player
  const player = Player.create({ id: '123', name: 'Fraktar' })
  const model1 = Model.create({ player: '123' }, { context: getContext(toInstance(player))})
  const snapshot = toInstance<typeof Model['Type']>(model1).$snapshot
  // apply to another model
  expect(snapshot.player).toBe('123')
  const model2 = Model.create(snapshot as any, { context: getContext(toInstance(player))})
  expect(model2.player.name).toBe('Fraktar')
})
 */