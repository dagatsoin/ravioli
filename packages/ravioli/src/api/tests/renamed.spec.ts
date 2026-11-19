// The names of 1.9 and the names they replace. A program written with the old
// ones keeps working: each old name is the new one, or does what it does.
import {
  ActionDeclaration,
  ActionDeclarations,
  ActionOptions,
  ControlStatePredicate,
  ReasonCode,
  RejectionCode,
  createContainer,
} from "../..";
import { ActionPackage, ConfigurableAction, PackagedActions } from "../../lib/api/action";
import { CSPredicate } from "../../lib/api/predicate";
import { asDiscarded } from "./helpers";

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
