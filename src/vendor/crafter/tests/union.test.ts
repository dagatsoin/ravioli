import { array } from '../src/array'
import { getNode } from '../src/helpers'
import { object } from '../src/object'
import { number, string } from '../src/Primitive'
import { transaction } from '../src/STManager'
import { union } from '../src/union/factory'
import { UnionInstance } from '../src/union/instance'

const Player = object({
  name: string(),
  inventory: array(
    object({
      id: string(),
      quantity: number(),
    })
  ),
})
const Grunt = object({
  name: string(),
  health: number(),
})

const Entity = union([Player, Grunt])

type PlayerType = typeof Player['Type']
type GruntType = typeof Grunt['Type']

test('Should accept two types', function() {
  expect(Entity.isValidValue({ name: 'gnoc' })).toBeFalsy()
  expect(
    Entity.isValidValue({
      name: 'Fraktar',
      inventory: [{ id: 'sword', quantity: 1 }],
    })
  ).toBeTruthy()
  expect(Entity.isValidValue({ name: 'Groumf', health: 1 })).toBeTruthy()
})

it('should relay all props to the concrete type', function() {
  const entity = Entity.create({
    name: 'Fraktar',
    inventory: [{ id: 'sword', quantity: 1 }],
  })
  const unionInstance = getNode(entity)
  expect(Object.keys(unionInstance)).toEqual(['name', 'inventory'])
})

it('should change from player to grunt', function() {
  const entity = Entity.create({
    name: 'Fraktar',
    inventory: [{ id: 'sword', quantity: 1 }],
  })

  expect((entity as PlayerType).inventory.slice()).toEqual([
    { id: 'sword', quantity: 1 },
  ])
  transaction(() => getNode(entity).$setValue({ name: 'Groumf', health: 1 }))

  // Inventory has been delete
  expect((entity as PlayerType).inventory).toBe(undefined)
  // Health property has been created
  expect((entity as GruntType).health).toBe(1)
})

test('switch between primitive and array', function() {
  const model = object({
    players: union([string(), array(object({ name: string() }))]),
  })
  const instance = model.create({ players: 'empty' })

  expect(instance.players).toBe('empty')

  transaction(() => (instance.players = [{ name: 'Fraktar' }]))

  // Array function should be available
  expect(typeof (instance.players as any[]).find).toBe('function')

  transaction(() => (instance.players = 'empty'))

  // Array function should not be available
  expect(typeof (instance.players as any[]).find).toBe('undefined')
})
