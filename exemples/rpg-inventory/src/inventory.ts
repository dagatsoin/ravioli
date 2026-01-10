/**
 * RPG Inventory - Ravioli/SAM Implementation
 *
 * Demonstrates:
 * - Atomic acceptors (Model doesn't know business context)
 * - Control states computed from data
 * - Actions gated by control states via isAllowed
 * - Static transformation for public/private views
 * - Multiple instances from same container
 */

import { createContainer } from '@warfog/ravioli';
import { ITEM_CATALOG, MAX_STACK_SIZE, MAX_SLOTS } from './item-catalog';

// ============================================
// Data Model
// ============================================

export interface InventorySlot {
  itemId: string | null;
  quantity: number;
}

export interface InventoryData {
  playerId: string;
  slots: InventorySlot[];
}

// ============================================
// Mutation Payloads
// ============================================

interface SetSlotItemPayload {
  slotIndex: number;
  itemId: string | null;
}

interface SetSlotQuantityPayload {
  slotIndex: number;
  quantity: number;
}

interface SlotIndexPayload {
  slotIndex: number;
}

// ============================================
// Inventory Container Factory
// ============================================

export const Inventory = createContainer<InventoryData>()
  // ------------------------------------------
  // Atomic Acceptors
  // These are generic slot operations - they don't know about
  // "picking up items" or "dropping items"
  // ------------------------------------------
  .addAcceptor('setSlotItem', {
    mutator(data: InventoryData, payload: SetSlotItemPayload) {
      data.slots[payload.slotIndex].itemId = payload.itemId;
    },
  })

  .addAcceptor('setSlotQuantity', {
    mutator(data: InventoryData, payload: SetSlotQuantityPayload) {
      data.slots[payload.slotIndex].quantity = payload.quantity;
    },
  })

  .addAcceptor('incrementSlotQuantity', {
    condition: (data: InventoryData, payload: SlotIndexPayload) =>
      data.slots[payload.slotIndex].quantity < MAX_STACK_SIZE,
    mutator(data: InventoryData, payload: SlotIndexPayload) {
      data.slots[payload.slotIndex].quantity++;
    },
  })

  .addAcceptor('decrementSlotQuantity', {
    condition: (data: InventoryData, payload: SlotIndexPayload) =>
      data.slots[payload.slotIndex].quantity > 0,
    mutator(data: InventoryData, payload: SlotIndexPayload) {
      data.slots[payload.slotIndex].quantity--;
    },
  })

  // ------------------------------------------
  // Control States
  // Computed predicates describing inventory state
  // ------------------------------------------
  .addControlStatePredicate('HAS_SPACE', ({ data }: { data: InventoryData }) =>
    data.slots.some(
      (slot: InventorySlot) => slot.itemId === null || slot.quantity < MAX_STACK_SIZE
    )
  )

  .addControlStatePredicate('IS_EMPTY', ({ data }: { data: InventoryData }) =>
    data.slots.every((slot: InventorySlot) => slot.itemId === null || slot.quantity === 0)
  )

  .addControlStatePredicate('IS_FULL', ({ data }: { data: InventoryData }) =>
    data.slots.every(
      (slot: InventorySlot) => slot.itemId !== null && slot.quantity >= MAX_STACK_SIZE
    )
  )

  // ------------------------------------------
  // Actions
  // Compose atomic acceptors for business operations
  // ------------------------------------------
  .addActions({
    // Drop one item from a specific slot
    dropFromSlot: ({ slotIndex }: { slotIndex: number }) => [
      { type: 'decrementSlotQuantity' as const, payload: { slotIndex } },
    ],

    // Add one item to a specific slot (for existing stack)
    addToExistingStack: ({ slotIndex }: { slotIndex: number }) => [
      { type: 'incrementSlotQuantity' as const, payload: { slotIndex } },
    ],

    // Initialize a new stack in an empty slot
    initializeSlot: ({ slotIndex, itemId }: { slotIndex: number; itemId: string }) => [
      { type: 'setSlotItem' as const, payload: { slotIndex, itemId } },
      { type: 'setSlotQuantity' as const, payload: { slotIndex, quantity: 1 } },
    ],

    // Clear a slot completely
    clearSlot: ({ slotIndex }: { slotIndex: number }) => [
      { type: 'setSlotItem' as const, payload: { slotIndex, itemId: null } },
      { type: 'setSlotQuantity' as const, payload: { slotIndex, quantity: 0 } },
    ],
  })

  // ------------------------------------------
  // Step Reactions (NAP)
  // Automatic actions triggered after state changes
  // ------------------------------------------
  .addStepReaction({
    debugName: 'auto-clear-empty-slots',
    when: ({ data }: { data: InventoryData }) =>
      data.slots.some((slot: InventorySlot) => slot.quantity === 0 && slot.itemId !== null),
    do: ({ data, actions }: { data: InventoryData; actions: any }) => {
      data.slots.forEach((slot: InventorySlot, index: number) => {
        if (slot.quantity === 0 && slot.itemId !== null) {
          actions.clearSlot({ slotIndex: index });
        }
      });
    },
  })

  // ------------------------------------------
  // Static Transformation (Representation)
  // Computed once - provides both private and public views
  // ------------------------------------------
  .addStaticTransformation(({ data, actions }: { data: InventoryData; actions: any }) => ({
    // === Owner View (full access) ===
    getPlayerId: () => data.playerId,
    getSlots: () => data.slots,
    getSlot: (index: number) => data.slots[index],

    // === Public View (for other players) ===
    // Only exposes cumulative sell value, not item details
    getPublicValue: () => {
      return data.slots.reduce((total: number, slot: InventorySlot) => {
        if (slot.itemId && ITEM_CATALOG[slot.itemId]) {
          return total + ITEM_CATALOG[slot.itemId].sellValue * slot.quantity;
        }
        return total;
      }, 0);
    },

    // === Utility Methods ===
    findSlotForItem: (itemId: string): number | null => {
      // First: find existing stack with space
      const existingStack = data.slots.findIndex(
        (slot: InventorySlot) => slot.itemId === itemId && slot.quantity < MAX_STACK_SIZE
      );
      if (existingStack !== -1) return existingStack;

      // Second: find empty slot
      const emptySlot = data.slots.findIndex((slot: InventorySlot) => slot.itemId === null);
      return emptySlot !== -1 ? emptySlot : null;
    },

    getTotalItemCount: () => {
      return data.slots.reduce((total: number, slot: InventorySlot) => total + slot.quantity, 0);
    },

    // === Exposed Actions ===
    actions,
  }));

// ============================================
// Factory Helper
// ============================================

export function createEmptyInventory(playerId: string): InventoryData {
  return {
    playerId,
    slots: Array(MAX_SLOTS)
      .fill(null)
      .map(() => ({
        itemId: null,
        quantity: 0,
      })),
  };
}

// ============================================
// High-Level Game Operations
// These wrap the low-level Ravioli actions
// ============================================

export type InventoryInstance = ReturnType<typeof Inventory.create>;

export function pickUpItem(inventory: InventoryInstance, itemId: string): boolean {
  if (!inventory.controlStates.includes('HAS_SPACE')) {
    return false;
  }

  const rep = inventory.representationRef.current;
  const slotIndex = rep.findSlotForItem(itemId);

  if (slotIndex === null) {
    return false;
  }

  const slot = rep.getSlot(slotIndex);

  if (slot.itemId === null) {
    // Empty slot - initialize new stack
    rep.actions.initializeSlot({ slotIndex, itemId });
  } else {
    // Existing stack - increment
    rep.actions.addToExistingStack({ slotIndex });
  }

  return true;
}

export function dropItem(inventory: InventoryInstance, slotIndex: number): boolean {
  const rep = inventory.representationRef.current;
  const slot = rep.getSlot(slotIndex);

  if (slot.itemId === null || slot.quantity === 0) {
    return false;
  }

  rep.actions.dropFromSlot({ slotIndex });
  return true;
}
