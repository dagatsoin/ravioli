import { component } from '../src/api'
import { object, string } from '@warfog/crafter'

test("this function run after each step", function() {
  function log({state}: {state: {representation: any} }) {
    logs.push(state.representation)
  }

  const comp = component(object({
    name: string()
  }))
  .addAcceptor('setName', model => ({
    mutator({name}: {name: string}) {
      model.name = name
    }
  }))
  .addActions({setName: 'setName'})
  .setTransformation('player', model => model.name, false)
  .addStepReaction('log', {effect: log})
  .create()

  const logs: string[] = []

  comp.actions.setName({name: 'Fraktar'})

  expect(logs).toEqual(['Fraktar'])

})