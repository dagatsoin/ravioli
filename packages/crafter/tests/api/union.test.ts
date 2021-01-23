/* import { array } from '../src/array'
import { toNode, toInstance } from '../src/helpers'
import { object } from '../src/object'
import { number, string } from '../src/Primitive'
import { union } from '../src/union/factory'
import { getGlobal } from '../src/utils/utils'

const context = getGlobal().$$crafterContext

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

beforeEach(() => context.clearContainer())

test('Should accept two types', function() {
  expect(Entity.isValidSnapshot({ name: 'gnoc' })).toBeFalsy()
  expect(
    Entity.isValidSnapshot({
      name: 'Fraktar',
      inventory: [{ id: 'sword', quantity: 1 }],
    })
  ).toBeTruthy()
  expect(Entity.isValidSnapshot({ name: 'Groumf', health: 1 })).toBeTruthy()
})

it('should relay all props to the concrete type', function() {
  const entity = Entity.create({
    name: 'Fraktar',
    inventory: [{ id: 'sword', quantity: 1 }],
  })
  const unionInstance = toNode(entity)
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
  context.transaction(() => toNode(entity).$setValue({ name: 'Groumf', health: 1 }))

  // Inventory has been delete
  expect((entity as PlayerType).inventory).toBe(undefined)
  // Health property has been created
  expect((entity as GruntType).health).toBe(1)
})

test('switch between primitive and array', function() {
  const model = object({
    players: union([string(), array(object({ name: string() }))]),
  })
  const instance = model.create({ players: [{ name: 'Fraktar' }] })

  // Array function should be available
  expect(typeof (instance.players as any[]).slice).toBe('function')

  expect(instance.players.slice()).toEqual([{ name: 'Fraktar' }])

  context.transaction(() => (instance.players = 'empty'))

  // Array function should not be available
  expect(typeof (instance.players as any[]).find).toBe('undefined')
})

test('The replaced target instance keeps the same ID', function() {
  const model = object({
    data: union([object({name: string()}), array(object({name: string()}))])
  })
  const instance = model.create({data: {name: 'fraktar'}})

  const $id = toInstance(instance).$data.data.$id
  context.transaction(() => instance.data = [])
  expect(toInstance(instance).$data.data.$id).toBe($id)
})

test('Union type is registered as referencable', function(){
  const model = object({
    data: union([string(), number()])
  })
  model.create({data: "Fraktar"})
  expect(context.snapshot.referencableNodeInstances.size).toBe(2)
})

test('Context is the same across types', function(){
  const model = object({
    data: union([object({name: string()}), array(object({name: string()}))])
  })
  const instance = model.create({data: {name: "Fraktar"}})
  instance.data
  expect(context.snapshot.referencableNodeInstances.size).toBe(3)
  context.transaction(() => instance.data = [{name: "Fraktar"}])
  expect(context.snapshot.referencableNodeInstances.size).toBe(4)
}) */