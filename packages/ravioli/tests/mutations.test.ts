test.todo(
  ''
) /* import { isLeafMutation, MutatorParams } from "../src/api/Mutations";
import { MutationType } from "./mutation";
import { DEPRECATED_object } from "crafter/src/Object";
import { array } from "crafter/src/Array";
import { model } from "../src/api/model";

test("Detect a leaf mutation", function() {
  const mutation = {
    type: MutationType.deccreaseHP,
    payload: 2
  };
  expect(isLeafMutation(mutation)).toBeTruthy();
});

test("Mutations are not permitted outside a presentation.", function() {
  const rootNode = model(
    DEPRECATED_object({
      inventory: array([
        DEPRECATED_object({
          id: "sword",
          quantity: 1
        })
      ])
    })
  ).data;

  rootNode.inventory[0].quantity = 2;

  expect(rootNode.inventory[0].quantity).toBe(1);
});

test("Mutations are permitted during a presentation.", function() {
  const Model = model(
    DEPRECATED_object({
      inventory: array([
        DEPRECATED_object({
          id: "sword",
          quantity: 1
        })
      ])
    })
  )
    .addMutators(model => ({
      removeItem({ model: data, payload: { itemId } }) {
        data.inventory.find(({ id }) => itemId === id)!.quantity--;
      }
    }))
    .addActions({
      dropItem: {
        action: function(itemId: string) {
          return [
            {
              type: "removeItem",
              payload: { itemId }
            }
          ];
        }
      }
    });

  Model.actions.dropItem("sword");

  expect(Model.data.inventory[0].$patch.forward.length).toBe(0);
});
 */
