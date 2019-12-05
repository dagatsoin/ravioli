test.todo(
  ''
) /* import { DEPRECATED_object } from "crafter/src/Object";
import { ReactiveTransformation, represent } from "../src/lib/Representation";
import * as Manager from "../src/lib/STManager";
import { array } from "crafter/src/Array";
import { INode } from "crafter/src/INode";
import { MutationType } from "../src/lib/Mutations";

type Player = {
  name: string;
  level: number;
  stats: {
    health: number;
  };
  inventory: Stack[];
};

type Stack = {
  itemId: string;
  quantity: number;
};

const player = DEPRECATED_object<Player>({
  name: "Fraktar",
  level: 100,
  stats: DEPRECATED_object({
    health: 2867
  }),
  inventory: array([
    DEPRECATED_object({
      itemId: "healthPotion",
      quantity: 3
    }),
    DEPRECATED_object({
      itemId: "sword",
      quantity: 1
    })
  ])
});

function representInventory(model: INode<any> & Player) {
  return {
    inventory: model.inventory.map(s => ({ ...s }))
  };
}

const inventory = represent(player, representInventory);

function representPlayer(model: INode<any> & Player) {
  return {
    profile: {
      name: model.name
    },
    stats: {
      level: model.level,
      health: model.stats.health
    },
    inventory
  };
}

function representInventorySize(model: INode<any> & Player) {
  return {
    size: model.inventory.length
  };
}

represent(player, representPlayer);

beforeEach(function() {
  Manager.clearObserver();
});

test("Array observability", function() {
  test("length", function() {
    expect(
      new ReactiveTransformation(player, representInventorySize).links.sort()
    ).toEqual(["/inventory", "/inventory/length"]);
  });
  test("map", function() {
    expect(
      new ReactiveTransformation(player, function(model: INode<any> & Player) {
        return {
          inventory: model.inventory.map(s => ({ ...s }))
        };
      }).links.sort()
    ).toEqual(
      [
        "/inventory",
        "/inventory/length",
        "/inventory/0/itemId",
        "/inventory/0/quantity",
        "/inventory/1/itemId",
        "/inventory/1/quantity"
      ].sort()
    );
  });
  test("forEach", function() {
    expect(
      new ReactiveTransformation(player, function(model: INode<any> & Player) {
        return {
          inventory: model.inventory.forEach(s => ({ ...s }))
        };
      }).links.sort()
    ).toEqual(
      [
        "/inventory",
        "/inventory/length",
        "/inventory/0/itemId",
        "/inventory/0/quantity",
        "/inventory/1/itemId",
        "/inventory/1/quantity"
      ].sort()
    );
  });
  test("filter", function() {
    const rep = new ReactiveTransformation(player, function(
      model: INode<any> & Player
    ) {
      return {
        inventory: model.inventory.filter(({ quantity }) => quantity > 1)
      };
    });
    const links = rep.links;

    expect(links.sort()).toEqual(
      [
        "/inventory",
        "/inventory/length",
        "/inventory/0/quantity",
        "/inventory/1/quantity"
      ].sort()
    );

    player._isLocked = false;
    player.inventory.push({
      quantity: 10,
      itemId: "disk"
    });

    expect(rep.representation.inventory.length).toEqual(3);
  });
  test("find", function() {
    expect(
      new ReactiveTransformation(player, function(model: INode<any> & Player) {
        return {
          inventory: model.inventory.find(({ quantity }) => quantity > 1)
        };
      }).links.sort()
    ).toEqual(
      ["/inventory", "/inventory/length", "/inventory/0/quantity"].sort()
    );
  });
  test("findIndex", function() {
    expect(
      new ReactiveTransformation(player, function(model: INode<any> & Player) {
        return {
          inventory: model.inventory.findIndex(({ quantity }) => quantity > 1)
        };
      }).links.sort()
    ).toEqual(
      ["/inventory", "/inventory/length", "/inventory/0/quantity"].sort()
    );
  });
  test("lastIndexOf", function() {
    expect(
      new ReactiveTransformation(
        DEPRECATED_object({ array: array(["a", "b", "c"]) }),
        function(model: INode<any> & { array: string[] }) {
          return {
            index: model.array.lastIndexOf("c")
          };
        }
      ).links.sort()
    ).toEqual(["/array", "/array/length"].sort());
  });
  test("indexOf", function() {
    expect(
      new ReactiveTransformation(
        DEPRECATED_object({ array: array(["a", "b", "c"]) }),
        function(model: INode<any> & { array: string[] }) {
          return {
            index: model.array.indexOf("c")
          };
        }
      ).links.sort()
    ).toEqual(["/array", "/array/length"].sort());
  });
  test("every", function() {
    expect(
      new ReactiveTransformation(player, function(model: INode<any> & Player) {
        return {
          inventory: model.inventory.every(({ quantity }) => quantity > 1)
        };
      }).links.sort()
    ).toEqual(
      [
        "/inventory",
        "/inventory/length",
        "/inventory/0/quantity",
        "/inventory/1/quantity"
      ].sort()
    );
  });
  test("join", function() {
    expect(
      new ReactiveTransformation(
        DEPRECATED_object({ array: array(["a", "b", "c"]) }),
        function(model: INode<any> & { array: string[] }) {
          return {
            array: model.array.join(", ")
          };
        }
      ).links.sort()
    ).toEqual(["/array", "/array/length"].sort());
  });
  test("forEach", function() {
    expect(
      new ReactiveTransformation(player, function(model: INode<any> & Player) {
        return {
          inventory: model.inventory.forEach(s => ({ ...s }))
        };
      }).links.sort()
    ).toEqual(
      [
        "/inventory",
        "/inventory/length",
        "/inventory/0/itemId",
        "/inventory/0/quantity",
        "/inventory/1/itemId",
        "/inventory/1/quantity"
      ].sort()
    );
  });
});

it("should react to array length change", function() {
  const representation = represent(player, representInventorySize);
  player.$present([
    {
      type: MutationType.addItem,
      payload: {
        itemId: "flask",
        quantity: 11
      }
    }
  ]);
  expect(representation.size).toEqual(3);
});

test("Object observability", function() {
  test("direct access: shoudl retrieve only the path accessed in the representation", function() {
    expect(
      new ReactiveTransformation(player, representPlayer).links.sort()
    ).toEqual(["/level", "/name", "/stats", "/stats/health"].sort());
  });
});

test("The representation of an observed model is updated after a mutation", function() {
  const representation = represent(player, representPlayer);

  player.$present([
    {
      type: MutationType.incrementLevel
    }
  ]);
  console.log(player.$patch);
  expect(representation.stats.level).toEqual(101);
});

test("The representation can use other representations", function() {
  expect(
    new ReactiveTransformation(player, representPlayer).subRepresentationKeys
  ).toEqual(["/inventory"]);
});
 */
