import { component } from "../src/api"
import { object, string, number, array, autorun, getGlobal } from "@warfog/crafter"

test('default representation', function() {
  const player = component(object({
    name: string(),
    health: number(),
    inventory: array(object({ id: string(), quantity: number() }))
  }))
    .addAcceptor('addToInventory', model => ({mutator(item: {id: string, quantity: number}): void { model.inventory.push(item) }}))
    .addActions({ pickUp: (item: {id: string, quantity: number}) => [{ type: 'addToInventory', payload: item}]})
    .create({
      name: 'Fraktar',
      health: 10,
      inventory: [
        { id: 'sword', quantity: 1},
        { id: 'shield', quantity: 1},
      ]
    })

    let inventory = []

    autorun(() => {
      inventory = player.state.representation.inventory.slice()
    })
  
    expect(inventory.length).toBe(2)
  
    // Found a potion! 
    player.actions.pickUp({ id: 'potion', quantity: 1})
  
    expect(inventory.length).toBe(3)
})

test('custom representation', function() {
  const player = component(object({
    name: string(),
    health: number(),
    inventory: array(object({ id: string(), quantity: number() }))
  }))
    .addAcceptor('addToInventory', model => ({mutator(item: {id: string, quantity: number}): void { model.inventory.push(item) }}))
    .addActions({ pickUp: (item: {id: string, quantity: number}) => [{ type: 'addToInventory', payload: item}]})
    .setTransformation('alive', (model) => ({ name: model.name, inventory: model.inventory }))
    .create({
      name: 'Fraktar',
      health: 10,
      inventory: [
        { id: 'sword', quantity: 1},
        { id: 'shield', quantity: 1},
      ]
    })

    let inventory = []

    autorun(() => {
      inventory = player.state.representation.inventory.slice()
    })
  
    expect(inventory.length).toBe(2)
  
    // Found a potion!
    player.actions.pickUp({ id: 'potion', quantity: 1})
  
    expect(inventory.length).toBe(3)
})

test('transform to primitive', function() {
  getGlobal().$$crafterContext.clearContainer()
  const player = component(object({
    name: string()
  }))
    .addAcceptor('setName', model => ({mutator({name: _name}: {name: string}): void { model.name = _name }}))
    .addActions({setName: 'setName'})
    .setTransformation('toString', model => model.name)
    .create()
  
    let name = ''

    autorun(() => {
      name = player.state.representation
    })

    player.actions.setName({name: 'Fraktar'})

    expect(name).toBe('Fraktar')
})