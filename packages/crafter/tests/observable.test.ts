/* import { observable } from '../src/lib/observable'
import { isNode } from '../src/lib/isNode'
import { getGlobal } from '../src/utils/utils'
import { toInstance, isUnknownType, getContext, ArrayType, MapType } from '../src'

const context = getGlobal().$$crafterContext

beforeEach(() => context.clearContainer())

test('create observable', function() {
  const model = observable({
    name: 'Fraktar',
    stats: {
      health: 10,
      force: 4,
    },
  })
  expect(isNode(model) && isNode(model.stats)).toBeTruthy()
})

it('should add stale observable during transaction', function() {
  const model = observable({
    name: 'fraktar',
    age: 18,
    stats: {
      force: 10,
      health: 10,
    },
    inventory: ['sword'], // A node for this
  })
  context.transaction(() => {
    model.name = 'Fraktar'
    expect(context.snapshot.updatedObservables.size).toEqual(1)
    model.stats.force++
    expect(context.snapshot.updatedObservables.size).toEqual(2)
  })
})

test('observable value should register on creation. Strict mode false.', function() {
  observable({
    name: 'Fraktar',
  }, {isStrict: false})
  // 2 because in non strict model, the observable creates
  // - an object (the root, first node)
  // - an optional which is an union type node (second node)
  //   between string(a leaf) and UndefinedType (a leaf)
  expect(context.snapshot.referencableNodeInstances.size).toEqual(2)
})

test('observable value should register on creation. Strict mode true.', function() {
  observable({
    name: 'Fraktar',
  })
  expect(context.snapshot.referencableNodeInstances.size).toEqual(1)
})

test('observable value should unregister when killed', function() {
  const obs = observable([
    {
      name: 'Fraktar',
    },
    {
      name: 'Elwein',
    },
  ])

  expect(context.snapshot.referencableNodeInstances.size).toEqual(3)

  context.transaction(() => obs.pop())
  expect(context.snapshot.referencableNodeInstances.size).toEqual(2)
})

test('unknown array should refine when receive a value', function() {
  const model = observable([]) as unknown[]
  expect(isUnknownType((toInstance(model).$type as ArrayType<any>).itemType)).toBeTruthy()
  getContext(toInstance(model)).transaction(() => model.push({name: 'Fraktar'}))
  expect(isUnknownType((toInstance(model).$type as ArrayType<any>).itemType)).toBeFalsy()
})

test('unknown map should refine when receive a value', function() {
  const model = observable(new Map()) as Map<string, unknown>
  expect(isUnknownType((toInstance(model).$type as MapType<any>).itemType)).toBeTruthy()
  getContext(toInstance(model)).transaction(() => model.set('0', {name: 'Fraktar'}))
  expect(isUnknownType((toInstance(model).$type as MapType<any>).itemType)).toBeFalsy()
})
 */