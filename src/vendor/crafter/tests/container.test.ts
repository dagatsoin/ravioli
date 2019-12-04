import { array } from '../src/array'
import { container } from '../src/lib'
import { map } from '../src/map'
import { object } from '../src/object'
import { string } from '../src/Primitive'

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
    map: [[0, 'Fraktar']],
  })
  expect(Object.keys(instance.array)).toEqual(['0'])
  expect(Object.keys(instance.map)).toEqual([])
  expect(instance.array.find).toBeDefined()
  expect(instance.map.clear).toBeDefined()
})

test('array value binding', function() {
  const model = object({
    players: container(array(object({ name: string() }))),
  })
  const instance = model.create({ players: [{ name: 'Fraktar' }] })
  expect(instance.players[0]).toEqual({ name: 'Fraktar' })
})

test('array function binding', function() {
  const model = object({
    players: container(array(object({ name: string() }))),
  })
  const instance = model.create({ players: [{ name: 'Fraktar' }] })
  expect(instance.players.slice()).toEqual([{ name: 'Fraktar' }])
})
