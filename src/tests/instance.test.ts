/* import { component } from "../src";
import { object, string } from "../src/vendor/crafter";

const User = component(object({ name: string() }))
  .addAcceptors(model => ({
    setName: {
      condition: () => true,
      mutator: function({ name }: { name: string }) {
        model.name = name;
      }
    }
  }))
  .addActions({
    rename: {
      isAllowed: () => true,
      action: ({ name }: { name: string }) => [
        {
          type: "setName",
          payload: { name }
        }
      ]
    }
  })
  .addRepresentation(({ model }) => ({ username: model.name }));

test("unpack the actions sent to the constructor", function() {
  const Fraktar = User.create({
    name: "Fraktar"
  });
  expect(Object.keys(Fraktar.actions)).toEqual(["rename"]);
});

test("reject a mutation which does not fulfill the condition");

test("accept a mutation which fulfills the condition");

test("generate a JSON operation after any mutations");

it("should reject a proposal when instance is locked");

it("should reject a proposal when instance is unlocked");

it("should refuse to trigger an not allowed action");

it("should accept to trigger an allowed action");

test("throw if a mutation try to replace model", function() {
  // prevent this
  // model = ...
});
 */
