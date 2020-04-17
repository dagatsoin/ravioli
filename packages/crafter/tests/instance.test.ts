import { number, string, undefinedType } from "../src/Primitive"
import { object } from "../src/object"
import { toNode, toLeaf, makePath, toInstance, getContext } from "../src/helpers"
import { array } from "../src/array"
import { map } from "../src/map"
import { union } from "../src/union"
import { observable } from "../src/lib/observable"

test("Primitive instance should not have any enumerable keys", function() {
  const model = number().create(5)
  expect(Object.keys(model)).toEqual([])
})

describe("Leaf is attached at instantiation", function() {
  test("with object parent", function() {
    const model = object({
      name: string()
    }).create()
    const modelInstance = toNode(model)
    const leafInstance = toLeaf(modelInstance.$data.name)
    expect(leafInstance.$parent === modelInstance)
    expect(leafInstance.$parentKey === 'name')
    expect(leafInstance.$path === makePath(modelInstance.$id, 'name'))
  })
  test("with array parent", function() {
    const model = array(string()).create(["Fraktar"])
    const modelInstance = toNode(model)
    const leafInstance = toLeaf(modelInstance.$data[0])
    expect(leafInstance.$parent === modelInstance)
    expect(leafInstance.$parentKey === 0)
    expect(leafInstance.$path === makePath(modelInstance.$id, '0'))
  })
  test("with map parent", function(){
    const model = map(string()).create([['0', 'Fraktar']])
    const modelInstance = toNode(model)
    const leafInstance = toLeaf(modelInstance.$data.get('0'))
    expect(leafInstance.$parent === modelInstance)
    expect(leafInstance.$parentKey === 0)
    expect(leafInstance.$path === makePath(modelInstance.$id, '0'))
  })

  test("with union parent", function() {
    const model = union([string(), undefinedType()]).create('Fraktar')
    const leafInstance = toInstance(model)
    expect(leafInstance.$parent === leafInstance)
    expect(leafInstance.$parentKey === leafInstance.$id)
    expect(leafInstance.$path === makePath(leafInstance.$id))
  })

  test("with optional", function() {
    const model = observable({name: "Fraktar"}, {isStrict: false})
    const modelInstance = toInstance(model)
    const leafInstance = toInstance(modelInstance.$data.name)
    expect(leafInstance.$parent === modelInstance)
    expect(leafInstance.$parentKey === 'name')
    expect(leafInstance.$path === makePath(modelInstance.$id, 'name'))
  })
})
describe("Leaf is dettached when killed", function() {
  test("with object parent", function() {
    const model = object({
      name: string()
    }).create()
    const modelInstance = toNode(model)
    const leafInstance = toLeaf(modelInstance.$data.name)
    leafInstance.$kill()
    expect(leafInstance.$parent === undefined)
    expect(leafInstance.$parentKey === '')
    expect(leafInstance.$path === '')
  })
  test("with array parent", function() {
    const model = array(string()).create(["Fraktar"])
    const leafInstance = toLeaf(toNode(model).$data[0])
    getContext(toInstance(model)).transaction(() => model.pop())
    expect(leafInstance.$parent === undefined)
    expect(leafInstance.$parentKey === '')
    expect(leafInstance.$path === '')
  })
  test("with map parent", function(){
    const model = map(string()).create([['0', 'Fraktar']])
    const leafInstance = toLeaf(toNode(model).$data.get('0'))
    getContext(toInstance(model)).transaction(() => model.clear())
    expect(leafInstance.$parent === undefined)
    expect(leafInstance.$parentKey === '')
    expect(leafInstance.$path === '')
  })

  test("with optional", function() {
    const model = observable({name: "Fraktar"}, {isStrict: false})
    const modelInstance = toInstance(model)
    const leafInstance = toInstance(modelInstance.$data.name)
    getContext(toInstance(model)).transaction(() => (model.name as any) = undefined)
    expect(leafInstance.$parent === undefined)
    expect(leafInstance.$parentKey === '')
    expect(leafInstance.$path === '')
  })
})

describe("Node is attached at instantiation", function() {
  test("with object parent", function() {
    const model = object({
      stats: object({
        health: number()
      })
    }).create()
    const modelInstance = toNode(model)
    const childInstance = modelInstance.$data.stats
    const leafInstance = toLeaf(childInstance.$data.health)
    expect(childInstance.$parent === modelInstance)
    expect(childInstance.$parentKey === 'stats')
    expect(childInstance.$path === makePath(modelInstance.$id, 'stats'))
    expect(childInstance.$path === makePath(modelInstance.$id, '0'))
    expect(leafInstance.$parent === childInstance)
    expect(leafInstance.$parentKey === 'health')
    expect(leafInstance.$path === makePath(childInstance.$path, 'health'))
  })
  test("with array parent", function() {
    const model = object({ar: array(object({
      health: number()
    }))}).create({ar: [{health: 10}]})
    const modelInstance = toNode(toNode(model).$data.ar)
    const childInstance = modelInstance.$data[0]
    const leafInstance = toLeaf(childInstance.$data.health)
    expect(childInstance.$parent === modelInstance)
    expect(childInstance.$parentKey === 0)
    expect(childInstance.$path === makePath(modelInstance.$id, '0'))
    expect(leafInstance.$parent === childInstance)
    expect(leafInstance.$parentKey === 'health')
    expect(leafInstance.$path === makePath(childInstance.$path, 'health'))
  })
  test("with map parent", function(){
    const model = map(object({
      health: number()
    })).create([['0', {health: 10}]])
    const modelInstance = toNode(model)
    const childInstance = modelInstance.$data.get('0')
    const leafInstance = toLeaf(childInstance.$data.health)
    expect(childInstance.$parent === modelInstance)
    expect(childInstance.$parentKey === 'stats')
    expect(childInstance.$path === makePath(modelInstance.$id, 'stats'))
    expect(leafInstance.$parent === childInstance)
    expect(leafInstance.$parentKey === 'health')
    expect(leafInstance.$path === makePath(childInstance.$path, 'health'))
  })

  test("with union parent", function() {
    const model = object({
      stats: union([
        object({
          health: number()
        }),
        undefinedType()
      ])
    }).create({stats: { health: 10 }})
    const modelInstance = toNode(model.stats)
    const childInstance = (modelInstance as any).$targetInstance.$data.health
    expect(childInstance.$parent === modelInstance)
    expect(childInstance.$parentKey === 'health')
    expect(childInstance.$path === makePath(modelInstance.$path, 'stats/health'))
  })

  test("with observable", function() {
    const model = observable({
      inventory: [
        {id: "sword", quantity: 1},
        {id: "shield", quantity: 1}
      ]
    })
    // check array structure
    const modelInstance = toInstance(model)
    const inventoryInstance = toInstance(modelInstance.$data.inventory)
    const swordInstance = toInstance(model.inventory[0])
    const leafInstance = toLeaf(swordInstance.$data.id)
    expect(inventoryInstance.$parent).toBe(modelInstance)
    expect(swordInstance.$parent).toBe(inventoryInstance)
    expect(leafInstance.$parent).toBe(swordInstance)
  })

  test("with optional", function() {
    const model = observable([{health: 10}], {isStrict: false})
    const modelInstance = toNode(model)
    const childInstance = toInstance(model[0])
    const leafInstance = childInstance.$data.health
    expect(childInstance.$parent === modelInstance)
    expect(childInstance.$parentKey === '0')
    expect(childInstance.$path === makePath(modelInstance.$id, '0'))
    expect(leafInstance.$parent === childInstance)
    expect(leafInstance.$parentKey === 'health')
    expect(leafInstance.$path === makePath(modelInstance.$id, '0/health'))
  })
})

describe("Node is dettached when killed", function() {
  test("with object parent", function() {
    const model = object({
      stats: object({
        health: number()
      })
    }).create()
    const modelInstance = toNode(model)
    const childInstance = modelInstance.$data.stats
    childInstance.$kill
    expect(childInstance.$parent === undefined)
    expect(childInstance.$parentKey === '')
    expect(childInstance.$path === '')
  })
  test("with array parent", function() {
    const model = array(object({
      health: number()
    })).create([{health: 10}])
    const modelInstance = toNode(model)
    const childInstance = modelInstance.$data[0]
    getContext(toInstance(model)).transaction(() => model.pop())
    expect(childInstance.$parent === undefined)
    expect(childInstance.$parentKey === '')
    expect(childInstance.$path === '')
  })
  test("with map parent", function(){
    const model = map(string()).create([['0', 'Fraktar']])
    const modelInstance = toNode(model)
    const childInstance = modelInstance.$data.get('0')
    getContext(toInstance(model)).transaction(() => model.clear())
    expect(childInstance.$parent === undefined)
    expect(childInstance.$parentKey === '')
    expect(childInstance.$path === '')
  })

  test("with union parent", function() {
    const model = object({
      stats: union([
        object({
          health: number()
        }),
        undefinedType()
      ])
    }).create({stats: { health: 10 }})
    const childInstance = toInstance(model)
    getContext(toInstance(model)).transaction(() => model.stats = undefined)
    expect(childInstance.$parent === undefined)
    expect(childInstance.$parentKey === '')
    expect(childInstance.$path === '')
  })

  test("with optional", function() {
    const model = observable({stats: {health: 10}}, {isStrict: false})
    const modelInstance = toInstance(model)
    const childInstance = toInstance(modelInstance.$data.stats)
    getContext(toInstance(model)).transaction(() => (model.stats as any) = undefined)
    expect(childInstance.$parent === undefined)
    expect(childInstance.$parentKey === '')
    expect(childInstance.$path === '')
  })
})