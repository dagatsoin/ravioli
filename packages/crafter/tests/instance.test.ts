import { number, string, undefinedType } from "../src/Primitive"
import { object } from "../src/object"
import { toNode, toLeaf, makePath, toInstance } from "../src/helpers"
import { array } from "../src/array"
import { map } from "../src/map"
import { union } from "../src/union"
import { observable } from "../src"

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