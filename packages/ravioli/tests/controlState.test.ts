import { component } from '../src/api'
import { object, array, string, boolean, enumeration } from 'crafter'

test('Use case with a control state tree', function() {
  const App = component(
    object({
      appModel: object({
        connexionStatus: object({
          connected: boolean(),
        }),
        servicesStatus: array(
          object({
            serviceId: string(),
            isRunning: boolean(),
          })
        ),
        isSynchronised: boolean(),
        loginStatus: enumeration('loggedOnline', 'loggedOffline', 'loggedOut'),
      }),
      userModel: object({
        _id: string(),
      }),
    }),
    {
      keepLastControlStateIfUndefined: true,
    }
  )
    .setControlStatePredicate('OFF', ({ model }) =>
      [
        'dataService',
        'accountService',
        'gameMasterService',
        'geoLocationService',
        'achievementService',
        'networkService',
        'questService',
        'chatService',
      ].some(
        id =>
          model.appModel.servicesStatus.every(s => s.serviceId !== id) ||
          model.appModel.servicesStatus.some(
            s => s.serviceId === id && !s.isRunning
          )
      )
    )
    .setControlStatePredicate('ON', ({ model, previousControlStates }) => (
        previousControlStates.includes('OFF') &&
        [
          'dataService',
          'accountService',
          'gameMasterService',
          'geoLocationService',
          'achievementService',
          'networkService',
          'questService',
          'chatService',
        ].every(id =>
          model.appModel.servicesStatus.some(
            s => s.serviceId === id && s.isRunning
          )
        )
      ))
    .setControlStatePredicate(
      'LOGGED_OUT',
      ({ model, previousControlStates }) =>
        (previousControlStates.includes('ON') &&
          model.appModel.loginStatus === 'loggedOut') ||
        (previousControlStates.includes('RUNNING_ONLINE' as any) &&
          model.appModel.loginStatus === 'loggedOut') ||
        (previousControlStates.includes('RUNNING_OFFLINE' as any) &&
          model.appModel.loginStatus === 'loggedOut')
    )
    .setControlStatePredicate(
      'LOGGED_ONLINE',
      ({ model, previousControlStates }) =>
        (previousControlStates.includes('ON') &&
          model.appModel.loginStatus === 'loggedOnline') ||
        (previousControlStates.includes('LOGGED_OUT') &&
          !model.appModel.isSynchronised &&
          model.appModel.loginStatus === 'loggedOnline') ||
        (previousControlStates.includes('RUNNING_OFFLINE' as any) &&
          !model.appModel.isSynchronised &&
          model.appModel.loginStatus === 'loggedOnline')
    )
    .setControlStatePredicate(
      'LOGGED_OFFLINE',
      ({ model, previousControlStates }) =>
        (previousControlStates.includes('ON') &&
          model.appModel.loginStatus === 'loggedOffline') ||
        (previousControlStates.includes('LOGGED_ONLINE') &&
          model.appModel.loginStatus === 'loggedOffline') ||
        (previousControlStates.includes('LOGGED_OUT') &&
          model.appModel.loginStatus === 'loggedOffline')
    )
    .setControlStatePredicate(
      'RUNNING_ONLINE',
      ({ model, previousControlStates }) =>
        (previousControlStates.includes('LOGGED_OUT') &&
          model.appModel.isSynchronised &&
          model.appModel.loginStatus === 'loggedOnline') ||
        (previousControlStates.includes('LOGGED_ONLINE') &&
          model.appModel.isSynchronised &&
          model.appModel.loginStatus === 'loggedOnline') ||
        (previousControlStates.includes('RUNNING_OFFLINE' as any) &&
          model.appModel.isSynchronised &&
          model.appModel.loginStatus === 'loggedOnline')
    )
    .setControlStatePredicate(
      'RUNNING_OFFLINE',
      ({ model, previousControlStates }) =>
        (previousControlStates.includes('LOGGED_OUT') &&
          !!model.userModel._id &&
          model.appModel.loginStatus === 'loggedOnline') ||
        (previousControlStates.includes('LOGGED_OFFLINE') &&
          !!model.userModel._id.length) ||
        (previousControlStates.includes('RUNNING_ONLINE') &&
          model.appModel.loginStatus !== 'loggedOut' &&
          !model.appModel.isSynchronised)
    )
    .addAcceptor('setConnected', model => ({
      mutator({ connected: isConnected }: { connected: boolean }) {
        model.appModel.connexionStatus.connected = isConnected
      },
    }))
    .addAcceptor('setLoginStatus', model => ({
      mutator({
        loginStatus,
      }: {
        loginStatus: typeof model.appModel.loginStatus
      }) {
        model.appModel.loginStatus = loginStatus
      },
    }))
    .addAcceptor('setSynchronised', model => ({
      mutator({ isSynchronised }: { isSynchronised: boolean }) {
        model.appModel.isSynchronised = isSynchronised
      },
    }))
    .addAcceptor('setServiceStatus', model => ({
      mutator({
        serviceStatus,
      }: {
        serviceStatus: typeof model.appModel.servicesStatus
      }) {
        model.appModel.servicesStatus = serviceStatus
      },
    }))
    .addAcceptor('setUserId', model => ({
      mutator({ id }: { id: string }) {
        model.userModel._id = id
      },
    }))
    .addActions({
      setConnected: 'setConnected',
      setLoginStatus: 'setLoginStatus',
      setSynchronised: 'setSynchronised',
      setServiceStatus: 'setServiceStatus',
      setUserId: 'setUserId',
    })

  const app = App.create({
    userModel: {
      _id: '',
    },
    appModel: {
      servicesStatus: [],
      loginStatus: 'loggedOut',
      connexionStatus: {
        connected: false,
      },
      isSynchronised: false,
    },
  })

  const { actions } = app

  actions.setConnected({ connected: true })
  expect(app.state.controlStates.sort()).toEqual(['OFF'].sort())

  actions.setServiceStatus({
    serviceStatus: [
      {
        serviceId: 'dataService',
        isRunning: true,
      },
      {
        serviceId: 'accountService',
        isRunning: true,
      },
      {
        serviceId: 'gameMasterService',
        isRunning: true,
      },
      {
        serviceId: 'geoLocationService',
        isRunning: false,
      },
      {
        serviceId: 'achievementService',
        isRunning: true,
      },
      {
        serviceId: 'networkService',
        isRunning: true,
      },
      {
        serviceId: 'questService',
        isRunning: true,
      },
      {
        serviceId: 'chatService',
        isRunning: true,
      },
    ],
  })
  expect(app.state.controlStates).toEqual(['OFF'])

  actions.setServiceStatus({
    serviceStatus: [
      {
        serviceId: 'dataService',
        isRunning: true,
      },
      {
        serviceId: 'accountService',
        isRunning: true,
      },
      {
        serviceId: 'gameMasterService',
        isRunning: true,
      },
      {
        serviceId: 'geoLocationService',
        isRunning: true,
      },
      {
        serviceId: 'achievementService',
        isRunning: true,
      },
      {
        serviceId: 'networkService',
        isRunning: true,
      },
      {
        serviceId: 'questService',
        isRunning: true,
      },
      {
        serviceId: 'chatService',
        isRunning: true,
      },
    ],
  })
  expect(app.state.controlStates).toEqual(['ON'])

  actions.setLoginStatus({ loginStatus: 'loggedOnline' })
  expect(app.state.controlStates).toEqual(['LOGGED_ONLINE'])

  actions.setSynchronised({ isSynchronised: true })
  expect(app.state.controlStates).toEqual(['RUNNING_ONLINE'])

  // Disable data
  actions.setSynchronised({ isSynchronised: false })
  expect(app.state.controlStates).toEqual(['RUNNING_OFFLINE'])

  // Enable data
  actions.setSynchronised({ isSynchronised: true })
  expect(app.state.controlStates).toEqual(['RUNNING_ONLINE'])

  // Logout when data is enabled
  actions.setLoginStatus({ loginStatus: 'loggedOut' })
  expect(app.state.controlStates).toEqual(['LOGGED_OUT'])

  // Reconnect when data is enabled
  actions.setLoginStatus({ loginStatus: 'loggedOnline' })
  expect(app.state.controlStates).toEqual(['RUNNING_ONLINE'])

  // Logout when data is enabled
  app.compose(baseActions => [
    baseActions.setLoginStatus({ loginStatus: 'loggedOut' }),
    baseActions.setUserId({ id: '' }),
    baseActions.setSynchronised({ isSynchronised: false }),
  ])
  expect(app.state.controlStates).toEqual(['LOGGED_OUT'])

  // Disable data.
  actions.setConnected({ connected: false })
  expect(app.state.controlStates).toEqual(['LOGGED_OUT'])

  // Login when data is disabled
  actions.setLoginStatus({ loginStatus: 'loggedOffline' })
  expect(app.state.controlStates).toEqual(['LOGGED_OFFLINE'])

  // Restore data
  actions.setUserId({ id: 'foo' })
  expect(app.state.controlStates).toEqual(['RUNNING_OFFLINE'])

  // Enable data.
  actions.setConnected({ connected: true })
  expect(app.state.controlStates).toEqual(['RUNNING_OFFLINE'])

  // Relogin online
  actions.setLoginStatus({ loginStatus: 'loggedOnline' })
  expect(app.state.controlStates).toEqual(['LOGGED_ONLINE'])

  // Sync data
  actions.setSynchronised({ isSynchronised: true })
  expect(app.state.controlStates).toEqual(['RUNNING_ONLINE'])
})

test('Use case with declarative control state', function() {
  const Model = object({
    appModel: object({
      connexionStatus: object({
        connected: boolean(),
      }),
      servicesStatus: array(
        object({
          serviceId: string(),
          isRunning: boolean(),
        })
      ),
      isSynchronised: boolean(),
      loginStatus: enumeration('loggedOnline', 'loggedOffline', 'loggedOut'),
    }),
    userModel: object({
      _id: string(),
    }),
  })

  const App = component(Model)
    .setControlStatePredicate('OFF', areServicesDown)
    .setControlStatePredicate('SERVICES_READY', areServicesUp)
    .setControlStatePredicate('RESTORED', isRestored)
    .setControlStatePredicate('SYNCHRONISED', isSynchronised)
    .setControlStatePredicate('LOGIN_STATUS_ONLINE', isLoginStatusOnline)
    .setControlStatePredicate('LOGIN_STATUS_OFFLINE', isLoginStatusOffline)
    .setControlStatePredicate('LOGIN_STATUS_LOGGEDOUT', isLoginStatusLoggedOut)
    .setControlStatePredicate('ON', {
      and: [{ previous: 'OFF' }, 'SERVICES_READY'],
    })
    .setControlStatePredicate('LOGGED_OUT', {
      or: [
        { and: [{ previous: 'ON' }, 'LOGIN_STATUS_LOGGEDOUT'] },
        { and: [{ previous: 'LOGGED_OUT' }, 'LOGIN_STATUS_LOGGEDOUT'] },
        {
          and: [
            { previous: 'RUNNING_ONLINE' as any },
            'LOGIN_STATUS_LOGGEDOUT',
          ],
        },
        {
          and: [
            { previous: 'RUNNING_OFFLINE' as any },
            'LOGIN_STATUS_LOGGEDOUT',
          ],
        },
      ],
    })
    .setControlStatePredicate('LOGGED_ONLINE', {
      or: [
        { and: [{ previous: 'ON' }, 'LOGIN_STATUS_ONLINE'] },
        {
          and: [
            { previous: 'LOGGED_OUT' },
            { not: 'SYNCHRONISED' },
            'LOGIN_STATUS_ONLINE',
          ],
        },
        {
          and: [
            { previous: 'RUNNING_OFFLINE' as any },
            { not: 'SYNCHRONISED' },
            'LOGIN_STATUS_ONLINE',
          ],
        },
      ],
    })
    .setControlStatePredicate('LOGGED_OFFLINE', {
      or: [
        { and: [{ previous: 'ON' }, 'LOGIN_STATUS_OFFLINE'] },
        { and: [{ previous: 'LOGGED_ONLINE' }, 'LOGIN_STATUS_OFFLINE'] },
        { and: [{ previous: 'LOGGED_OUT' }, 'LOGIN_STATUS_OFFLINE'] },
      ],
    })
    .setControlStatePredicate('RUNNING_ONLINE', {
      or: [
        {
          and: [
            { previous: 'LOGGED_OUT' },
            'SYNCHRONISED',
            'LOGIN_STATUS_ONLINE',
          ],
        },
        {
          and: [
            { previous: 'LOGGED_ONLINE' },
            'SYNCHRONISED',
            'LOGIN_STATUS_ONLINE',
          ],
        },
        {
          and: [
            { previous: 'RUNNING_OFFLINE' as any },
            'SYNCHRONISED',
            'LOGIN_STATUS_ONLINE',
          ],
        },
      ],
    })
    .setControlStatePredicate('RUNNING_OFFLINE', {
      or: [
        {
          and: [{ previous: 'LOGGED_OUT' }, 'RESTORED', 'LOGIN_STATUS_ONLINE'],
        },
        { and: [{ previous: 'LOGGED_OFFLINE' as any }, 'RESTORED'] },
        {
          and: [
            { previous: 'RUNNING_ONLINE' },
            { not: 'LOGIN_STATUS_LOGGEDOUT' },
            { not: 'SYNCHRONISED' },
          ],
        },
        {
          and: [
            { previous: 'RUNNING_OFFLINE' as any },
            'LOGIN_STATUS_OFFLINE',
            'RESTORED',
          ],
        },
      ],
    })
    .addAcceptor('setConnected', model => ({
      mutator({ connected: isConnected }: { connected: boolean }) {
        model.appModel.connexionStatus.connected = isConnected
      },
    }))
    .addAcceptor('setLoginStatus', model => ({
      mutator({
        loginStatus,
      }: {
        loginStatus: typeof model.appModel.loginStatus
      }) {
        model.appModel.loginStatus = loginStatus
      },
    }))
    .addAcceptor('setSynchronised', model => ({
      mutator({ isSynchronised }: { isSynchronised: boolean }) {
        model.appModel.isSynchronised = isSynchronised
      },
    }))
    .addAcceptor('setServiceStatus', model => ({
      mutator({
        serviceStatus,
      }: {
        serviceStatus: typeof model.appModel.servicesStatus
      }) {
        model.appModel.servicesStatus = serviceStatus
      },
    }))
    .addAcceptor('setUserId', model => ({
      mutator({ id }: { id: string }) {
        model.userModel._id = id
      },
    }))
    .addActions({
      setConnected: 'setConnected',
      setLoginStatus: 'setLoginStatus',
      setSynchronised: 'setSynchronised',
      setServiceStatus: 'setServiceStatus',
      setUserId: 'setUserId',
    })

  const app = App.create({
    userModel: {
      _id: '',
    },
    appModel: {
      servicesStatus: [],
      loginStatus: 'loggedOut',
      connexionStatus: {
        connected: false,
      },
      isSynchronised: false,
    },
  })

  const { actions } = app

  actions.setConnected({ connected: true })
  expect(app.state.controlStates).toEqual(['OFF', 'LOGIN_STATUS_LOGGEDOUT'])

  actions.setServiceStatus({
    serviceStatus: [
      {
        serviceId: 'dataService',
        isRunning: true,
      },
      {
        serviceId: 'accountService',
        isRunning: true,
      },
      {
        serviceId: 'gameMasterService',
        isRunning: true,
      },
      {
        serviceId: 'geoLocationService',
        isRunning: false,
      },
      {
        serviceId: 'achievementService',
        isRunning: true,
      },
      {
        serviceId: 'networkService',
        isRunning: true,
      },
      {
        serviceId: 'questService',
        isRunning: true,
      },
      {
        serviceId: 'chatService',
        isRunning: true,
      },
    ],
  })
  expect(app.state.controlStates).toEqual(['OFF', 'LOGIN_STATUS_LOGGEDOUT'])

  actions.setServiceStatus({
    serviceStatus: [
      {
        serviceId: 'dataService',
        isRunning: true,
      },
      {
        serviceId: 'accountService',
        isRunning: true,
      },
      {
        serviceId: 'gameMasterService',
        isRunning: true,
      },
      {
        serviceId: 'geoLocationService',
        isRunning: true,
      },
      {
        serviceId: 'achievementService',
        isRunning: true,
      },
      {
        serviceId: 'networkService',
        isRunning: true,
      },
      {
        serviceId: 'questService',
        isRunning: true,
      },
      {
        serviceId: 'chatService',
        isRunning: true,
      },
    ],
  })
  expect(app.state.controlStates.sort()).toEqual(
    ['SERVICES_READY', 'LOGIN_STATUS_LOGGEDOUT', 'ON'].sort()
  )

  actions.setLoginStatus({ loginStatus: 'loggedOnline' })
  expect(app.state.controlStates.sort()).toEqual(
    ['SERVICES_READY', 'LOGIN_STATUS_ONLINE', 'LOGGED_ONLINE'].sort()
  )

  actions.setSynchronised({ isSynchronised: true })
  expect(app.state.controlStates.sort()).toEqual(
    [
      'SERVICES_READY',
      'SYNCHRONISED',
      'LOGIN_STATUS_ONLINE',
      'RUNNING_ONLINE',
    ].sort()
  )

  // Disable data
  actions.setSynchronised({ isSynchronised: false })
  expect(app.state.controlStates.sort()).toEqual(
    ['SERVICES_READY', 'LOGIN_STATUS_ONLINE', 'RUNNING_OFFLINE'].sort()
  )

  // Enable data
  actions.setSynchronised({ isSynchronised: true })
  expect(app.state.controlStates.sort()).toEqual(
    [
      'SERVICES_READY',
      'SYNCHRONISED',
      'LOGIN_STATUS_ONLINE',
      'RUNNING_ONLINE',
    ].sort()
  )

  // Logout when data is enabled
  app.compose(actions => [
    actions.setLoginStatus({ loginStatus: 'loggedOut' }),
    actions.setSynchronised({ isSynchronised: false }),
  ])
  expect(app.state.controlStates.sort()).toEqual(
    ['SERVICES_READY', 'LOGIN_STATUS_LOGGEDOUT', 'LOGGED_OUT'].sort()
  )

  // Reconnect when data is enabled
  app.compose(actions => [
    actions.setLoginStatus({ loginStatus: 'loggedOnline' }),
    actions.setSynchronised({ isSynchronised: true }),
  ])
  expect(app.state.controlStates.sort()).toEqual(
    [
      'SERVICES_READY',
      'SYNCHRONISED',
      'LOGIN_STATUS_ONLINE',
      'RUNNING_ONLINE',
    ].sort()
  )

  // Logout when data is enabled
  app.compose(actions => [
    actions.setLoginStatus({ loginStatus: 'loggedOut' }),
    actions.setUserId({ id: '' }),
    actions.setSynchronised({ isSynchronised: false }),
  ])
  expect(app.state.controlStates.sort()).toEqual(
    ['SERVICES_READY', 'LOGIN_STATUS_LOGGEDOUT', 'LOGGED_OUT'].sort()
  )

  // Disable data.
  actions.setConnected({ connected: false })
  expect(app.state.controlStates.sort()).toEqual(
    ['SERVICES_READY', 'LOGIN_STATUS_LOGGEDOUT', 'LOGGED_OUT'].sort()
  )

  // Login when data is disabled
  actions.setLoginStatus({ loginStatus: 'loggedOffline' })
  expect(app.state.controlStates.sort()).toEqual(
    ['SERVICES_READY', 'LOGIN_STATUS_OFFLINE', 'LOGGED_OFFLINE'].sort()
  )

  // Restore data
  actions.setUserId({ id: 'foo' })
  expect(app.state.controlStates.sort()).toEqual(
    [
      'SERVICES_READY',
      'RESTORED',
      'LOGIN_STATUS_OFFLINE',
      'RUNNING_OFFLINE',
    ].sort()
  )

  // Enable data.
  actions.setConnected({ connected: true })
  expect(app.state.controlStates.sort()).toEqual(
    [
      'SERVICES_READY',
      'RESTORED',
      'LOGIN_STATUS_OFFLINE',
      'RUNNING_OFFLINE',
    ].sort()
  )

  // Relogin online
  actions.setLoginStatus({ loginStatus: 'loggedOnline' })
  expect(app.state.controlStates.sort()).toEqual(
    [
      'SERVICES_READY',
      'RESTORED',
      'LOGIN_STATUS_ONLINE',
      'LOGGED_ONLINE',
    ].sort()
  )

  // Sync data
  actions.setSynchronised({ isSynchronised: true })
  expect(app.state.controlStates.sort()).toEqual(
    [
      'SERVICES_READY',
      'RESTORED',
      'SYNCHRONISED',
      'LOGIN_STATUS_ONLINE',
      'RUNNING_ONLINE',
    ].sort()
  )

  function areServicesUp({ model }: { model: typeof Model['Type'] }) {
    return [
      'dataService',
      'accountService',
      'gameMasterService',
      'geoLocationService',
      'achievementService',
      'networkService',
      'questService',
      'chatService',
    ].every(id =>
      model.appModel.servicesStatus.some(s => s.serviceId === id && s.isRunning)
    )
  }

  function areServicesDown({ model }: { model: typeof Model['Type'] }) {
    return !areServicesUp({ model })
  }

  function isLoginStatusOffline({ model }: { model: typeof Model['Type'] }) {
    return model.appModel.loginStatus === 'loggedOffline'
  }

  function isLoginStatusOnline({ model }: { model: typeof Model['Type'] }) {
    return model.appModel.loginStatus === 'loggedOnline'
  }

  function isLoginStatusLoggedOut({ model }: { model: typeof Model['Type'] }) {
    return model.appModel.loginStatus === 'loggedOut'
  }

  function isRestored({ model }: { model: typeof Model['Type'] }) {
    return !!model.userModel._id
  }

  function isSynchronised({ model }: { model: typeof Model['Type'] }) {
    return model.appModel.isSynchronised
  }
})
