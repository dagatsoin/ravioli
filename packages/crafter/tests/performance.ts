import { array } from '../src/array'
import { assert, toInstance, getSnapshot, getContext } from '../src/helpers'
import { object } from '../src/object'
import { number, string } from '../src/Primitive'

const Slot = object({
  id: string(),
  quantity: number(),
})

const Currency = object({
  currency: string(),
  quantity: number(),
})

const Entity = object({
  name: string(),
  inventory: object({
    slots: array(Slot),
    monneies: array(Currency),
    wizar: object({
      quantity: number(),
      phase: number(),
    }),
  }),
})

const World = object({
  entities: array(Entity),
})

function createSingleEntity(): void {
  const t0 = new Date().getTime()

  Entity.create({
    name: 'Fraktar',
    inventory: {
      monneies: [
        { currency: 'gems', quantity: 10 },
        { currency: 'sweet', quantity: 100 },
      ],
      slots: [
        { id: 'sword', quantity: 1 },
        { id: 'potion', quantity: 100 },
      ],
      wizar: {
        quantity: 30840,
        phase: 207,
      },
    },
  })

  const t1 = new Date().getTime()

  console.info('create 1 entity', t1 - t0)
}

// Array with 10k entities
function createArrayWith10k(): void {
  const t0 = new Date().getTime()
  const entities = new Array(10000).fill(undefined).map(() => ({
    name: 'Fraktar',
    inventory: {
      monneies: [
        { currency: 'gems', quantity: 10 },
        { currency: 'sweet', quantity: 100 },
      ],
      slots: [
        { id: 'sword', quantity: 1 },
        { id: 'potion', quantity: 100 },
      ],
      wizar: {
        quantity: 30840,
        phase: 207,
      },
    },
  }))

  const t1 = new Date().getTime()

  const world = World.create()

  const t2 = new Date().getTime()

  World.applySnapshot(toInstance(world), {entities})

  const t3 = new Date().getTime()
  getContext(toInstance(world)).transaction(() => {
    world.entities.forEach(entity =>
      entity.inventory.slots.forEach(slot => slot.quantity++)
    )
  })
  const t4 = new Date().getTime()

  assert(getSnapshot(world).entities[5005].inventory.slots[1].quantity === 101)

  const t5 = new Date().getTime()

  console.info('snapshot loading', t1 - t0)
  console.info('empty model creation', t2 - t1)
  console.info('hydration', t3 - t2)
  console.info('mutation', t4 - t3)
  console.info('get snapshot', t5 - t4)
}

createSingleEntity()
createArrayWith10k()
