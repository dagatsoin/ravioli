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
    .addControlStatePredicate("OFF", ({ data }) =>
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
          data.appModel.servicesStatus.every((s) => s.serviceId !== id) ||
          data.appModel.servicesStatus.some(
            (s) => s.serviceId === id && !s.isRunning
          )
      )
    )
    .addControlStatePredicate(
      "ON",
      ({ data }) => [
        "dataService",
        "accountService",
        "gameMasterService",
        "geoLocationService",
        "achievementService",
        "networkService",
        "questService",
        "chatService",
      ].every((id) =>
        data.appModel.servicesStatus.some(
          (s) => s.serviceId === id && s.isRunning
        )
      )
    )
    .addControlStatePredicate(
      "LOGGED_OUT",
      ({ data }) => data.appModel.loginStatus === "loggedOut"
    )
    .addControlStatePredicate(
      "LOGGED_ONLINE",
      ({ data }) => data.appModel.loginStatus === "loggedOnline"
    )
    .addControlStatePredicate(
      "LOGGED_OFFLINE",
      ({ data }) => data.appModel.loginStatus === "loggedOffline"
    )
    .addControlStatePredicate(
      "RUNNING_ONLINE",
      ({ data, previousControlStates }) =>
        (previousControlStates.includes("LOGGED_OUT") &&
          data.appModel.isSynchronised &&
          data.appModel.loginStatus === "loggedOnline") ||
        (previousControlStates.includes("LOGGED_ONLINE") &&
          data.appModel.isSynchronised &&
          data.appModel.loginStatus === "loggedOnline") ||
        (previousControlStates.includes("RUNNING_OFFLINE" as any) &&
          data.appModel.isSynchronised &&
          data.appModel.loginStatus === "loggedOnline") ||
        (previousControlStates.includes("RUNNING_ONLINE") &&
          data.appModel.isSynchronised &&
          data.appModel.loginStatus === "loggedOnline")
    )
    .addControlStatePredicate(
      "RUNNING_OFFLINE",
      ({ data, previousControlStates }) =>
        (previousControlStates.includes("LOGGED_OUT") &&
          !!data.userModel._id &&
          data.appModel.loginStatus === "loggedOffline") ||
        (previousControlStates.includes("LOGGED_OFFLINE") &&
          !!data.userModel._id.length) ||
        (previousControlStates.includes("RUNNING_ONLINE") &&
          data.appModel.loginStatus !== "loggedOut" &&
          !data.appModel.isSynchronised) ||
        (previousControlStates.includes("RUNNING_OFFLINE") &&
          ((!!data.userModel._id &&
            data.appModel.loginStatus === "loggedOffline") ||
            (data.appModel.loginStatus !== "loggedOut" &&
              !data.appModel.isSynchronised)))
    )
    .addAcceptor("setConnected", {
      mutator(data, { connected: isConnected }: { connected: boolean }) {
        data.appModel.connexionStatus.connected = isConnected;
      },
    })
    .addAcceptor("setLoginStatus", {
      mutator(data, {
        loginStatus,
      }: {
        loginStatus: typeof data.appModel.loginStatus;
      }) {
        data.appModel.loginStatus = loginStatus;
      },
    })
    .addAcceptor("setSynchronised", {
      mutator(data, { isSynchronised }: { isSynchronised: boolean }) {
        data.appModel.isSynchronised = isSynchronised;
      },
    })
    .addAcceptor("setServiceStatus", {
      mutator(data, {
        serviceStatus,
      }: {
        serviceStatus: typeof data.appModel.servicesStatus;
      }) {
        data.appModel.servicesStatus = serviceStatus;
      },
    })
    .addAcceptor("setUserId", {
      mutator(data, { id }: { id: string }) {
        data.userModel._id = id;
      },
    })
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
    .addAcceptor("setConnected", {
      mutator(data, { connected: isConnected }: { connected: boolean }) {
        data.appModel.connexionStatus.connected = isConnected;
      },
    })
    .addAcceptor("setLoginStatus", {
      mutator(data, {
        loginStatus,
      }: {
        loginStatus: typeof data.appModel.loginStatus;
      }) {
        data.appModel.loginStatus = loginStatus;
      }
    })
    .addAcceptor("setSynchronised", {
      mutator(data, { isSynchronised }: { isSynchronised: boolean }) {
        data.appModel.isSynchronised = isSynchronised;
      },
    })
    .addAcceptor("setServiceStatus", {
      mutator(data, {
        serviceStatus,
      }: {
        serviceStatus: typeof data.appModel.servicesStatus;
      }) {
        data.appModel.servicesStatus = serviceStatus;
      },
    })
    .addAcceptor("setUserId", {
      mutator(data, { id }: { id: string }) {
        data.userModel._id = id;
      },
    })
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

  function areServicesUp({ data }: { data: Model }) {
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
      data.appModel.servicesStatus.some(
        (s) => s.serviceId === id && s.isRunning
      )
    );
  }

  function areServicesDown({ data }: { data: Model }) {
    return !areServicesUp({ data });
  }

  function isLoginStatusOffline({ data }: { data: Model }) {
    return data.appModel.loginStatus === "loggedOffline";
  }

  function isLoginStatusOnline({ data }: { data: Model }) {
    return data.appModel.loginStatus === "loggedOnline";
  }

  function isLoginStatusLoggedOut({ data }: { data: Model }) {
    return data.appModel.loginStatus === "loggedOut";
  }

  function isRestored({ data }: { data: Model }) {
    return !!data.userModel._id;
  }

  function isSynchronised({ data }: { data: Model }) {
    return data.appModel.isSynchronised;
  }
});
