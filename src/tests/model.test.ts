/*import {
  string,
  number,
  object,
  array,
  boolean,
  INodeType
} from "../src/vendor/crafter";
import { component } from "../src";
import { Component, getComponent } from "../src/lib/Component";

/* const Player = component(
  object({
    name: string(),
    health: number(),
    isCasting: boolean(),
    inventory: array(
      object({
        id: string(),
        count: number()
      })
    ),
    equiped: array(
      object({
        slotId: string(),
        itemId: string()
      })
    )
  })
)
  .addControlStates({
    ALIVE: model => model.health > 0,
    DEAD: model => model.health <= 0,
    ARMED: model =>
      model.equiped.some(
        ({ slotId, itemId }) => slotId === "right_hand" && itemId === "sword"
      ),
    UNARMED: model =>
      model.equiped.some(
        ({ slotId, itemId }) => slotId === "right_hand" && itemId === ""
      )
  })
  .addAcceptors(model => ({
 */    /**
     * This is a place to write model business code.
     * The model is just aware of itself. It does not know anything about the outside world.
     * Good examples:
     *  - is this new password has already been used?)
     *  - is this fireball will hurt me? No, I am only sensible to frost.
     * Bad examples:
     *  - is this password well formatted? This is to apply during the action function.
     *  - how many health point left my ennemy has? This model does not hold any data on the ennemy.
     *
     * The acceptor is pure synchronous function of the model and return true or false is the condition is fullfiled.
     * The mutator function must be repeatable as it will be used to restore
     * state during snapshot application and timetravel mechanisms.
     */
/*    removeItem: {
      // Accept only if the item is non equiped
      condition: function({ itemId }: { itemId: string }) {
        return model.equiped.some(
          ({ slotId, itemId: equiped }) =>
            slotId === "right_hand" && itemId !== equiped
        );
      },
      // If OK, do the mutation
      mutator: function({ itemId }: { itemId: string }) {
        const item = model.inventory.find(({ id }) => itemId === id);
        if (item && item.count > 0) {
          item.count--;
        } else {
          model.inventory = model.inventory.filter(({ id }) => itemId !== id);
        }
      }
    },
    hurt: {
      // Accept only if the item is non equiped
      condition: function({ power }: { power: number }) {
        return true;
      },
      // If OK, do the mutation
      mutator: function({ power }: { power: number }) {
        model.health -= power;
      }
    }
    // No guard condition, this will always be executed and marked as an accepted mutation
    /*      equip({ payload: { itemId, slotId } }) {
        const slot = model.equiped.find(slot => slot.slotId === slotId);
        if (slot) {
          slot.itemId = itemId;
        }
      }*/
/*  }))
  .addActions({
    /**
     * This is the place to write action context code.``
     * - write payload validation rules (eg: validate a password format)
     * - map allowed actions to control states
     * - map mutations to actions
     *
     * An action is not awaire of the internal state of the model. But it
     * knows about the context this action is used.
     * Good examples:
     *  - is this password well formatted?
     *  - can I drop an item?
     * Bad examples:
     *  - compute the remaining health point of the model. The actions don't know about the
     *    internal state of the model. What if some buffs are present?
     *  - try to know if this password has already been used. An action is only aware of the "present"
     *    and password
     *
     * Actions can be asynchronous, so you can deleguate some action business rule to
     * external services. Eg: Ask to the GameMaster service if I can open this treasure chest.
     */
/*    dropItem: {
      isAllowed: (
        model,
        acceptedMutations,
        patch,
        controlState,
        previousModel,
        previousControlState
      ) => controlState !== "DEAD",
      action: function(itemId: string) {
        return [
          {
            type: "removeItem",
            payload: { itemId }
          }
        ];
      }
    }
  })
  .addRepresentation(
    /**
     * A representation is how other components or any element outside the comonents see the model.
     * Eg: a player component stores detailled inventory information. This information is private
     * and should not be visible by other players. So, the representation won't return the inventory details.
     *
     * A representation is a a computation of the model at a given step.
     * It receives a StateComputationArgs object which is composed of:
     * - the current model
     * - the previous model snapshot
     * - the JSON patch representing the operation of this step
     * - the current control state of the component
     * - the previous control state of the component
     */
/*    ({
      model,
      acceptedMutations,
      patch,
      controlState,
      previousModel,
      previousControlState
    }) => ({
      name: model.name,
      equiped: model.equiped
    })
  )
  /* .addRenderer(representation => {
    document.body.childNodes.forEach(e => e.remove());
    document.body.append(representation);
  });*/
/*  .addReaction(
    /**
     * A reaction is a function which is trigger, at the end of the SAM loop, when the model reach a certain state.
     * Eg: The player receive another fireball and its health is now below 0. Seems it just died. Time to check
     * if the player was casting a spell. If so, cancel it.
     *
     * Those action are aware of the previous state
     */
 /*    ({
     model,
      acceptedMutations,
      patch,
      controlState,
      previousModel,
      previousControlState
    }) => []
  );
/*
 const SimpleUserExemple = component(object({ name: string() }))
    .addAcceptors(model => [
      {
        setName({ payload: { name } }) {
          model.name = name;
        }
      }
    ])
    .addActions({ setName: "setName" })
    .addRepresentation(model => ({ username: model.name }));
*/

/*const Inventory = component(
  array(
    object({
      id: string(),
      quantity: number()
    })
  )
).addAcceptors(model => ({
  addItem: {
    condition: () => true,
    mutator: ({ id, quantity }: { id: string; quantity: number }) => {
      const slot = model.find(slot => slot.id === id);
      if (slot) {
        slot.quantity += quantity;
      } else {
        model.push({ id, quantity });
      }
    }
  },
  removeItem: {
    // Accept only if the item is non equiped
    condition: ({ itemId }: { itemId: string }) =>
      model.some(({ id }) => itemId === id),
    // If OK, do the mutation
    mutator: function({ itemId }: { itemId: string }) {
      // todo prevent this operation
      const index = model.findIndex(({ id }) => itemId === id);
      model.splice(index, 1);
    }
  }
}));

const Stats = component(
  object({
    agility: number(),
    force: number()
  })
)
  .addAcceptors(model => ({
    updateAgility: {
      condition: () => true,
      mutator: ({ agility }: { agility: number }) => {
        model.agility += agility;
      }
    },
    updateForce: {
      condition: () => true,
      mutator: ({ force }: { force: number }) => {
        model.force += force;
      }
    }
  }))
  .addActions({
    updateAgility: {
      isAllowed: () => true,
      action: ({ agility }: { agility: number }) => [
        { type: "updateAgility", payload: { agility } }
      ]
    },
    updateForce: {
      isAllowed: () => true,
      action: ({ force }: { force: number }) => [
        { type: "updateForce", payload: { force } }
      ]
    }
  });

it("should add a model type", function() {
  expect((getComponent(Player).type as INodeType<any>).isNode).toBeTruthy();
});

it("should add some control states", function() {
  expect(Object.keys(Player.controlStatePredicates).sort()).toEqual(
    ["ALIVE", "DEAD", "ARMED", "UNARMED"].sort()
  );
});

it("should add some acceptors", function() {
  expect("removeItem" in (Player as any).acceptors).toBeTruthy();
});

it("should merge control states and call onMergeControlStates on the instances", function() {});
it(
  "should merge acceptors to existing and call onMergeAcceptors on the instances"
);
it("should merge actions and call onMergeActions on the instances", function() {
  const Model = component(object({name: string()})).addActions({
    rename: {
      isAllowed: () => true,
      action: ({ name }: {name: string}) => []
    }
  });

  const model = Model
    .create({ name: "Dreadbond" });
    .onMergeActions((self) => expect(Object.keys(self.actions).sort()).toEqual(["rename", "hit"]))

  Model.addActions({
    hit: {
      isAllowed: () => true,
      action: ({ name }: {name: string}) => []}
  })  
});

it("should compose model", function() {
  const Dreadbond = compose(
    Player,
    Stats
  );
  expect(Object.keys(getComponent(Dreadbond).acceptors).sort()).toEqual(
    ["removeItem", "hurt", "updateAgility", "updateForce"].sort()
  );

  const Model = compose(
    Player,
    {
      stats: Stats,
      loot: Inventory
    }
  )

  expect(Model.create({
    name: "Fraktar",
    inventory: [],
    stats: {
      force: 2,
      agility: 3
    },
    loot: []  
  }))
});

it("should throw if a key of the model is already present while composing model", function() {
  expect(compose(
    Player,
    {name: Player}
  )).toThrow()
});

it("should throw if a key of the model is already present while composing model", function() {
  expect(compose(
    Player,
    { name: Player }
  )).toThrow()

  expect(compose(
    Player,
    Player
  )).toThrow()
});

test("throw if a control state predicate is already present while composing model", function() {});

test("throw if an acceptor key is already present while composing model", function() {});

test("throw if an action key is already present while composing model", function() {});

test("throw if a representation computation key is already present while composing model", function() {});

it("should merge the action of all model on the same level", function() {
  const Model = compose(
    Player,
    Stats
  )
  expect(Object.keys(getComponent(Model).actions).sort()).toEqual(["dropItem", "updateForce", "updateAgility"].sort())
});

it("should access to sub component", function() {
  const Model = compose(
    Player,
    {stats: Stats}
  )

  expect(Object.keys(getComponent(Model.name)).sort()).toEqual(["updateForce", "updateAgility"].sort())
});

it("should directly bind an action to a mutation", function() {
  const SimpleUserExemple = component(object({ name: string() }))
    .addAcceptors(model => [
      {
        setName({ payload: { name } }) {
          model.name = name;
        }
      }
    ])
    .addActions({ setName: "setName" })
    .addRepresentation(model => ({ username: model.name }));
});*/