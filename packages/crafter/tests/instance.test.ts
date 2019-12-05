import { number } from "../src/Primitive"

test("Primitive instance should not have any enumerable keys", function() {
  const model = number().create(5)
  console.log(model)
  expect(Object.keys(model)).toEqual([])
})