import { object } from "../src/object"
import { getContext, toInstance } from "../src/helpers"
//import { array } from "../src/array/factory"
//import { map } from "../src/map/factory"
import { identifier } from "../src/identifier"

describe('No passed id at creation', function() {
  const model = object({
    id: identifier(),
  }).create()
  
  test('Identifier is set', function(){
    expect(model.id.length).toBeGreaterThan(0)
  })
  
  test('Model and Identifier own $$id is different', function() {
    expect(toInstance(toInstance(model).$data.id).$id).not.toBe(toInstance(model).$id)
  })
  
  test('Model $$id and Identifier value are the same', function() {
    expect(toInstance(model).$id).toBe(model.id)
  })
})

describe('Pass an ID at creation', function() {
  const model = object({
    id: identifier(),
  }).create({id: 'k9jL8e'})

  test('Identifier is set', function(){
    expect(model.id.length).toBeGreaterThan(0)
  })
  
  test('Model and Identifier own $$id is different', function() {
    expect(toInstance(toInstance(model).$data.id).$id).not.toBe(toInstance(model).$id)
  })
  
  test('Model $$id and Identifier value are the same', function() {
    expect(toInstance(model).$id).toBe(model.id)
  })
})

it('should not be possible to mutate an identifier', function() {
  const model = object({
    id: identifier(),
  }).create({id: 'k9jL89de'})

  const id = model.id

  expect(() => getContext(toInstance(model)).step(() => (model.id = 'newId'))).toThrow()

  // ID did not change
  expect(model.id).toBe(id)
})

it('should not be possible to use an existing identifier', function() {
  const model0 = object({
    id: identifier(),
  }).create()

  expect(() => {
    object({
      id: identifier(),
    }).create({ id: model0.id })
  }).toThrow()
})

/* 
it('should register an uid when creating an object with an identifier field type', function() {
  const context = getContext(toInstance(array(
    object({
      id: identifier(),
    })
  ).create([{ id: '1234' }])))
  expect(context.snapshot.uids.includes('1234')).toBeTruthy()
})

it('should remove an identifier from the manager when a node is removed from an array', function() {
  const model = array(
    object({
      id: identifier(),
    })
  ).create([{ id: '123' }])
  getContext(toInstance(model)).step(model.pop)
  expect(getContext(toInstance(model)).snapshot.uids.includes('123')).toBeFalsy()
})

it('should remove an identifier from the manager when a node is removed from a map', function() {
  const model = map(
    object({
      id: identifier(),
    })
  ).create([['0', { id: '157' }]])
  getContext(toInstance(model)).step(model.clear)
  expect(getContext(toInstance(model)).snapshot.uids.includes('157')).toBeFalsy()
})
 */