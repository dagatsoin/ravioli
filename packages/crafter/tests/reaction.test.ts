/* import { observable, Reaction } from "../src"
import { getGlobal } from '../src/utils/utils'

const context = getGlobal().$$crafterContext

it("should trigger side effect", function(){
  const model = observable({count: 0})
  let runs = 0
  const reaction = new Reaction(function() {
    runs++
  })

  reaction.observe(() => model.count)
  context.transaction(() => model.count++)
  expect(runs).toBe(1)
  context.transaction(() => model.count++)
  expect(runs).toBe(2)
  reaction.dispose()
  expect(runs).toBe(2)
  expect(context.snapshot.dependencyGraph.nodes.length).toBe(0)
})

it("should dispose when an error occurs during the reaction", function(){
  const model = observable({count: 0})
  const reaction = new Reaction(function() {
    throw new Error()
  })

  expect(() => {
    reaction.observe(() => model.count)
    context.transaction(() => model.count++)
  }).toThrow()
  expect(context.snapshot.dependencyGraph.nodes.length).toBe(0)
})

it("should abort initialisation when an error occurs during the tracking", function(){
  const model = observable({count: 0})
  let ran = false
  const reaction = new Reaction(function() {
    ran = true
  })

  expect(() => reaction.observe(() => {
    model.count
    throw new Error()
  })).toThrow()
  expect(ran).toBeFalsy()
  expect(context.snapshot.dependencyGraph.nodes.length).toBe(0)
}) */