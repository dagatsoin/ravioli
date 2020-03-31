import { object, string, noop } from '@warfog/crafter'

import { component, IWithAcceptorFactories } from '../src/api'
import { ComponentFactory } from '../src/lib/ComponentFactory'

describe('Component api', function() {
  test('should add an acceptor factory', function() {
    const User = component(
      object({
        id: string(),
        name: string(),
      })
    ).addAcceptor('setName', model => ({
      mutator({ name }: { name: string }) {
        model.name = name
      },
    }))
    expect(
      ((User as unknown) as IWithAcceptorFactories<any>).getAcceptorFactory(
        'setName'
      )?.({})
    ).toBeDefined()
  })

  test('should remove acceptor', function() {
    const Foo = component(object({}))
      .addAcceptor('bar', () => ({ mutator() {} }))
      .removeAcceptor('bar')

    expect(
      ((Foo as unknown) as IWithAcceptorFactories<any>).getAcceptorFactory(
        'bar'
      )?.({})
    ).toBeUndefined()
  })

  /* test("add control state", function(){
    const comp = component(object({health: number()}))
      .addBasicControlStatesPredicate({
        isAlive: model => model.health > 0
      })
    const {state: {representation: { controlState }}} = comp.create({health: 1})
    expect(controlState).toBe("isAlive")
  }) */

  test('should add actions', function() {
    const Comp = component(object({ name: string() }))
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
    expect(Comp.packagedActions.rename).toBeDefined()
  })

  test('should remove action', function() {
    const Foo = component(object({}))
      .addActions({
        bar() {
          return []
        },
      })
      .removeAction('bar')

    expect(
      ((Foo as unknown) as IWithAcceptorFactories<any>).getAcceptorFactory(
        'bar'
      )?.({})
    ).toBeUndefined()
  })

  test('add nap', function() {
    const Foo = component(object({})).addStepReaction('bar', { effect() {} })
    expect(
      ((Foo as unknown) as ComponentFactory).NAPs.has('bar' as never)
    ).toBeTruthy()
  })

  test('remove nap', function() {
    const Foo = component(object({}))
      .addStepReaction('bar', { effect() {} })
      .removeNap('bar')
    expect(
      ((Foo as unknown) as ComponentFactory).NAPs.has('bar' as never)
    ).toBeFalsy()
  })

  test('add control state', function() {
    const Foo = component(object({})).setControlStatePredicate(
      'bar',
      () => true
    )

    expect(
      ((Foo as unknown) as ComponentFactory).controlStatePredicates.has(
        'bar' as never
      )
    ).toBeTruthy()
  })

  test('remove control state', function() {
    const Foo = component(object({}))
      .setControlStatePredicate('bar', () => true)
      .removeControlState('bar')

    expect(
      ((Foo as unknown) as ComponentFactory).controlStatePredicates.has(
        'bar' as never
      )
    ).toBeFalsy()
  })

  test('add transformation', function() {
    const Foo = component(object({}))
    .setTransformation('bar', noop)

    expect(
      ((Foo as unknown) as ComponentFactory).transformations.some(({id}) => id === 'bar')
    ).toBeDefined()
  })

  test('remove transformation', function() {
    const Foo = component(object({}))
      .setTransformation('bar', noop)
      .removeTransformation('bar')

    expect(((Foo as unknown) as ComponentFactory).transformations.length).toBe(0)
  })

  /*
  test("addActions with auth", function() {
    const comp = component(object({name: string(), health: number()}))
      .addBasicControlStatesPredicate({
        isAlive: model => model.health > 0
      })
      .setAcceptors(model => ({
        setName: {
          mutator({name}: {name: string}) {
            model.name = name
          }
        }
      }))
      .setActions({
        rename: {
          isAllowed(actionContext) {
            return actionContext.controlState === "isAlive"
          },
          action({name}: {name: string}) {
            return [{
              type: "setName",
              payload: {name}
            }]
          }
        }
      })
    
    const { actions } = comp.create({name: "Fraktar"})
    expect(Object.keys(actions)).toEqual(["rename"])
  })

  test("map action to mutation by name", function() {
    const comp = component(object({name: string()}))
      .setAcceptors(model => ({
        setName: {
          mutator({name}: {name: string}) {
            model.name = name
          }
        }
      }))
      .setActions({rename: "setName"})
    
    const {actions} = comp.create({name: "Fraktar"})
    expect(Object.keys(actions)).toEqual(["rename"])
  })

  test("add reaction", function() {
    function isStarted(model) {
      // All services has been started
      // TODO turn into string enum for iterate
      return [
        'dataService',
        'accountService',
        'gameMasterService',
        'geoLocationService',
        'achievementService',
        'networkService',
        'questService',
        'chatService'
      ]
      .every(id => model.app.servicesStatus.some(s => s.serviceId === id && s.isRunning))
    }
        
    function isRestored(model) {
      return model.user._id.length
    }
    
    function isSynchronised(model) {
      return model.app.isSynchronised
    }
    
    function isLoggedOffline(model) {
      return model.app.loginStatus === 'loggedOffline'
    }
    
    function isLoggedOut(model) {
      return model.app.loginStatus === 'loggedOut'
    }
    
    function isOnline(model) {
      return model.app.connexionStatus.connected
    }

    
    const comp = component(object({
     app: object({
      servicesStatus: enum([
        "dzd"
      ]),
      loginStatus: :,
      isSynchronised:,
      loginStatus:,
      loginStatus:,
      connexionStatus:,
      connexionStatus:,
     }) 
    }))
      .setAcceptors(model => ({
        endQuest: {
          mutator({questId}: {questId: string}) {
            model.questLog.splice(model.questLog.indexOf(questId), 1)
          }
        },
        addCompleteQuest: {
          mutator({questId}: {questId: string}) {
            model.completeQuests.push(questId)
          }
        }
      }))
      .addBasicControlStatesPredicate({
        isLoggedOnline(model) {
          return model.app.loginStatus === 'loggedOnline'
        },

      })
      .setActions({
        endQuest: "endQuest",
        addCompleteQuest: "addCompleteQuest"
      })
      .addNAP({
        firstBoot: {
          condition({controlState}) {
            return (controlState === ControlState.ON ||
              (controlState === ControlState.LOGGED_OUT &&
                model.acceptedMutations.some(
                  ({ type }) => type === MutationType.SET_NETWORK_STATUS
                ) &&
                model.app.connexionStatus.connected))
          },
          dispatch(mutations) {
            return [{type: "addCompleteQuest", payload: { questId: mutations.find(({type}) => type === "endQuest")!.payload.questId }}]
          }
        }
      })
      const {actions: { endQuest }, representation : {derivation}} = comp.create({questLog: [], completeQuests: []})
      endQuest({questId: "45ef45fad"})
      expect(derivation.completeQuests).toEqual(["45ef45fad"])

  })*/
})
