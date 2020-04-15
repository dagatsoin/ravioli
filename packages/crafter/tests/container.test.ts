import { array } from '../src/array/factory'
import { container } from '../src/lib/container/factory'
import { map } from '../src/map/factory'
import { object } from '../src/object/factory'
import { string } from '../src/Primitive'
import { getContext } from '../src/helpers'
import { observable } from '../src'

test('wrap a leaf type', function() {
  const model = object({ name: container(string()) })
  const Fraktar = model.create({ name: 'Fraktar' })
  expect(Fraktar.name).toBe('Fraktar')
})

test('array/map methods are not enumerable', function() {
  const model = object({
    array: container(array(string())),
    map: container(map(string())),
  })
  const instance = model.create({
    array: ['Fraktar'],
    map: [['0', 'Fraktar']],
  })
  expect(Object.keys(instance.array)).toEqual(['0'])
  expect(Object.keys(instance.map)).toEqual([])
  expect(instance.array.find).toBeDefined()
  expect(instance.map.clear).toBeDefined()
})

describe('array value binding', function() {
  const model = object({
    players: container(array(object({ name: string() }))),
  })
  let instance: any

  beforeEach(function() {

    instance = model.create({ players: [
      { name: 'Fraktar' },
      { name: 'Elwein' },
      { name: 'Dreadbond' },
      { name: 'Cha' },
      { name: 'Ghost' }
    ] })
  })

  test('at creation', function() {
    expect(instance.players[0]).toEqual({ name: 'Fraktar' })
    expect(Object.keys((instance as any).$data.players.$targetInstance).length).toBe(Object.keys(instance.players).length)
  })

  describe('after multiple keys removal to target array', function(){
    test('splice', function() {
      getContext(instance).transaction(() => instance.players.splice(0, 3, {name: 'Fraktos'}))
      expect(Object.keys((instance as any).$data.players.$targetInstance).length).toBe(Object.keys(instance.players).length)
    })

    test('shift', function() {
      getContext(instance).transaction(() => instance.players.shift())
      expect(Object.keys((instance as any).$data.players.$targetInstance).length).toBe(Object.keys(instance.players).length)
    })
   
    test('pop', function() {
      getContext(instance).transaction(() => instance.players.pop())
      expect(Object.keys((instance as any).$data.players.$targetInstance).length).toBe(Object.keys(instance.players).length)
    })

    test('decrease length', function() {
      getContext(instance).transaction(() => instance.players.length = 1)
      expect(Object.keys((instance as any).$data.players.$targetInstance).length).toBe(Object.keys(instance.players).length)
    })

  })

  describe('after multiple keys addition to target array', function(){
    test('splice', function() {
      getContext(instance).transaction(() => instance.players.splice(0, 1, {name: 'Troll'}, {name: 'Troll'}, {name: 'Troll'}))
      expect(Object.keys((instance as any).$data.players.$targetInstance).length).toBe(Object.keys(instance.players).length)
    })

    test('unshift', function() {
      getContext(instance).transaction(() => instance.players.unshift({name: 'Troll'}, {name: 'Troll'}))
      expect(Object.keys((instance as any).$data.players.$targetInstance).length).toBe(Object.keys(instance.players).length)
    })
   
    test('push', function() {
      getContext(instance).transaction(() => instance.players.push({name: 'Troll'}, {name: 'Troll'}))
      expect(Object.keys((instance as any).$data.players.$targetInstance).length).toBe(Object.keys(instance.players).length)
    })

    test('increase length', function() {
      getContext(instance).transaction(() => instance.players.length = 10)
      expect(Object.keys((instance as any).$data.players.$targetInstance).length).toBe(Object.keys(instance.players).length)
    })
  })
})

test('array function binding', function() {
  const model = object({
    players: container(array(object({ name: string() }))),
  })
  const instance = model.create({ players: [{ name: 'Fraktar' }] })
  expect(instance.players.slice()).toEqual([{ name: 'Fraktar' }])
})