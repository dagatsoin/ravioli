import { toNode, getContext, toInstance } from '../src/helpers'
import { observable } from '../src/lib/observable'
import { object } from '../src/object/factory'
import { string, number } from '../src/Primitive'
import { array } from '../src/array'
import { Command } from '../src/lib/JSONPatch'
import { getGlobal, map, cutDownUpdateOperation } from '../src'

const Player = object({
  name: string(),
  inventory: array(
    object({
      id: string(),
      count: number(),
    })
  ),
})

let player: typeof Player.Type

beforeEach(function() {
  player = Player.create()
})

it('should have patch after an Arr.splice', function() {
  getContext(toInstance(player)).transaction(() => {
    player.inventory = player.inventory.splice(0, 1)
    expect(toNode(player).$migration.forward.length > 0)
  })
  expect(toNode(player).$migration.forward.length === 0)
})

test('apply patch', function() {
  const target = observable({
    name: 'Fraktar',
    inventory: [
      { id: 'sword', quantity: 1 },
      { id: 'shield', quantity: 1 },
    ],
    some: {
      nested: {
        field: 'foo',
      },
      map: new Map([['key', { field: 'value' }]]),
    },
  })
  const node = toNode(target)
  getContext(toInstance(target)).transaction(() =>
    ([
      { op: 'replace', path: '/name', value: 'Fraktos' },
      { op: 'remove', path: '/inventory/1' },
      { op: 'replace', path: '/some/nested/field', value: 'bar' },
      { op: 'replace', path: '/some/map/key', value: { field: 'new value' } },
    ] as any).forEach((op: Command) => node.$present(op))
  )
  expect(target.name).toBe('Fraktos')
  expect(target.inventory[1]).toBeUndefined()
  expect(target.inventory.length).toBe(1)
  expect(target.some.nested.field).toBe('bar')
  expect(target.some.map.get('key')!.field).toBe('new value')
})

describe('JSON migration generation', function() {
  beforeEach(function(){
    getGlobal().$$crafterContext.clearContainer()
  //  getGlobal().$$crafterContext.transaction(() => toInstance(model).$applySnapshot({player:{ name: "Fraktar", stats: { health: 10 }}}))
  })

  const model = object({
    player: object({
      name: string(),
      stats: object({
        health: number()
      })
    })
  }).create({player:{ name: "Fraktar", stats: { health: 10 }}})

  test('updating a node child generate the node commands and the leafs commands', function(){
    const context = getContext(toInstance(model))
  
    context.transaction(() => {
      model.player = {name: "Fraktos", stats: { health: 5 }}
      const patch = toNode(model).$migration.forward.sort((a, b) => a.path.length - b.path.length)
      expect(patch).toEqual([
        {op: "replace", path:"/player", value: {name: "Fraktos", stats: { health: 5 }}},
        {op: "replace", path:"/player/name", value: "Fraktos"},
        {op: "replace", path:"/player/stats", value: { health: 5 }},
        {op: "replace", path:"/player/stats/health", value: 5}
      ].sort((a, b) => a.path.length - b.path.length))
    })
  })

  test('the patch of a node contains only node mutations', function(){
    const context = getContext(toInstance(model))
  
    context.transaction(() => {
      model.player = {name: "Fraktos", stats: { health: 5 }}
      const patch = toNode(model).$migration.forward.sort((a, b) => a.path.length - b.path.length)
      expect(patch).toEqual([
        {op: "replace", path:"/player", value: {name: "Fraktos", stats: { health: 5 }}},
      ].sort((a, b) => a.path.length - b.path.length))
    })
  })

  test('array replacement emit patch', function() {
    const model = object({
      inventory: array(object({id: string(), quantity: number()}))
    }).create()
    const context = getContext(toInstance(model))
    context.transaction(() => {
      model.inventory = [{id:'sword', quantity: 1}]
      const patch = toNode(model).$migration.forward
      expect(patch).toEqual([
        {op: "replace", path:"/inventory", value: [{id:'sword', quantity: 1}]}
      ])
    })
  })
  test('map replacement emit patch', function() {
    const model = object({
      inventory: map(number())
    }).create()
    const context = getContext(toInstance(model))
    context.transaction(() => {
      model.inventory = new Map([['sword', 1]])
      const patch = toNode(model).$migration.forward
      expect(patch).toEqual([
        {op: "replace", path:"/inventory", value: [['sword', 1]]}
      ])
    })
  })
})

describe('apply JSON command', function() {
  /**
   * Any update command on an object property must be a list or leaf command
   */
  test('cut down update command', function(){
    expect(cutDownUpdateOperation({
      name: 'Fraktar',
      stats: {
        health: 5,
        force: 5,
        buffs: {
          force: 4
        }
      }
    }, "/")).toEqual([
      {
        op: "replace",
        path: "/name",
        value: "Fraktar"
      },
      {
        op: "replace",
        path: "/stats",
        value: {
          health: 5,
          force: 5,
          buffs: {
            force: 4
          }
        }
      }
    ])
  })
})