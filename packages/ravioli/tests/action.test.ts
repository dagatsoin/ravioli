import { component } from "../src/api"
import { object, number, boolean, string } from '@warfog/crafter'

test('declare action by mutation name', function() {
  const User = component(
    object({
      name: string(),
      age: number(),
    })
  )
    .addAcceptor('setName', model => ({
      mutator({ name }: { name: string }) {
        model.name = name
      },
    }))
    .addAcceptor('setAge', model => ({
      mutator({ age }: { age: number }) {
        model.age = age
      },
    }))
    .addActions({
      setName: 'setName',
    })

  const user = User.create()

  user.actions.setName({ name: 'Fraktar' })

  expect(user.state.representation.name).toBe('Fraktar')
})

test('synchronous action', function() {
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

  const Thrall = Grunt.create({ hp: 10000 })

  Thrall.actions.hit()
  expect(Thrall.state.representation.hp).toBe(9997)

  Thrall.actions.heal()
  expect(Thrall.state.representation.hp).toBe(10003)
})

test('asynchronous action', function(done) {
  const App = component(object({ isStale: boolean() }))
    .addAcceptor('clean', model => ({
      mutator() {
        model.isStale = false
      },
    }))
    .addActions({
      save: {
        isAsync: true,
        action() {
          return new Promise(resolve => {
            resolve([
              {
                type: 'clean',
              },
            ])
          })
        },
      },
    })
    .addStepReaction('stop', {
      effect() {
        expect(app.state.representation.isStale).toBeFalsy()
        done()
      },
    })

  const app = App.create({ isStale: true })

  app.actions.save()
})

it('should cancel the asynchronous save action', function() {
  const App = component(object({ isStale: boolean() }))
    .addAcceptor('clean', model => ({
      mutator() {
        model.isStale = false
      },
    }))
    .addActions({
      save: {
        isAsync: true,
        isCancelable: true,
        action() {
          return new Promise(resolve => {
            resolve([
              {
                type: 'clean',
              },
            ])
          })
        },
      },
      cancel() {
        return []
      },
    })
    .addStepReaction('', {
      predicate: ({ delta: {acceptedMutations} }) => !acceptedMutations.length,
      effect: () => {
        expect(app.state.representation.isStale).toBeTruthy()
      },
    })

  const app = App.create({ isStale: true })

  app.actions.save()
  app.actions.cancel()
})

test('compose actions', function() {
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
              hp: -5,
            },
          },
        ]
      },
    })

  const grunt = Grunt.create({ hp: 10 })

  grunt.compose(({ hit }) => [hit(), hit()])

  expect(grunt.state.representation.hp).toBe(0) // static would be 10003
})

test('auth action', function() {
  const Grunt = component(
    object({
      hp: number(),
    })
  )
    .setControlStatePredicate('IS_ALIVE', ({ model }) => model.hp > 0)
    .setControlStatePredicate('IS_DEAD', ({ model }) => model.hp <= 0)
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
              hp: -6,
            },
          },
        ]
      },
      heal: {
        isAllowed: context => context.controlStates[0] === 'IS_ALIVE',
        action: () => [
          {
            type: 'setHP',
            payload: {
              hp: 2,
            },
          },
        ],
      },
    })

  const grunt = Grunt.create({ hp: 10 })

  grunt.actions.hit()
  grunt.actions.heal()
  grunt.actions.hit()
  expect(grunt.state.representation.hp).toBe(0)
  expect(grunt.state.controlStates[0]).toBe('IS_DEAD')
  grunt.actions.heal()
  expect(grunt.state.representation.hp).toBe(0)
})
