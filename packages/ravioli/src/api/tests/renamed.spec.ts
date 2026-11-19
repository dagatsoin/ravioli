// The names of 1.9 and the names they replace. A program written with the old
// ones keeps working: each old name is the new one, or does what it does.
import { ReasonCode, RejectionCode, createContainer } from "../..";
import { asDiscarded } from "./helpers";

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
