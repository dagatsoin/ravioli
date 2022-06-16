import { createContainer } from "../..";

interface Model {
  appModel: {
    connexionStatus: {
      connected: boolean;
    };
    servicesStatus: Array<{
      serviceId: string;
      isRunning: boolean;
    }>;
    isSynchronised: boolean;
    loginStatus: "loggedOnline" | "loggedOffline" | "loggedOut";
  };
  userModel: {
    _id: string;
  };
}

test("Use case with a control state tree", function () {
  const app = createContainer<Model>(/* { keepLastControlStateIfUndefined: true } */)
    .addControlStatePredicate("OFF", ({ model }) =>
      [
        "dataService",
        "accountService",
        "gameMasterService",
        "geoLocationService",
        "achievementService",
        "networkService",
        "questService",
        "chatService",
      ].some(
        (id) =>
          model.appModel.servicesStatus.every((s) => s.serviceId !== id) ||
          model.appModel.servicesStatus.some(
            (s) => s.serviceId === id && !s.isRunning
          )
      )
    )
    .addControlStatePredicate(
      "ON",
      ({ model }) => [
        "dataService",
        "accountService",
        "gameMasterService",
        "geoLocationService",
        "achievementService",
        "networkService",
        "questService",
        "chatService",
      ].every((id) =>
        model.appModel.servicesStatus.some(
          (s) => s.serviceId === id && s.isRunning
        )
      )
    )
    .addControlStatePredicate(
      "LOGGED_OUT",
      ({ model }) => model.appModel.loginStatus === "loggedOut"
    )
    .addControlStatePredicate(
      "LOGGED_ONLINE",
      ({ model }) => model.appModel.loginStatus === "loggedOnline"
    )
    .addControlStatePredicate(
      "LOGGED_OFFLINE",
      ({ model }) => model.appModel.loginStatus === "loggedOffline"
    )
    .addControlStatePredicate(
      "RUNNING_ONLINE",
      ({ model, previousControlStates }) =>
        (previousControlStates.includes("LOGGED_OUT") &&
          model.appModel.isSynchronised &&
          model.appModel.loginStatus === "loggedOnline") ||
        (previousControlStates.includes("LOGGED_ONLINE") &&
          model.appModel.isSynchronised &&
          model.appModel.loginStatus === "loggedOnline") ||
        (previousControlStates.includes("RUNNING_OFFLINE" as any) &&
          model.appModel.isSynchronised &&
          model.appModel.loginStatus === "loggedOnline") ||
        (previousControlStates.includes("RUNNING_ONLINE") &&
          model.appModel.isSynchronised &&
          model.appModel.loginStatus === "loggedOnline")
    )
    .addControlStatePredicate(
      "RUNNING_OFFLINE",
      ({ model, previousControlStates }) =>
        (previousControlStates.includes("LOGGED_OUT") &&
          !!model.userModel._id &&
          model.appModel.loginStatus === "loggedOffline") ||
        (previousControlStates.includes("LOGGED_OFFLINE") &&
          !!model.userModel._id.length) ||
        (previousControlStates.includes("RUNNING_ONLINE") &&
          model.appModel.loginStatus !== "loggedOut" &&
          !model.appModel.isSynchronised) ||
        (previousControlStates.includes("RUNNING_OFFLINE") &&
          ((!!model.userModel._id &&
            model.appModel.loginStatus === "loggedOffline") ||
            (model.appModel.loginStatus !== "loggedOut" &&
              !model.appModel.isSynchronised)))
    )
    .addAcceptor("setConnected", (model) => ({
      mutator({ connected: isConnected }: { connected: boolean }) {
        model.appModel.connexionStatus.connected = isConnected;
      },
    }))
    .addAcceptor("setLoginStatus", (model) => ({
      mutator({
        loginStatus,
      }: {
        loginStatus: typeof model.appModel.loginStatus;
      }) {
        model.appModel.loginStatus = loginStatus;
      },
    }))
    .addAcceptor("setSynchronised", (model) => ({
      mutator({ isSynchronised }: { isSynchronised: boolean }) {
        model.appModel.isSynchronised = isSynchronised;
      },
    }))
    .addAcceptor("setServiceStatus", (model) => ({
      mutator({
        serviceStatus,
      }: {
        serviceStatus: typeof model.appModel.servicesStatus;
      }) {
        model.appModel.servicesStatus = serviceStatus;
      },
    }))
    .addAcceptor("setUserId", (model) => ({
      mutator({ id }: { id: string }) {
        model.userModel._id = id;
      },
    }))
    .addActions({
      setConnected: "setConnected",
      setLoginStatus: "setLoginStatus",
      setSynchronised: "setSynchronised",
      setServiceStatus: "setServiceStatus",
      setUserId: "setUserId",
    })
    .create({
      userModel: {
        _id: "",
      },
      appModel: {
        servicesStatus: [],
        loginStatus: "loggedOut",
        connexionStatus: {
          connected: false,
        },
        isSynchronised: false,
      },
    });

  const { actions } = app;

  actions.setConnected({ connected: true });
  expect(app.controlStates.sort()).toEqual(["LOGGED_OUT", "OFF"].sort());

  actions.setServiceStatus({
    serviceStatus: [
      {
        serviceId: "dataService",
        isRunning: true,
      },
      {
        serviceId: "accountService",
        isRunning: true,
      },
      {
        serviceId: "gameMasterService",
        isRunning: true,
      },
      {
        serviceId: "geoLocationService",
        isRunning: false,
      },
      {
        serviceId: "achievementService",
        isRunning: true,
      },
      {
        serviceId: "networkService",
        isRunning: true,
      },
      {
        serviceId: "questService",
        isRunning: true,
      },
      {
        serviceId: "chatService",
        isRunning: true,
      },
    ],
  });
  expect(app.controlStates.sort()).toEqual(["LOGGED_OUT", "OFF"].sort());

  actions.setServiceStatus({
    serviceStatus: [
      {
        serviceId: "dataService",
        isRunning: true,
      },
      {
        serviceId: "accountService",
        isRunning: true,
      },
      {
        serviceId: "gameMasterService",
        isRunning: true,
      },
      {
        serviceId: "geoLocationService",
        isRunning: true,
      },
      {
        serviceId: "achievementService",
        isRunning: true,
      },
      {
        serviceId: "networkService",
        isRunning: true,
      },
      {
        serviceId: "questService",
        isRunning: true,
      },
      {
        serviceId: "chatService",
        isRunning: true,
      },
    ],
  });
  expect(app.controlStates.sort()).toEqual(["LOGGED_OUT", "ON"].sort());

  actions.setLoginStatus({ loginStatus: "loggedOnline" });
  expect(app.controlStates.sort()).toEqual(["LOGGED_ONLINE", "ON"]);

  actions.setSynchronised({ isSynchronised: true });
  expect(app.controlStates.sort()).toEqual(["LOGGED_ONLINE", "ON", "RUNNING_ONLINE"]);

  // Disable data
  actions.setSynchronised({ isSynchronised: false });
  expect(app.controlStates.sort()).toEqual(["LOGGED_ONLINE", "ON", "RUNNING_OFFLINE"]);

  // Enable data
  actions.setSynchronised({ isSynchronised: true });
  expect(app.controlStates.sort()).toEqual(["LOGGED_ONLINE", "ON", "RUNNING_ONLINE"]);

  // Logout when data is enabled
  actions.setLoginStatus({ loginStatus: "loggedOut" });
  expect(app.controlStates.sort()).toEqual(["LOGGED_OUT", "ON",]);

  // Reconnect when data is enabled
  actions.setLoginStatus({ loginStatus: "loggedOnline" });
  expect(app.controlStates.sort()).toEqual(["LOGGED_ONLINE", "ON", "RUNNING_ONLINE"]);

  // Logout when data is enabled
  app.compose((baseActions) => [
    baseActions.setLoginStatus({ loginStatus: "loggedOut" }),
    baseActions.setUserId({ id: "" }),
    baseActions.setSynchronised({ isSynchronised: false }),
  ]);
  expect(app.controlStates.sort()).toEqual(["LOGGED_OUT", "ON"]);

  // Login offline
  actions.setConnected({ connected: false });
  actions.setLoginStatus({ loginStatus: "loggedOffline" });
  expect(app.controlStates.sort()).toEqual(["LOGGED_OFFLINE", "ON"]);

  // Restore data
  actions.setUserId({ id: "foo" });
  expect(app.controlStates.sort()).toEqual(["LOGGED_OFFLINE", "ON", "RUNNING_OFFLINE"]);

  // Enable data.
  actions.setConnected({ connected: true });
  expect(app.controlStates.sort()).toEqual(["LOGGED_OFFLINE", "ON", "RUNNING_OFFLINE"]);

  // Relogin online
  actions.setLoginStatus({ loginStatus: "loggedOnline" });
  expect(app.controlStates.sort()).toEqual(["LOGGED_ONLINE", "ON", "RUNNING_OFFLINE"]);

  // Sync data
  actions.setSynchronised({ isSynchronised: true });
  expect(app.controlStates.sort()).toEqual(["LOGGED_ONLINE", "ON", "RUNNING_ONLINE"]);
});

test("Use case with declarative control state", function () {
  const app = createContainer<Model>()
    .addControlStatePredicate("OFF", areServicesDown)
    .addControlStatePredicate("ON", areServicesUp)
    .addControlStatePredicate("RESTORED", isRestored)
    .addControlStatePredicate("SYNCHRONISED", isSynchronised)
    .addControlStatePredicate("LOGGED_ONLINE", isLoginStatusOnline)
    .addControlStatePredicate("LOGGED_OFFLINE", isLoginStatusOffline)
    .addControlStatePredicate("LOGGED_OUT", isLoginStatusLoggedOut)
    .addControlStatePredicate("RUNNING_ONLINE", {
      or: [
        {
          and: [
            { previous: "LOGGED_OUT" },
            "SYNCHRONISED",
            "LOGGED_ONLINE",
          ],
        },
        {
          and: [
            { previous: "LOGGED_ONLINE" },
            "SYNCHRONISED",
            "LOGGED_ONLINE",
          ],
        },
        {
          and: [
            { previous: "RUNNING_OFFLINE" as any },
            "SYNCHRONISED",
            "LOGGED_ONLINE",
          ],
        },
      ],
    })
    .addControlStatePredicate("RUNNING_OFFLINE", {
      or: [
        { and: [{ previous: "LOGGED_OFFLINE" as any }, "RESTORED"] },
        {
          and: [
            { previous: "RUNNING_ONLINE" },
            { not: "LOGGED_OUT" },
            { not: "SYNCHRONISED" },
          ],
        },
        {
          and: [
            { previous: "RUNNING_OFFLINE" as any },
            "LOGGED_OFFLINE",
            "RESTORED",
          ],
        },
      ],
    })
    .addAcceptor("setConnected", (model) => ({
      mutator({ connected: isConnected }: { connected: boolean }) {
        model.appModel.connexionStatus.connected = isConnected;
      },
    }))
    .addAcceptor("setLoginStatus", (model) => ({
      mutator({
        loginStatus,
      }: {
        loginStatus: typeof model.appModel.loginStatus;
      }) {
        model.appModel.loginStatus = loginStatus;
      },
    }))
    .addAcceptor("setSynchronised", (model) => ({
      mutator({ isSynchronised }: { isSynchronised: boolean }) {
        model.appModel.isSynchronised = isSynchronised;
      },
    }))
    .addAcceptor("setServiceStatus", (model) => ({
      mutator({
        serviceStatus,
      }: {
        serviceStatus: typeof model.appModel.servicesStatus;
      }) {
        model.appModel.servicesStatus = serviceStatus;
      },
    }))
    .addAcceptor("setUserId", (model) => ({
      mutator({ id }: { id: string }) {
        model.userModel._id = id;
      },
    }))
    .addActions({
      setConnected: "setConnected",
      setLoginStatus: "setLoginStatus",
      setSynchronised: "setSynchronised",
      setServiceStatus: "setServiceStatus",
      setUserId: "setUserId",
    })
    .create({
      userModel: {
        _id: "",
      },
      appModel: {
        servicesStatus: [],
        loginStatus: "loggedOut",
        connexionStatus: {
          connected: false,
        },
        isSynchronised: false,
      },
    });

  const { actions } = app;

  actions.setConnected({ connected: true });
  expect(app.controlStates.sort()).toEqual(["LOGGED_OUT", "OFF"]);

  actions.setServiceStatus({
    serviceStatus: [
      {
        serviceId: "dataService",
        isRunning: true,
      },
      {
        serviceId: "accountService",
        isRunning: true,
      },
      {
        serviceId: "gameMasterService",
        isRunning: true,
      },
      {
        serviceId: "geoLocationService",
        isRunning: false,
      },
      {
        serviceId: "achievementService",
        isRunning: true,
      },
      {
        serviceId: "networkService",
        isRunning: true,
      },
      {
        serviceId: "questService",
        isRunning: true,
      },
      {
        serviceId: "chatService",
        isRunning: true,
      },
    ],
  });
  expect(app.controlStates.sort()).toEqual(["LOGGED_OUT", "OFF"]);

  actions.setServiceStatus({
    serviceStatus: [
      {
        serviceId: "dataService",
        isRunning: true,
      },
      {
        serviceId: "accountService",
        isRunning: true,
      },
      {
        serviceId: "gameMasterService",
        isRunning: true,
      },
      {
        serviceId: "geoLocationService",
        isRunning: true,
      },
      {
        serviceId: "achievementService",
        isRunning: true,
      },
      {
        serviceId: "networkService",
        isRunning: true,
      },
      {
        serviceId: "questService",
        isRunning: true,
      },
      {
        serviceId: "chatService",
        isRunning: true,
      },
    ],
  });

  expect(app.controlStates.sort()).toEqual(
    ["LOGGED_OUT", "ON"].sort()
  );

  actions.setLoginStatus({ loginStatus: "loggedOnline" });
  expect(app.controlStates.sort()).toEqual(
    ["LOGGED_ONLINE", "ON"].sort()
  );

  actions.setSynchronised({ isSynchronised: true });
  expect(app.controlStates.sort()).toEqual(
    ["SYNCHRONISED", "LOGGED_ONLINE", "ON"].sort()
  );

  // Disable data
  actions.setSynchronised({ isSynchronised: false });
  expect(app.controlStates.sort()).toEqual(
    ["LOGGED_ONLINE", "ON"].sort()
  );

  // Enable data
  actions.setSynchronised({ isSynchronised: true });
  expect(app.controlStates.sort()).toEqual(
    ["SYNCHRONISED", "ON", "LOGGED_ONLINE"].sort()
  );

  // Logout when data is enabled
  app.compose((actions) => [
    actions.setLoginStatus({ loginStatus: "loggedOut" }),
    actions.setSynchronised({ isSynchronised: false }),
  ]);
  expect(app.controlStates.sort()).toEqual(
    ["ON", "LOGGED_OUT"].sort()
  );

  // Reconnect when data is enabled
  app.compose((actions) => [
    actions.setLoginStatus({ loginStatus: "loggedOnline" }),
    actions.setSynchronised({ isSynchronised: true }),
  ]);
  expect(app.controlStates.sort()).toEqual(
    ["ON", "SYNCHRONISED", "LOGGED_ONLINE"].sort()
  );

  // Logout when data is enabled
  app.compose((actions) => [
    actions.setLoginStatus({ loginStatus: "loggedOut" }),
    actions.setUserId({ id: "" }),
    actions.setSynchronised({ isSynchronised: false }),
  ]);
  expect(app.controlStates.sort()).toEqual(
    ["ON", "LOGGED_OUT"].sort()
  );

  // Disable data.
  actions.setConnected({ connected: false });
  expect(app.controlStates.sort()).toEqual(
    ["ON", "LOGGED_OUT"].sort()
  );

  // Login when data is disabled
  actions.setLoginStatus({ loginStatus: "loggedOffline" });
  expect(app.controlStates.sort()).toEqual(
    ["ON", "LOGGED_OFFLINE"].sort()
  );

  // Restore data
  actions.setUserId({ id: "foo" });
  expect(app.controlStates.sort()).toEqual(
    ["ON", "RESTORED", "LOGGED_OFFLINE"].sort()
  );

  // Enable data.
  actions.setConnected({ connected: true });
  expect(app.controlStates.sort()).toEqual(
    ["ON", "RESTORED", "LOGGED_OFFLINE"].sort()
  );

  // Relogin online
  actions.setLoginStatus({ loginStatus: "loggedOnline" });
  expect(app.controlStates.sort()).toEqual(
    ["ON", "RESTORED", "LOGGED_ONLINE"].sort()
  );

  // Sync data
  actions.setSynchronised({ isSynchronised: true });
  expect(app.controlStates.sort()).toEqual(
    ["ON", "RESTORED", "SYNCHRONISED", "LOGGED_ONLINE"].sort()
  );

  function areServicesUp({ model }: { model: Model }) {
    return [
      "dataService",
      "accountService",
      "gameMasterService",
      "geoLocationService",
      "achievementService",
      "networkService",
      "questService",
      "chatService",
    ].every((id) =>
      model.appModel.servicesStatus.some(
        (s) => s.serviceId === id && s.isRunning
      )
    );
  }

  function areServicesDown({ model }: { model: Model }) {
    return !areServicesUp({ model });
  }

  function isLoginStatusOffline({ model }: { model: Model }) {
    return model.appModel.loginStatus === "loggedOffline";
  }

  function isLoginStatusOnline({ model }: { model: Model }) {
    return model.appModel.loginStatus === "loggedOnline";
  }

  function isLoginStatusLoggedOut({ model }: { model: Model }) {
    return model.appModel.loginStatus === "loggedOut";
  }

  function isRestored({ model }: { model: Model }) {
    return !!model.userModel._id;
  }

  function isSynchronised({ model }: { model: Model }) {
    return model.appModel.isSynchronised;
  }
});
