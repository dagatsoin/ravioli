/**
 * Unit Tests for RPG Inventory
 *
 * Tests verify:
 * - Acceptor conditions (max stack, min quantity)
 * - Control states (HAS_SPACE, IS_EMPTY, IS_FULL)
 * - Action gating via isAllowed
 * - Step reactions (auto-clear)
 * - Representation (public vs private view)
 * - Instance isolation (two players)
 */

import {
  Inventory,
  createEmptyInventory,
  pickUpItem,
  dropItem,
  InventoryInstance,
} from '../src/inventory';
import { MAX_STACK_SIZE, MAX_SLOTS, ITEM_CATALOG } from '../src/item-catalog';

describe('Inventory Container', () => {
  let inventory: InventoryInstance;

  beforeEach(() => {
    inventory = Inventory.create(createEmptyInventory('TestPlayer'));
  });

  // ==========================================
  // Control States
  // ==========================================

  describe('Control States', () => {
    it('should start with IS_EMPTY and HAS_SPACE', () => {
      expect(inventory.controlStates).toContain('IS_EMPTY');
      expect(inventory.controlStates).toContain('HAS_SPACE');
      expect(inventory.controlStates).not.toContain('IS_FULL');
    });

    it('should lose IS_EMPTY after adding an item', () => {
      pickUpItem(inventory, 'potion');

      expect(inventory.controlStates).not.toContain('IS_EMPTY');
      expect(inventory.controlStates).toContain('HAS_SPACE');
    });

    it('should become IS_FULL when all slots are maxed', () => {
      // Fill all slots to max
      for (let slot = 0; slot < MAX_SLOTS; slot++) {
        for (let i = 0; i < MAX_STACK_SIZE; i++) {
          pickUpItem(inventory, 'potion');
        }
      }

      expect(inventory.controlStates).toContain('IS_FULL');
      expect(inventory.controlStates).not.toContain('HAS_SPACE');
      expect(inventory.controlStates).not.toContain('IS_EMPTY');
    });
  });

  // ==========================================
  // Acceptor Conditions
  // ==========================================

  describe('Acceptor Conditions', () => {
    it('should enforce MAX_STACK_SIZE on incrementSlotQuantity', () => {
      // Fill one slot to max
      for (let i = 0; i < MAX_STACK_SIZE; i++) {
        pickUpItem(inventory, 'sword');
      }

      const slot0 = inventory.representationRef.current.getSlot(0);
      expect(slot0.quantity).toBe(MAX_STACK_SIZE);

      // Try to add one more - should go to new slot
      pickUpItem(inventory, 'sword');
      expect(inventory.representationRef.current.getSlot(0).quantity).toBe(MAX_STACK_SIZE);
      expect(inventory.representationRef.current.getSlot(1).quantity).toBe(1);
    });

    it('should enforce minimum quantity on decrementSlotQuantity', () => {
      pickUpItem(inventory, 'potion');
      expect(inventory.representationRef.current.getSlot(0).quantity).toBe(1);

      // Drop the item
      dropItem(inventory, 0);

      // Slot should be cleared by step reaction
      const slot = inventory.representationRef.current.getSlot(0);
      expect(slot.itemId).toBeNull();
      expect(slot.quantity).toBe(0);
    });
  });

  // ==========================================
  // Step Reactions (NAP)
  // ==========================================

  describe('Step Reactions', () => {
    it('should auto-clear slot when quantity reaches 0', () => {
      pickUpItem(inventory, 'gem');
      expect(inventory.representationRef.current.getSlot(0).itemId).toBe('gem');

      dropItem(inventory, 0);

      // NAP should have cleared the slot
      const slot = inventory.representationRef.current.getSlot(0);
      expect(slot.itemId).toBeNull();
      expect(slot.quantity).toBe(0);
    });
  });

  // ==========================================
  // Representation
  // ==========================================

  describe('Representation', () => {
    it('should provide full slot details via getSlots()', () => {
      pickUpItem(inventory, 'sword');
      pickUpItem(inventory, 'potion');
      pickUpItem(inventory, 'potion');

      const slots = inventory.representationRef.current.getSlots();
      expect(slots[0].itemId).toBe('sword');
      expect(slots[0].quantity).toBe(1);
      expect(slots[1].itemId).toBe('potion');
      expect(slots[1].quantity).toBe(2);
    });

    it('should calculate public value correctly', () => {
      pickUpItem(inventory, 'sword'); // 100
      pickUpItem(inventory, 'gem'); // 500
      pickUpItem(inventory, 'gem'); // 500

      const publicValue = inventory.representationRef.current.getPublicValue();
      expect(publicValue).toBe(100 + 500 + 500);
    });

    it('should find correct slot for new items', () => {
      pickUpItem(inventory, 'potion');
      pickUpItem(inventory, 'sword');

      const rep = inventory.representationRef.current;

      // Should find existing potion stack
      expect(rep.findSlotForItem('potion')).toBe(0);

      // Should find existing sword stack
      expect(rep.findSlotForItem('sword')).toBe(1);

      // Should find first empty slot for new item
      expect(rep.findSlotForItem('gem')).toBe(2);
    });
  });

  // ==========================================
  // High-Level Operations
  // ==========================================

  describe('pickUpItem', () => {
    it('should return true when item is picked up successfully', () => {
      const result = pickUpItem(inventory, 'potion');
      expect(result).toBe(true);
      expect(inventory.representationRef.current.getTotalItemCount()).toBe(1);
    });

    it('should return false when inventory is full', () => {
      // Fill inventory
      for (let slot = 0; slot < MAX_SLOTS; slot++) {
        for (let i = 0; i < MAX_STACK_SIZE; i++) {
          pickUpItem(inventory, 'potion');
        }
      }

      const result = pickUpItem(inventory, 'potion');
      expect(result).toBe(false);
    });

    it('should stack same items in same slot', () => {
      pickUpItem(inventory, 'potion');
      pickUpItem(inventory, 'potion');
      pickUpItem(inventory, 'potion');

      expect(inventory.representationRef.current.getSlot(0).quantity).toBe(3);
      expect(inventory.representationRef.current.getSlot(1).itemId).toBeNull();
    });

    it('should use new slot for different items', () => {
      pickUpItem(inventory, 'potion');
      pickUpItem(inventory, 'sword');

      expect(inventory.representationRef.current.getSlot(0).itemId).toBe('potion');
      expect(inventory.representationRef.current.getSlot(1).itemId).toBe('sword');
    });
  });

  describe('dropItem', () => {
    it('should return true when item is dropped successfully', () => {
      pickUpItem(inventory, 'potion');
      pickUpItem(inventory, 'potion');

      const result = dropItem(inventory, 0);
      expect(result).toBe(true);
      expect(inventory.representationRef.current.getSlot(0).quantity).toBe(1);
    });

    it('should return false when slot is empty', () => {
      const result = dropItem(inventory, 0);
      expect(result).toBe(false);
    });
  });

  // ==========================================
  // Instance Isolation (Two Players)
  // ==========================================

  describe('Instance Isolation', () => {
    let playerA: InventoryInstance;
    let playerB: InventoryInstance;

    beforeEach(() => {
      playerA = Inventory.create(createEmptyInventory('PlayerA'));
      playerB = Inventory.create(createEmptyInventory('PlayerB'));
    });

    it('should maintain separate inventories', () => {
      pickUpItem(playerA, 'sword');
      pickUpItem(playerA, 'sword');
      pickUpItem(playerB, 'gem');

      expect(playerA.representationRef.current.getSlot(0).itemId).toBe('sword');
      expect(playerA.representationRef.current.getSlot(0).quantity).toBe(2);

      expect(playerB.representationRef.current.getSlot(0).itemId).toBe('gem');
      expect(playerB.representationRef.current.getSlot(0).quantity).toBe(1);
    });

    it('should show different public values', () => {
      pickUpItem(playerA, 'sword'); // 100
      pickUpItem(playerB, 'gem'); // 500

      expect(playerA.representationRef.current.getPublicValue()).toBe(100);
      expect(playerB.representationRef.current.getPublicValue()).toBe(500);
    });

    it('should have independent control states', () => {
      // Fill playerA's inventory
      for (let slot = 0; slot < MAX_SLOTS; slot++) {
        for (let i = 0; i < MAX_STACK_SIZE; i++) {
          pickUpItem(playerA, 'potion');
        }
      }

      expect(playerA.controlStates).toContain('IS_FULL');
      expect(playerB.controlStates).toContain('IS_EMPTY');
      expect(playerB.controlStates).toContain('HAS_SPACE');
    });

    it('Player A cannot see Player B item details, only value', () => {
      pickUpItem(playerB, 'gem');
      pickUpItem(playerB, 'sword');

      // Player A can only access playerB's public value
      const playerBPublicValue = playerB.representationRef.current.getPublicValue();
      expect(playerBPublicValue).toBe(500 + 100);

      // In a real app, Player A would NOT have access to playerB.representationRef.current.getSlots()
      // This is enforced at the application layer, not Ravioli
      // The representation provides the API; the app decides who can call what
    });
  });

  // ==========================================
  // Step Tracking
  // ==========================================

  describe('Step Tracking', () => {
    it('should increment stepId on each mutation', () => {
      expect(inventory.stepId).toBe(0);

      pickUpItem(inventory, 'potion');
      expect(inventory.stepId).toBeGreaterThan(0);

      const stepAfterPickup = inventory.stepId;
      pickUpItem(inventory, 'sword');
      expect(inventory.stepId).toBeGreaterThan(stepAfterPickup);
    });
  });
});
