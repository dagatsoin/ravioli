import {
  object,
  string,
  number,
  array,
  getSnapshot,
  applySnapshot,
} from '../src'
import * as Manager from '../src/STManager'

it('get snapshot from a tree', function() {
  const app = array(
    object({
      name: string(),
      stats: object({
        health: number(),
        force: number(),
      }),

      inventory: array(
        object({
          id: string(),
          quantity: number(),
        })
      ),
    })
  )

  const world = app.create([
    {
      name: 'Fraktar',
      stats: {
        health: 10,
        force: 4,
      },
      inventory: [{ id: 'sword', quantity: 1 }],
    },
  ])

  expect(getSnapshot(world)).toEqual([
    {
      name: 'Fraktar',
      stats: {
        health: 10,
        force: 4,
      },
      inventory: [{ id: 'sword', quantity: 1 }],
    },
  ])

  Manager.transaction(() => {
    world[0].inventory.push({
      id: 'shield',
      quantity: 1,
    })
  })

  expect(getSnapshot(world)).toEqual([
    {
      name: 'Fraktar',
      stats: {
        health: 10,
        force: 4,
      },
      inventory: [
        {
          id: 'sword',
          quantity: 1,
        },
        {
          id: 'shield',
          quantity: 1,
        },
      ],
    },
  ])
})

describe('apply snapshot', function() {
  const app = array(
    object({
      name: string(),
      stats: object({
        health: number(),
        force: number(),
      }),

      inventory: array(
        object({
          id: string(),
          quantity: number(),
        })
      ),
    })
  )

  const world = app.create()
  applySnapshot(world, [
    {
      name: 'Fraktar',
      stats: {
        health: 10,
        force: 4,
      },
      inventory: [
        {
          id: 'sword',
          quantity: 1,
        },
        {
          id: 'shield',
          quantity: 1,
        },
      ],
    },
  ])

  expect(getSnapshot(world)).toEqual([
    {
      name: 'Fraktar',
      stats: {
        health: 10,
        force: 4,
      },
      inventory: [
        {
          id: 'sword',
          quantity: 1,
        },
        {
          id: 'shield',
          quantity: 1,
        },
      ],
    },
  ])
})
