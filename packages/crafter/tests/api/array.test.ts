import { array } from '../../src/array'
import { string, number } from '../../src/Primitive'
import { isInstance } from '../../src/lib/Instance'
import { isNode } from "../../src/lib/isNode"
import { toNode } from '../../src/helpers'
import { object } from '../../src/object'

describe('factory', function() {
  test('Create array of primitive', function() {
    const Players = array(string())
    const players = Players.create(['Fraktar', 'Dreadbond', 'Elwein'])
    expect(isInstance(players)).toBeTruthy()
    expect(isNode(players)).toBeTruthy()
    expect(players[0]).toBe('Fraktar')
    expect(toNode(players).$state.migration).toEqual({ backward: [], forward: [] })
  })
  
  test('Create array of objects', function() {
    const Players = array(
      object({
        name: string(),
        level: number(),
        hp: number(),
      })
    )
    const players = Players.create([
      {
        name: 'Fraktar',
        level: 1,
        hp: 10,
      },
    ])
    
    expect(isInstance(players)).toBeTruthy()
    expect(isNode(players)).toBeTruthy()
    expect(players[0].name).toBe('Fraktar')
  })
})

describe('Array muation methods', function() {
  test.todo('splice: empty array')
  test.todo('splice: insert data')
  test.todo('splice: replace data')
  test.todo('push')
  test.todo('sortClone')
  test.todo('pop')
  test.todo('shift')
  test.todo('unshift')
  test.todo('set length')
})

describe('Array derivation methods', function() {
  test.todo('filter')
  test.todo('sort')
  test.todo('toString')
  test.todo('toLocaleString')
  test.todo('concat')
  test.todo('join')
  test.todo('reverse')
  test.todo('sort')
  test.todo('slice')
  test.todo('indexOf')
  test.todo('lastIndexOf')
  test.todo('every')
  test.todo('some')
  test.todo('forEach')
  test.todo('map')
  test.todo('filter')
  test.todo('reduce')
  test.todo('reduceRight')
})