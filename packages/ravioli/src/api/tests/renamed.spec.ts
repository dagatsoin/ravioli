// The names of 1.9 and the names they replace. A program written with the old
// ones keeps working: each old name is the new one, or does what it does.
import {
  ActionDeclaration,
  ActionDeclarations,
  ActionOptions,
  ContainerFactory,
  ControlStatePredicate,
  IContainerFactory,
  ReasonCode,
  RejectionCode,
  createContainer,
} from "../..";
import { ActionPackage, ConfigurableAction, PackagedActions } from "../../lib/api/action";
import { CSPredicate } from "../../lib/api/predicate";
import { asDiscarded, settle } from "./helpers";

// Each old type is the new one: a value of one is a value of the other.
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
function same<A, B>(proof: Same<A, B>) {
  return proof;
}

type Mutations = { type: "setHP"; payload: number };

beforeEach(function () {
  jest.spyOn(console, "warn").mockImplementation(() => {});
  jest.spyOn(console, "info").mockImplementation(() => {});
});

afterEach(function () {
  jest.restoreAllMocks();
});

describe("ReasonCode, was RejectionCode", function () {
  test("RejectionCode is ReasonCode", function () {
    expect(RejectionCode).toBe(ReasonCode);
  });

  test("a reason is given one of its codes", function () {
    const container = createContainer<{ hp: number }>()
      .addAcceptor("setHP", { mutator: (data, hp: number) => { data.hp = hp; } })
      .addActions({
        setHP: { action: (hp: number) => [{ type: "setHP", payload: hp }], isAllowed: () => false },
      })
      .create({ hp: 1 });
    container.actions.setHP(2);
    expect(asDiscarded(container.lastAttempt).reason.code).toBe(ReasonCode.unauthorized);
  });
});

describe("the types renamed", function () {
  test("ControlStatePredicate, was CSPredicate", function () {
    expect(
      same<ControlStatePredicate<{ hp: number }, Mutations, "ALIVE">, CSPredicate<{ hp: number }, Mutations, "ALIVE">>(true)
    ).toBe(true);
  });

  test("ActionDeclarations, ActionDeclaration and ActionOptions, were PackagedActions, ActionPackage and ConfigurableAction", function () {
    expect(same<ActionDeclarations<"ALIVE", Mutations>, PackagedActions<"ALIVE", Mutations>>(true)).toBe(true);
    expect(
      same<ActionDeclaration<{ controlStates: "ALIVE"[] }, Mutations>, ActionPackage<{ controlStates: "ALIVE"[] }, Mutations>>(true)
    ).toBe(true);
    expect(
      same<ActionOptions<{ controlStates: "ALIVE"[] }, Mutations>, ConfigurableAction<{ controlStates: "ALIVE"[] }, Mutations>>(true)
    ).toBe(true);
  });

  test("actions declared with the new types are those addActions takes", function () {
    const options: ActionOptions<{ controlStates: "ALIVE"[] }, Mutations> = {
      action: (hp: number) => [{ type: "setHP", payload: hp }],
      isAllowed: ({ controlStates }) => controlStates.includes("ALIVE"),
    };
    const isAlive: ControlStatePredicate<{ hp: number }, Mutations, "ALIVE"> = ({ data }) => data.hp > 0;
    const container = createContainer<{ hp: number }>()
      .addAcceptor("setHP", { mutator: (data, hp: number) => { data.hp = hp; } })
      .addControlStatePredicate("ALIVE", isAlive)
      .addActions({ setHP: options, hurt: "setHP" })
      .create({ hp: 1 });
    container.actions.setHP(0);
    expect(container.controlStates.slice()).toEqual([]);
    container.actions.setHP(5);
    expect(asDiscarded(container.lastAttempt).reason.code).toBe(ReasonCode.unauthorized);
  });
});

describe("the factory", function () {
  test("ContainerFactory, was IContainerFactory", function () {
    expect(
      same<ContainerFactory<{ hp: number }, Mutations, "ALIVE">, IContainerFactory<{ hp: number }, Mutations, "ALIVE">>(true)
    ).toBe(true);
    const factory: IContainerFactory<{ hp: number }> = createContainer<{ hp: number }>();
    expect(factory).toBeDefined();
  });

  function hero() {
    return createContainer<{ hp: number }>()
      .addAcceptor("setHP", { mutator: (data, hp: number) => { data.hp = hp; } })
      .addActions({ setHP: "setHP" });
  }

  test("addControlState, was addControlStatePredicate", function () {
    // Before addActions: a control state added after it loses the type of the
    // actions, as addControlStatePredicate always did.
    const container = createContainer<{ hp: number }>()
      .addAcceptor("setHP", { mutator: (data, hp: number) => { data.hp = hp; } })
      .addControlState("ALIVE", ({ data }) => data.hp > 0)
      .addControlStatePredicate("DEAD", ({ data }) => data.hp <= 0)
      .addActions({ setHP: "setHP" })
      .create({ hp: 1 });
    expect(container.controlStates.slice()).toEqual(["ALIVE"]);
    container.actions.setHP(0);
    expect(container.controlStates.slice()).toEqual(["DEAD"]);
  });

  test("addControlState and addControlStatePredicate declare in the same place", function () {
    expect(() =>
      hero()
        .addControlState("ALIVE", ({ data }) => data.hp > 0)
        .addControlStatePredicate("ALIVE", ({ data }) => data.hp > 0)
    ).toThrow("This component has already a control state called ALIVE");
  });

  test("setRepresentation, was addTransformation", function () {
    const renamed = hero().setRepresentation(({ data }) => ({ health: data.hp })).create({ hp: 3 });
    const old = hero().addTransformation(({ data }) => ({ health: data.hp })).create({ hp: 3 });
    renamed.actions.setHP(4);
    old.actions.setHP(4);
    expect(renamed.representationRef.current).toEqual({ health: 4 });
    expect(old.representationRef.current).toEqual({ health: 4 });
  });

  test("setStaticRepresentation, was addStaticTransformation", function () {
    const renamed = hero()
      .setStaticRepresentation(({ data, actions }) => ({ health: () => data.hp, setHP: actions.setHP }))
      .create({ hp: 3 });
    const old = hero()
      .addStaticTransformation(({ data, actions }) => ({ health: () => data.hp, setHP: actions.setHP }))
      .create({ hp: 3 });
    renamed.representationRef.current.setHP(4);
    old.representationRef.current.setHP(4);
    expect(renamed.representationRef.current.health()).toBe(4);
    expect(old.representationRef.current.health()).toBe(4);
  });
});

describe("awaited, was awaitAsync", function () {
  // A counter whose step reaction writes somewhere, and is done when the test says.
  function counter(options: { awaited?: boolean; awaitAsync?: boolean }) {
    const writes: Array<() => void> = [];
    const container = createContainer<{ n: number }>()
      .addAcceptor("inc", { mutator: (data) => { data.n++; } })
      .addActions({ inc: "inc" })
      .addStepReaction({
        runOnInit: false,
        do: () => new Promise<void>((done) => { writes.push(done); }),
        ...options,
      })
      .create({ n: 0 });
    return { container, writes };
  }

  test.each([
    ["awaited", { awaited: true }, true],
    ["awaitAsync", { awaitAsync: true }, true],
    ["awaited false over awaitAsync true", { awaited: false, awaitAsync: true }, false],
    ["awaited true over awaitAsync false", { awaited: true, awaitAsync: false }, true],
  ])("%s", async function (_, options, waits) {
    const { container, writes } = counter(options);
    container.actions.inc();
    container.actions.inc();
    // An awaited reaction keeps the next step waiting until it is done.
    expect(container.stepId).toBe(waits ? 1 : 2);
    writes.forEach((done) => done());
    await settle();
    writes.forEach((done) => done());
    await settle();
    expect(container.stepId).toBe(2);
  });
});
