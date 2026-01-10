/**
 * Item definitions for the RPG inventory system
 */

export interface ItemDefinition {
  id: string;
  name: string;
  sellValue: number;
}

export const ITEM_CATALOG: Record<string, ItemDefinition> = {
  potion: { id: 'potion', name: 'Health Potion', sellValue: 25 },
  sword: { id: 'sword', name: 'Iron Sword', sellValue: 100 },
  shield: { id: 'shield', name: 'Wooden Shield', sellValue: 75 },
  gem: { id: 'gem', name: 'Ruby Gem', sellValue: 500 },
};

export const MAX_STACK_SIZE = 5;
export const MAX_SLOTS = 10;
