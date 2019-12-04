 import { component } from "../src";
import { string, object, number, array } from "../src/vendor/crafter";

const Location = component(
  object({
    type: string(),
    coordinates: array(number())
  })
)
  .addAcceptors(model => ({
    setCoordinates: {
      mutator: function(coordinates: typeof model["coordinates"]) {
        model.coordinates.replace(coordinates);
      }
    }
  }))
  .addActions({
    move: "setCoordinates"
  })
  .addRepresentation(model => [...model.coordinates]);

const Inventory = component(
  array(
    object({
      itemId: string(),
      quantity: number()
    })
  )
)
  .addAcceptors(model => ({
    upsert: {
      mutator: function(item: { itemId: string; quantity: number }) {
        const slot = model.find(slot => slot.itemId === item.itemId);
        if (slot) {
          slot.quantity += item.quantity;
        } else {
          model.push(item);
        }
      }
    },
    remove: {
      mutator: function(itemId) {
        const slot = model.find(slot => slot.itemId === itemId);
        if (slot) {
          slot.quantity--;
        }
      }
    }
  }))
  .addActions({
    add: "upsert",
    remove: "remove",
    addMultiple: {
      action: function(items: Array<{ itemId: string; quantity: number }>) {
        return items.map(item => ({
          type: "upsert",
          payload: { ...item }
        }));
      }
    }
  })
  .addRepresentation(model => [...model]);

const Player = component(
  object({
    name: string(),
    stats: object({
      force: number(),
      health: number()
    }),
    inventory: Inventory,
    location: Location
  })
).addRepresentation(model => ({
  ...model
}));

const Fraktar = Player.create({
  name: "Fraktar",
  stats: {
    force: 10,
    health: 10
  },
  inventory: [{ itemId: "sword", quantity: 1 }],
  location: {
    type: "Point",
    coordinates: [2, 47]
  }
});

const uiStore = Fraktar.representation;

type Props = {
  uiStore: typeof Player["representation"];
};
/*
const component = inject("uiStore")(
  observe(function(props: Props) {
    const name = document.createElement("div");
    name.appendChild(props.uiStore.name);
    return name;
  })
);
 */