/**
 * Counter Manager - Request-Scoped Container Factory
 *
 * With initialStepId option, containers can be truly request-scoped:
 * - No singleton cache needed
 * - Each request creates a fresh container
 * - stepId hydrated from DB preserves temporal logic
 *
 * This example shows BOTH patterns:
 * 1. Request-scoped: getCounter() creates fresh container each time
 * 2. Optional caching: getCachedCounter() for singleton pattern if needed
 */

import { createCounterContainer, CounterInstance } from './counter.js';
import { counterRepository } from './repository.js';

// ===========================================
// Request-Scoped Counter Factory (Recommended)
// ===========================================

/**
 * Create a fresh counter container for this request
 *
 * This is the recommended pattern with initialStepId:
 * - No singleton management complexity
 * - Each request gets isolated container
 * - Temporal logic preserved via stepId hydration
 */
export async function getCounter(counterId: string): Promise<CounterInstance> {
  console.log(`[Manager] Creating request-scoped container for "${counterId}"`);

  // Load existing state from DB (includes stepId!)
  const existingRecord = await counterRepository.findById(counterId);
  const initialCount = existingRecord?.count ?? 0;
  const initialStepId = existingRecord?.stepId ?? 0;

  console.log(`[Manager] Hydrating "${counterId}" with count=${initialCount}, stepId=${initialStepId}`);

  // Create container with hydrated data AND stepId
  const container = createCounterContainer(
    counterId,
    initialCount,
    initialStepId,
    // onSave callback - called by NAP after each step
    async (id, count, stepId) => {
      await counterRepository.save(id, count, stepId);
    }
  );

  console.log(`[Manager] Container "${counterId}" ready at step ${container.stepId}`);

  return container;
}

// ===========================================
// Optional: Singleton Cache (for comparison)
// ===========================================

// Singleton cache (optional - only if you need long-lived containers)
const containerCache: Map<string, CounterInstance> = new Map();
const initializing: Map<string, Promise<CounterInstance>> = new Map();

/**
 * Get or create a cached counter container (singleton per tenant)
 *
 * Use this pattern when:
 * - You need containers to live across multiple requests
 * - You want to avoid hydration overhead per request
 *
 * Note: With initialStepId, this pattern is optional - not required
 * for temporal logic preservation.
 */
export async function getCachedCounter(counterId: string): Promise<CounterInstance> {
  // Return existing singleton
  if (containerCache.has(counterId)) {
    console.log(`[Manager] Returning cached container for "${counterId}"`);
    return containerCache.get(counterId)!;
  }

  // Check if already initializing (prevent race condition)
  if (initializing.has(counterId)) {
    console.log(`[Manager] Waiting for initialization of "${counterId}"`);
    return initializing.get(counterId)!;
  }

  // Create and cache new container
  const initPromise = getCounter(counterId);
  initializing.set(counterId, initPromise);

  try {
    const container = await initPromise;
    containerCache.set(counterId, container);
    return container;
  } finally {
    initializing.delete(counterId);
  }
}

/**
 * Clear container cache (for testing)
 */
export function clearCache(): void {
  containerCache.clear();
  initializing.clear();
  console.log('[Manager] Cache cleared');
}

/**
 * Get cache info (for debugging)
 */
export function getCacheInfo(counterId: string): { cached: boolean; step?: number; count?: number } {
  const container = containerCache.get(counterId);
  if (!container) {
    return { cached: false };
  }
  return {
    cached: true,
    step: container.stepId,
    count: container.representationRef.current.getCount(),
  };
}
