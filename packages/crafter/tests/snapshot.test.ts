import { array } from "../src/array"
import { object } from "../src/object"
import { number, string } from "../src/Primitive"
import { toNode, getContext, toInstance } from "../src/helpers"

const App = array(
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

it('get snapshot from a tree', function() {
  const world = App.create([
    {
      name: 'Fraktar',
      stats: {
        health: 10,
        force: 4,
      },
      inventory: [{ id: 'sword', quantity: 1 }],
    },
  ])

  expect(App.getSnapshot(toNode<typeof App['Type']>(world))).toEqual([
    {
      name: 'Fraktar',
      stats: {
        health: 10,
        force: 4,
      },
      inventory: [{ id: 'sword', quantity: 1 }],
    },
  ])

  getContext(toInstance(world)).transaction(() => {
    world[0].inventory.push({
      id: 'shield',
      quantity: 1,
    })
  })

  expect(App.getSnapshot(toNode<typeof App['Type']>(world))).toEqual([
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
  const world = App.create()
  App.applySnapshot(toNode<typeof App['Type']>(world), [
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

  expect(App.getSnapshot(toNode<typeof App['Type']>(world))).toEqual([
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

test('Snapshot are not changed during a transaction.', function() {
  const Player = object({
    name: string(),
    inventory: array(object({
      id: string(),
      quantity: number()
    }))
  })
  const model0 = Player.create({
    name: 'Elwein',
    inventory: [
      { id: 'sword', quantity: 1 },
      { id: 'shield', quantity: 2 },
    ],
  })
  const model1 = Player.create({
    name: 'Fraktar',
    inventory: [
      { id: 'sword', quantity: 1 },
      { id: 'shield', quantity: 2 },
    ],
  }, {
    context: getContext(toInstance(model0))
  })

  getContext(toInstance(model0)).transaction(() => {
    model0.inventory.push({ id: 'potion', quantity: 1 })
    expect(model0.inventory.length).toBe(3)
    model1.inventory.push({ id: 'potion', quantity: 1 })
    expect(model1.inventory.length).toBe(3)
    expect(Player.getSnapshot(toInstance(model0)).inventory.length).toBe(2)
    expect(Player.getSnapshot(toInstance(model1)).inventory.length).toBe(2)
  })
  expect(Player.getSnapshot(toInstance(model0)).inventory.length).toBe(3)
  expect(Player.getSnapshot(toInstance(model0)).inventory.length).toBe(3)
})

test('snapshot are immutable', function() {
  const Model = object({
    name: string(),
    inventory: object({
      slots: array(
        object({
          id: string(),
          name: string(),
        })
      ),
      wizar: object({
        quantity: number(),
        phase: number(),
      }),
    }),
  })

  const instance = Model.create({
    name: 'Fraktar',
    inventory: {
      slots: [],
      wizar: {
        quantity: 5,
        phase: 4,
      },
    },
  })

  const snapshots = [Model.getSnapshot(toInstance(instance))]

  getContext(toInstance(instance)).transaction(() =>
    instance.inventory.slots.push({ name: 'sword', id: '445dj9dg' })
  )

  snapshots.push(Model.getSnapshot(toInstance(instance)))

  getContext(toInstance(instance)).transaction(() => (instance.inventory.wizar.quantity = 10))

  snapshots.push(Model.getSnapshot(toInstance(instance)))

  expect(snapshots[0].inventory.slots.length).toBe(0)
  expect(snapshots[1].inventory.slots.length).toBe(1)
  expect(snapshots[0].inventory.wizar.quantity).toBe(5)
  expect(snapshots[1].inventory.wizar.quantity).toBe(5)
  expect(snapshots[2].inventory.wizar.quantity).toBe(10)
})