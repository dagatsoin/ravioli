test.todo('')
/* it("should accept value",function() {
  const comp = component(object({name: string()}))
    .addAcceptor(model => ({
      setName: {
        condition: ({name}: {name: string}) => name.length > 5,
        mutator({name}: {name: string}) {
          model.name = name
        }
      }
    }))

  const {representation, present} = comp.create({name: "Fraktar"})
  present([{ type: "setName", payload: {name: "Fraktos"}}])
  expect(representation.name).toEqual("Fraktos")
})

it("should not accept value",function() {
  const comp = component(object({name: string()}))
    .addAcceptor(model => ({
      setName: {
        condition: ({name}: {name: string}) => name.length > 5,
        mutator({name}: {name: string}) {
          model.name = name
        }
      }
    }))

  const {representation, present} = comp.create({name: "Fraktar"})
  present([{ type: "setName", payload: {name: "Frak"}}])
  expect(representation.name).toEqual("Fraktar")
}) */
