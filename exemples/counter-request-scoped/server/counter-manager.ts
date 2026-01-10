/**
 * Counter Manager - Singleton Container Management
 *
 * Manages singleton containers per tenant (counter ID):
 * - One container per tenant, lives for server lifetime
 * - Hydrates data from DB on first access
 * - NAP automatically persists changes
 *
 * TEMPORAL LOGIC PRESERVED:
 * - Each container maintains its own step count
 * - Step 0 → 1 → 2 → 3 → ... (continuous across all actions)
 */

import { createCounterContainer, CounterInstance } from './counter.js';
import { counterRepository } from './repository.js';

// ===========================================
// Counter Manager (Singleton per tenant)
// ===========================================

class CounterManager {
  // Map of tenant ID → singleton container
  private containers: Map<string, CounterInstance> = new Map();

  // Track which containers are being initialized (prevent race conditions)
  private initializing: Map<string, Promise<CounterInstance>> = new Map();

  /**
   * Get or create a counter container for the given tenant ID
   *
   * - If container exists: return it (singleton)
   * - If container doesn't exist: create, hydrate from DB, return
   */
  async getCounter(counterId: string): Promise<CounterInstance> {
    // Return existing singleton
    if (this.containers.has(counterId)) {
      console.log(`[Manager] Returning existing container for "${counterId}"`);
      return this.containers.get(counterId)!;
    }

    // Check if already initializing (prevent race condition)
    if (this.initializing.has(counterId)) {
      console.log(`[Manager] Waiting for initialization of "${counterId}"`);
      return this.initializing.get(counterId)!;
    }

    // Create and initialize new container
    const initPromise = this.createAndHydrate(counterId);
    this.initializing.set(counterId, initPromise);

    try {
      const container = await initPromise;
      this.containers.set(counterId, container);
      return container;
    } finally {
      this.initializing.delete(counterId);
    }
  }

  /**
   * Create a new container and hydrate from DB
   */
  private async createAndHydrate(counterId: string): Promise<CounterInstance> {
    console.log(`[Manager] Creating new container for "${counterId}"`);

    // Load existing state from DB
    const existingRecord = await counterRepository.findById(counterId);
    const initialCount = existingRecord?.count ?? 0;

    console.log(`[Manager] Hydrating "${counterId}" with count: ${initialCount}`);

    // Create container with save callback for NAP
    // With awaitAsync: true, the promise is awaited to ensure saves complete in order
    const container = createCounterContainer(
      counterId,
      initialCount,
      // onSave callback - called by NAP after each step
      async (id, count) => {
        await counterRepository.save(id, count);
      }
    );

    console.log(`[Manager] Container "${counterId}" created at step ${container.stepId}`);

    return container;
  }

  /**
   * Get all managed containers (for debugging)
   */
  getAllContainers(): Map<string, CounterInstance> {
    return new Map(this.containers);
  }

  /**
   * Get container info for debugging
   */
  getContainerInfo(counterId: string): { exists: boolean; step?: number; count?: number } {
    const container = this.containers.get(counterId);
    if (!container) {
      return { exists: false };
    }
    return {
      exists: true,
      step: container.stepId,
      count: container.representationRef.current.getCount(),
    };
  }

  /**
   * Clear all containers (for testing)
   */
  clear(): void {
    this.containers.clear();
    this.initializing.clear();
    console.log('[Manager] All containers cleared');
  }
}

// ===========================================
// Singleton Export
// ===========================================

export const counterManager = new CounterManager();
