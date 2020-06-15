import { string, number, boolean } from "../src/Primitive"
import { unbox, toInstance, getContext } from "../src/helpers"
import { autorun, Operation } from "../src"

test("factory", function() {
  const str = string("Fraktar").create()
  expect(unbox(toInstance(str))).toBe("Fraktar")
  const nb = number(1).create()
  expect(unbox(toInstance(nb))).toBe(1)
  const bool = boolean().create()
  expect(unbox(toInstance(bool))).toBeFalsy()
})

test("mutation", function() {
  const str = string("Fraktar").create()
  getContext(toInstance(str)).step(() => toInstance(str).$present([{op: Operation.replace, value: "Fraktos", path: "/"}]))
  expect(unbox(toInstance(str))).toBe("Fraktos")
})

test("reactivity", function() {
  const str = string("Fraktar").create()
  const dispose = autorun(function({isFirstRun}) {
    expect(unbox(toInstance(str))).toBe(isFirstRun ? "Fraktar" : "Fraktos")
  })
  getContext(toInstance(str)).step(() => toInstance(str).$present([{op: Operation.replace, value: "Fraktos", path: "/"}]))
  dispose()
})