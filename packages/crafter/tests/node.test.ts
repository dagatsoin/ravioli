/* import { array } from '../src/array'
import { object } from '../src/object'
import { string, number } from '../src/Primitive'
import { observable } from '../src/lib/observable'
import { getContext, toInstance, toNode, toLeaf } from '../src/helpers'
import { getGlobal } from '../src/utils/utils'

const context = getGlobal().$$crafterContext

beforeEach(() => context.clearContainer())

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

test('observable value should register on creation', function() {
  object({
    name: string(),
  }).create()
  expect(context.snapshot.referencableNodeInstances.size).toBe(1)
})

test('each node of the branch should detach on parent removal', function() {
  // Test with observable
  const obs = observable([
    {
      giver: {
        name: 'Fraktar',
      },
      receiver: {
        name: 'Elwein',
      },
    },
    {
      giver: {
        name: 'Elwein',
      },
      receiver: {
        name: 'Dreadbond',
      },
    },
  ])

  expect(context.snapshot.referencableNodeInstances.size).toBe(7)
  getContext(toInstance(obs)).transaction(() => obs.pop())
  expect(context.snapshot.referencableNodeInstances.size).toBe(4)

  // Test with factories

  context.clearContainer()

  const obj = array(
    object({
      name: string(),
    })
  ).create([
    {
      name: 'Fraktar',
    },
    {
      name: 'Elwein',
    },
  ])

  expect(context.snapshot.referencableNodeInstances.size).toBe(3)
  context.transaction(() => obj.pop())
  expect(context.snapshot.referencableNodeInstances.size).toBe(2)
})

test("path", function() {
  const value = object({
    stats:object({
      base: object({
        health: number()
      })
    })
  }).create()

  expect(toNode(value).$path).toBe("/")
  expect(toNode(value.stats).$path).toBe("/stats")
  expect(toNode(value.stats.base).$path).toBe("/stats/base")
})

test.todo(
  'Failed creation should be cleaned. If a child node/leaf fail for a reason, all the tree must be destroyed'
)

test("Check node parenting", function() {
  context.clearContainer()
  const model = observable({
    name: "Fraktar",
    stats: {
      health: 10
    },
    inventory: [
      {id: "sword", quantity: 1},
      {id: "shield", quantity: 1}
    ],
    titles: ["Lord of the Pump", "Black cat"],
    achievements: new Map([
      ['firstBlood', {title: "First blood"}],
      ['firstQuest', {title: "First quest"}],
    ]),
    tokens: new Map([
      ['000', "login"],
      ['001', "logout"]
    ])
  })

  // Check array structure
  const modelInstance = toInstance(model)
  const inventoryInstance = toInstance(modelInstance.$data.inventory)
  const swordInstance = toInstance(model.inventory[0])
  const leafInstance = toLeaf(swordInstance.$data.id)
  expect(inventoryInstance.$parent).toBe(modelInstance)
  expect(swordInstance.$parent).toBe(inventoryInstance)
  expect(leafInstance.$parent).toBe(swordInstance)

  // Check map structure
  const tokensMapInstance = toInstance(modelInstance.$data.tokens)
  const tokenInstance = toLeaf((tokensMapInstance as any).$data.get('000'))
  expect(tokensMapInstance.$parent).toBe(modelInstance)
  expect(tokenInstance.$parent).toBe(tokensMapInstance)
})
 */