import { component } from '../src/api'
import { object, number } from '@warfog/crafter'

it('should auto heal after a hit', function() {
  const Grunt = component(
    object({
      hp: number(),
    })
  )
    .addAcceptor('setHP', model => ({
      mutator({ hp }: { hp: number }) {
        model.hp = model.hp + hp
      },
    }))
    .addActions({
      hit() {
        return [
          {
            type: 'setHP',
            payload: {
              hp: -3,
            },
          },
        ]
      },
      heal() {
        return [
          {
            type: 'setHP',
            payload: {
              hp: 6,
            },
          },
        ]
      },
    })
    .addStepReaction('autoHeal', {
      // is hit
      predicate: ({ delta: {acceptedMutations} }) =>
        acceptedMutations.some(
          ({ type, payload }) => type === 'setHP' && payload.hp < 0
        ),
      effect: (_, { heal }) => {
        console.log('Thrall is hit: -3')
        heal()
      },
    })
    .addStepReaction('on heal', {
      // is healed
      predicate: ({ delta: {acceptedMutations} }) =>
        acceptedMutations.some(
          ({ type, payload }) => type === 'setHP' && payload.hp > 0
        ),
      effect: () => {
        console.log('Thrall auto heal: +6')
        console.log("Thrall says: 'Hit me again ! Muhahahahaa'")
      },
    })

  const Thrall = Grunt.create({ hp: 10000 })

  Thrall.actions.hit()
  expect(Thrall.state.representation.hp).toBe(10003)
})
