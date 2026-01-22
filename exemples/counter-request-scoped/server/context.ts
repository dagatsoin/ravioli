/**
 * GraphQL Context Factory - Request-Scoped Container
 *
 * Creates a fresh container for each request:
 * 1. Extract counter ID from request header
 * 2. Create container with hydrated data AND stepId from DB
 * 3. Attach to context for resolvers
 *
 * TEMPORAL LOGIC PRESERVED via initialStepId:
 * - Each request gets a fresh container
 * - stepId hydrated from DB ensures continuity
 * - NAP automatically persists after each action
 */

import { Request } from 'express';
import { getCounter } from './counter-manager.js';
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
 * Note: Container is created fresh per request with initialStepId
 * This preserves temporal logic via stepId hydration from DB
 */
export async function createContext({ req }: { req: Request }): Promise<GraphQLContext> {
  // 1. Get counter ID from request header
  const counterId = req.headers['x-counter-id'] as string || 'default';

  console.log(`\n[Context] Request for counter "${counterId}"`);

  // 2. Create fresh container with hydrated data AND stepId
  const counter = await getCounter(counterId);

  console.log(`[Context] Container ready at step: ${counter.stepId}`);

  return {
    counter,
    counterId,
  };
}
