import {
  addAcceptor,
  getAcceptorFactory,
  present,
  addActions,
  removeAction,
  removeAcceptor,
  addStepReaction,
  removeNAP,
  addControlStatePredicate,
  removeControlStatePredicate,
  rebuildActionsCache,
  setTransformation,
  removeTransformation,
} from '../src/lib/helpers'
import { component } from '../src/api'
import { object, string, number, array, noop } from '@warfog/crafter'
import { ComponentInstance } from '../src/lib/ComponentInstance'

const User = component(object({ name: string() }))
  .addAcceptor('setName', model => ({
    condition: () => true,
    mutator({ name }: { name: string }) {
      model.name = name
    },
  }))
  .addActions({
    rename({ name }: { name: string }) {
      return [
        {
          type: 'setName',
          payload: { name },
        },
      ]
    },
  }) /*
  .addRepresentation(({ model }) => ({ username: model.name }));
 */
describe('Acceptors', function() {
  test('static acceptor added before creation', function() {
    const user = User.create({ name: 'fraktar' })
    expect(user).toBeDefined()
    expect(getAcceptorFactory(user, 'setName')).toBeDefined()
  })

  test('add mutation staticaly', function() {
    const Comp = component(object({ name: string() })).addAcceptor(
      'setName',
      model => ({
        condition: () => true,
        mutator({ name }: { name: string }) {
          model.name = name
        },
      })
    )
    const comp = Comp.create({ name: 'Fraktar' })
    Comp.addAcceptor('foo', _ => ({
      mutator: () => {},
    }))
    expect(getAcceptorFactory(comp, 'foo')).toBeDefined()
  })
})

test('proposal presentation', function() {
  const user = User.create({ name: 'Fraktar ' })

  const proposal = Object.assign(
    [
      {
        type: 'setName',
        payload: {
          name: 'Fraktos',
        },
      },
    ],
    { stepId: user.state.stepId }
  )

  present(user, proposal)
  expect(user.state.representation.name).toBe('Fraktos')
})

describe('Set actions', function() {
  test('static actions added before creation', function() {
    const comp = component(object({ name: string() }))
      .addAcceptor('setName', model => ({
        mutator({ name }: { name: string }) {
          model.name = name
        },
      }))
      .addActions({
        rename({ name }: { name: string }) {
          return [
            {
              type: 'setName',
              payload: { name },
            },
          ]
        },
      })

    const { actions } = comp.create({ name: 'Fraktar' })
    expect(Object.keys(actions)).toEqual(['rename'])
  })

  test('add action staticaly', function() {
    const Comp = component(object({ name: string() })).addAcceptor(
      'rename',
      model => ({
        mutator({ name }: { name: string }) {
          model.name = name
        },
      })
    )

    const comp = Comp.create({ name: 'Fraktar' })

    Comp.addActions({
      rename({ name }: { name: string }) {
        return [
          {
            type: 'rename',
            payload: { name },
          },
        ]
      },
    })

    expect(Object.keys(comp.actions)).toEqual(['rename'])
  })
})

test('action cache invalidation', function() {
  const Comp = component(object({ name: string() })).addAcceptor(
    'rename',
    model => ({
      mutator({ name }: { name: string }) {
        model.name = name
      },
    })
  )

  const comp = Comp.create({ name: 'Fraktar' })

  // Actions list is now cached but no action is present.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const actions = comp.actions

  // Adding static action on the factory won't update the instance
  // actions cache.
  Comp.addActions({
    rename({ name }: { name: string }) {
      return [
        {
          type: 'rename',
          payload: { name },
        },
      ]
    },
  })

  // The cache is out of data and the rename action does not appears
  expect(Object.keys(comp.actions)).toEqual([])

  // We need to force the cache invalidation manually on the instance
  // for let it know about the new static action
  rebuildActionsCache(comp)

  // Now, the cache is up to date.
  expect(Object.keys(comp.actions)).toEqual(['rename'])
})

describe('Set NAP', function() {
  test('static nap added before instantiation', function() {
    const foo = component(object({}))
      .addStepReaction('bar', { effect() {} })
      .create()
    expect(
      ((foo as any) as ComponentInstance<
        any,
        any,
        any,
        any,
        any,
        any,
        any
      >).hasNAP('bar')
    ).toBeTruthy()
  })

  test('static nap added after instantiation', function() {
    const Foo = component(object({}))

    const foo = Foo.create()

    Foo.addStepReaction('bar', { effect() {} })

    expect(
      ((foo as any) as ComponentInstance<
        any,
        any,
        any,
        any,
        any,
        any,
        any
      >).hasNAP('bar')
    ).toBeTruthy()
  })
})

describe("transformation", function() {
    test('add transformation', function() {
    const foo = component(object({})).create()
     
    setTransformation(foo, 'bar', noop)

    expect(
      (foo as any).transformations.some(([id]) => id === 'bar')
    ).toBeDefined()
  })

  test('remove transformation', function() {
    const foo = component(object({})).create()
    
    setTransformation(foo, 'bar', noop)
    
    removeTransformation(foo, 'bar')

    expect((foo as any).transformations.length).toBe(0)
  })
})

/**
 * Internal use when an instance is enhanced.
 */
describe('Instance enhancement', function() {
  test('add mutation on instance', function() {
    const user = User.create({
      name: 'fraktar',
    })

    addAcceptor(user, 'shortName', data => ({
      condition: () => true,
      mutator: () => data.name.slice(1),
    }))

    expect(user).toBeDefined()
    expect(getAcceptorFactory(user, 'shortName')).toBeDefined()
  })

  test('remove acceptor from instance', function() {
    const user = User.create({
      name: 'fraktar',
    })

    addAcceptor(user, 'shortName', data => ({
      condition: () => true,
      mutator: () => data.name.slice(1),
    }))

    removeAcceptor(user, 'shortName')

    expect(getAcceptorFactory(user, 'shortName')).toBeUndefined()
  })

  test('add action on instance', function() {
    const Foo = component(object({})).addAcceptor('bar', _ => ({
      mutator() {},
    }))

    const foo = Foo.create()

    addActions<typeof Foo>(foo, {
      bar() {
        return [{ type: 'bar' }]
      },
    })
    expect('bar' in foo.actions).toBeTruthy()
  })

  test('should remove action on instance', function() {
    const Comp = component(object({}))
    const comp = Comp.create()

    addActions<typeof Comp>(comp, {
      foo() {
        return []
      },
    })

    removeAction(comp, 'foo')
    expect('foo' in comp.actions).toBeFalsy()
  })

  test('add NAP on instance', function() {
    const foo = component(object({})).create()

    addStepReaction(foo, 'bar', { effect() {} })

    expect(
      (foo as ComponentInstance<any, any, any, any, any, any, any>).hasNAP(
        'bar'
      )
    ).toBeTruthy()
  })

  test('remove NAP from instance', function() {
    const foo = component(object({})).create()

    addStepReaction(foo, 'bar', { effect() {} })
    removeNAP(foo, 'bar')

    expect(
      (foo as ComponentInstance<any, any, any, any, any, any, any>).hasNAP(
        'bar'
      )
    ).toBeFalsy()
  })

  test('add control state on instance', function() {
    const foo = component(object({}))
      .addActions({ dummy: () => [] })
      .create()

    addControlStatePredicate(foo, 'isMount', () => true)
    foo.actions.dummy()
    expect(foo.state.controlStates.includes('isMount')).toBeTruthy()
  })

  test('remove control state on instance', function() {
    const foo = component(object({})).create()

    addControlStatePredicate(foo, 'bar', () => true)
    removeControlStatePredicate(foo, 'br')

    expect(
      (foo as ComponentInstance<any, any, any, any, any, any, any>).hasNAP(
        'bar'
      )
    ).toBeFalsy()
  })

  test('instance actions, mutations and nap override factory behaviors', function() {
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
      .addStepReaction('auto heal', {
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
      .setControlStatePredicate('ISALIVE', ({ model }) => model.hp > 100000) // I know, just for testing...

    const Thrall = Grunt.create({ hp: 10000 })

    addStepReaction(Thrall, 'auto heal', {
      predicate: ({ delta: {acceptedMutations} }) =>
        acceptedMutations.some(
          ({ type, payload }) => type === 'setHP' && payload.hp < 0
        ),
      effect: (_, { heal }) => {
        console.log('Thrall is hit: -3')
        console.log('Buff double heal')
        heal()
        heal()
      },
    })

    addStepReaction(Thrall, 'on heal', {
      // is healed
      predicate: ({ delta: {acceptedMutations} }) =>
        acceptedMutations.some(
          ({ type, payload }) => type === 'setHP' && payload.hp > 0
        ),
      effect: () => {
        console.log('Thrall is healed: +6')
      },
    })

    addAcceptor(Thrall, 'setHP', model => ({
      mutator({ hp }: { hp: number }) {
        model.hp = model.hp + hp / 2
      },
    }))

    addActions<typeof Grunt>(Thrall, {
      hit() {
        return [
          {
            type: 'setHP',
            payload: {
              hp: -2,
            },
          },
        ]
      },
    })

    addControlStatePredicate<typeof Grunt>(
      Thrall,
      'ISALIVE',
      ({ model }) => model.hp > 0
    )

    Thrall.actions.hit()

    expect(Thrall.state.controlStates[0]).toEqual('ISALIVE')
    expect(Thrall.state.representation.hp).toBe(10005) // static would be 10003
  })

  test('instance transformation overrides factory transformation', function() {
    const player = component(object({
      name: string(),
      health: number(),
      inventory: array(object({ id: string(), quantity: number() }))
    }))
      .setControlStatePredicate('isAlive', ({model}) => model.health > 0)
      .setControlStatePredicate('isDead', ({model}) => model.health <= 0)
      .addAcceptor('setHealth', model => ({mutator({hp}: {hp: number}): void { model.health += hp }}))
      .addActions({ hit: () => [{ type: 'setHealth', payload: {hp: -10}}]})
      .setTransformation('dead', {
        predicate: 'isDead',
        computation: (model) => ({ name: model.name, inventory: model.inventory })
      })
      .create({
        name: 'Fraktar',
        health: 10,
        inventory: [
          { id: 'sword', quantity: 1},
          { id: 'shield', quantity: 1},
        ]
      })
  
    setTransformation(player, 'dead', {
      predicate: 'isDead',
      computation: model => ({ name: model.name })
    })
    
    player.actions.hit()
    
    expect(player.state.representation.inventory).toBeUndefined()
  })
})

test('snapshot difference between step', function() {
  const user = component(object({ name: string() }))
    .addAcceptor('rename', model => ({
      mutator: ({ name }) => (model.name = name),
    }))
    .addActions({ rename: 'rename' })
    .addStepReaction('', {
      effect({ delta: { previousSnapshot }, model }) {
        expect(model.name !== previousSnapshot.name)
      },
    })
    .create({ name: 'Fraktos' })

  user.actions.rename({ name: 'Fraktar' })
})

test('retrieve JSON patch', function() {
  const user = component(object({ name: string() }))
    .addAcceptor('rename', model => ({
      mutator: ({ name }) => (model.name = name),
    }))
    .addActions({ rename: 'rename' })
    .addStepReaction('', {
      effect({ delta: {migration} }) {
        expect(migration).toEqual({
          forward: [
            {
              op: 'replace',
              path: '/name',
              value: 'Fraktar',
            },
          ],
          backward: [
            {
              op: 'replace',
              path: '/name',
              value: 'Fraktos',
            },
          ],
        })
      },
    })
    .create({ name: 'Fraktos' })
    
  user.actions.rename({ name: 'Fraktar' })
})

test('representation predicate', function() {
  const player = component(object({
    name: string(),
    health: number(),
    inventory: array(object({ id: string(), quantity: number() }))
  }))
    .setControlStatePredicate('isAlive', ({model}) => model.health > 0)
    .setControlStatePredicate('isDead', ({model}) => model.health <= 0)
    .addAcceptor('setHealth', model => ({mutator({hp}: {hp: number}): void { model.health += hp }}))
    .addActions({ hit: () => [{ type: 'setHealth', payload: {hp: -10}}]})
    .setTransformation('alive', {
      predicate: 'isAlive',
      computation: (model) => ({ name: model.name, health: model.health})
    })
    .setTransformation('dead', {
      predicate: 'isDead',
      computation: (model) => ({ name: model.name, inventory: model.inventory })
    })
    .create({
      name: 'Fraktar',
      health: 10,
      inventory: [
        { id: 'sword', quantity: 1},
        { id: 'shield', quantity: 1},
      ]
    })

  // Player is alive, I can't see its inventory.
  expect(player.state.representation.inventory).toBeUndefined()

  // Take that!
  player.actions.hit()

  // Haha, here is one lovely sword!
  expect(player.state.representation.inventory).toBeDefined()
})

test.todo('reject a mutation which does not fulfill the condition')

test.todo('accept a mutation which fulfills the condition')

test.todo('generate a JSON operation after any mutations')

it.todo('should reject a proposal when instance is locked')

it.todo('should reject a proposal when instance is unlocked')

it.todo('should refuse to trigger an not allowed action')

it.todo('should accept to trigger an allowed action')

test.todo('throw if a mutation try to replace model')