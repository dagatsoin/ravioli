test.todo(
  ''
) /* import { Arr } from "crafter/src/Array";
import { Mutator, MutatorParams } from "../src/api/Mutations";

export enum MutationType {
  deccreaseHP = "decreaseHP",
  incrementLevel = "incrementLevel",
  updateName = "updateName",
  addItem = "addItem"
}
type Player = {
  name: string;
  level: number;
  health: number;
  inventory: Arr<{ itemId: string; quantity: number }>;
};

function decreaseHP({
  model: player,
  payload: damage
}: MutatorParams<number, Player>) {
  player.health -= damage;
}

function incrementLevel({ model: player }: MutatorParams<never, Player>) {
  player.level++;
}

function addItem({
  model: player,
  payload
}: MutatorParams<
  {
    itemId: string;
    quantity: number;
  },
  Player
>) {
  player.inventory.push(payload);
}

function updateName({
  model: player,
  payload: { name }
}: MutatorParams<{ name: string }, Player>) {
  player.name = name;
}
export const mutations: { [key in MutationType]: Mutator<any, any> } = {
  decreaseHP,
  incrementLevel,
  updateName,
  addItem
};
 */
