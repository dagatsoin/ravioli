/**
 * Browser Demo for RPG Inventory
 *
 * Demonstrates:
 * - MobX reactivity with Ravioli
 * - Two player instances with isolated state
 * - Public vs private views
 */

import { autorun } from 'mobx';
import {
  Inventory,
  createEmptyInventory,
  pickUpItem,
  dropItem,
  InventoryInstance,
} from './inventory';
import { ITEM_CATALOG, MAX_STACK_SIZE } from './item-catalog';

// Item icons for display
const ITEM_ICONS: Record<string, string> = {
  potion: '🧪',
  sword: '⚔️',
  shield: '🛡️',
  gem: '💎',
};

// ============================================
// Create Player Inventories
// ============================================

const playerA = Inventory.create(createEmptyInventory('PlayerA'));
const playerB = Inventory.create(createEmptyInventory('PlayerB'));

// ============================================
// Logging
// ============================================

function log(message: string) {
  const logEntries = document.getElementById('log-entries')!;
  const entry = document.createElement('div');
  entry.className = 'log-entry';
  entry.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
  logEntries.insertBefore(entry, logEntries.firstChild);

  // Keep only last 50 entries
  while (logEntries.children.length > 50) {
    logEntries.removeChild(logEntries.lastChild!);
  }
}

// ============================================
// Render Functions
// ============================================

function renderInventory(player: InventoryInstance, containerId: string) {
  const container = document.getElementById(containerId)!;
  const rep = player.representationRef.current;
  const slots = rep.getSlots();

  container.innerHTML = slots
    .map((slot, index) => {
      if (slot.itemId && slot.quantity > 0) {
        const item = ITEM_CATALOG[slot.itemId];
        return `
          <div class="slot has-item" data-slot="${index}">
            <span class="item-icon">${ITEM_ICONS[slot.itemId] || '?'}</span>
            <span class="item-name">${item.name}</span>
            <span class="quantity">${slot.quantity}/${MAX_STACK_SIZE}</span>
          </div>
        `;
      }
      return `<div class="slot" data-slot="${index}"></div>`;
    })
    .join('');

  // Add click handlers to drop items
  container.querySelectorAll('.slot.has-item').forEach((el) => {
    el.addEventListener('click', () => {
      const slotIndex = parseInt(el.getAttribute('data-slot')!, 10);
      const slot = rep.getSlot(slotIndex);
      const itemName = slot.itemId ? ITEM_CATALOG[slot.itemId].name : 'item';

      if (dropItem(player, slotIndex)) {
        log(`${rep.getPlayerId()} dropped ${itemName}`);
      }
    });
  });
}

function renderStats(player: InventoryInstance, prefix: string) {
  const rep = player.representationRef.current;

  document.getElementById(`${prefix}-count`)!.textContent = String(rep.getTotalItemCount());
  document.getElementById(`${prefix}-value`)!.textContent = String(rep.getPublicValue());
  document.getElementById(`${prefix}-step`)!.textContent = String(player.stepId);

  // Control states
  const statesEl = document.getElementById(`${prefix}-states`)!;
  statesEl.innerHTML = player.controlStates.map((s) => `<span>${s}</span>`).join('');
}

function renderItemPicker(player: InventoryInstance, containerId: string) {
  const container = document.getElementById(containerId)!;
  const rep = player.representationRef.current;
  const hasSpace = player.controlStates.includes('HAS_SPACE');

  container.innerHTML = Object.entries(ITEM_CATALOG)
    .map(
      ([id, item]) => `
      <button data-item="${id}" ${!hasSpace ? 'disabled' : ''}>
        ${ITEM_ICONS[id]} ${item.name} (${item.sellValue}g)
      </button>
    `
    )
    .join('');

  container.querySelectorAll('button').forEach((btn) => {
    btn.addEventListener('click', () => {
      const itemId = btn.getAttribute('data-item')!;
      if (pickUpItem(player, itemId)) {
        log(`${rep.getPlayerId()} picked up ${ITEM_CATALOG[itemId].name}`);
      } else {
        log(`${rep.getPlayerId()} failed to pick up ${ITEM_CATALOG[itemId].name} (full)`);
      }
    });
  });
}

function renderPublicViews() {
  // Player A sees Player B's public value
  document.getElementById('playerB-public-value')!.textContent = String(
    playerB.representationRef.current.getPublicValue()
  );

  // Player B sees Player A's public value
  document.getElementById('playerA-public-value')!.textContent = String(
    playerA.representationRef.current.getPublicValue()
  );
}

// ============================================
// MobX Reactivity Setup
// ============================================

// React to Player A changes
autorun(() => {
  renderInventory(playerA, 'playerA-inventory');
  renderStats(playerA, 'playerA');
  renderItemPicker(playerA, 'playerA-picker');
  renderPublicViews();
});

// React to Player B changes
autorun(() => {
  renderInventory(playerB, 'playerB-inventory');
  renderStats(playerB, 'playerB');
  renderItemPicker(playerB, 'playerB-picker');
  renderPublicViews();
});

// Initial log
log('Game started! Click items to pick up, click slots to drop.');
log('Each player can only see the other\'s total inventory value.');
