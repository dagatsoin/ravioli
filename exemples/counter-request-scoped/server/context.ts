/**
 * GraphQL Context Factory - Singleton Access
 *
 * Gets the singleton container from CounterManager:
 * 1. Extract counter ID from request header
 * 2. Get singleton container from manager (creates if needed)
 * 3. Attach to context for resolvers
 *
 * TEMPORAL LOGIC PRESERVED:
 * - Container is singleton per tenant
 * - Step count maintains across all requests
 * - NAP automatically persists after each action
 */

import { Request } from 'express';
import { counterManager } from './counter-manager.js';
import { CounterInstance } from './counter.js';

// ===========================================
// Context Type
// ===========================================

export interface GraphQLContext {
  counter: CounterInstance;
  counterId: string;
}

// ===========================================
// Context Factory
// ===========================================

/**
 * Create GraphQL context for each request
 *
 * Note: Container is SINGLETON, not created per request
 * This preserves temporal logic (step count)
 */
export async function createContext({ req }: { req: Request }): Promise<GraphQLContext> {
  // 1. Get counter ID from request header
  const counterId = req.headers['x-counter-id'] as string || 'default';

  console.log(`\n[Context] Request for counter "${counterId}"`);

  // 2. Get singleton container from manager
  //    (creates and hydrates from DB if first access)
  const counter = await counterManager.getCounter(counterId);

  console.log(`[Context] Using container at step: ${counter.stepId}`);

  return {
    counter,
    counterId,
  };
}
