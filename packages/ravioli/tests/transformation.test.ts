import { component } from "../src/api"
import { object, string } from "@warfog/crafter"

test('transform to non observable (primitive, file, ...)', function() {
  const player = component(object({
    name: string()
  }))
    .addAcceptor('setName', model => ({mutator({name}: {name: string}): void { model.name = name }}))
    .addActions({setName: 'setName'})
    .setTransformation('toString', model => model.name, false)
    .create()
  
    player.actions.setName({name: 'Fraktar'})

    expect(player.state.representation).toBe('Fraktar')
})