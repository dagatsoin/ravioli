/**
 * GraphQL Resolvers - Request-Scoped Counter
 *
 * Key difference from singleton:
 * - Container accessed from context (created per request)
 * - No explicit save calls - NAP handles persistence
 * - Each mutation triggers automatic DB save via Step Reaction
 */

import { GraphQLContext } from './context.js';
import { CounterRepresentation } from './counter.js';
import { saveLog, counterRepository, CounterRecord } from './repository.js';

// Helper to get representation from context
function getRepresentation(ctx: GraphQLContext): CounterRepresentation {
  const rep = ctx.counter.representationRef.current;
  return {
    id: rep.getId(),
    count: rep.getCount(),
    controlStates: [...ctx.counter.controlStates],
    step: ctx.counter.stepId,
  };
}

export const resolvers = {
  // ===========================================
  // Queries
  // ===========================================
  Query: {
    /**
     * Get counter from request context
     * State was loaded from DB when context was created
     */
    counter: (_: unknown, __: unknown, ctx: GraphQLContext) => {
      console.log(`[Query] counter for "${ctx.counterId}"`);
      return getRepresentation(ctx);
    },

    /**
     * Debug endpoint to verify persistence
     */
    debug: async (_: unknown, __: unknown, ctx: GraphQLContext) => {
      const allCounters = await counterRepository.findAll();
      return {
        counterId: ctx.counterId,
        currentCount: ctx.counter.representationRef.current.getCount(),
        saveLogCount: saveLog.length,
        allCounters: allCounters.map((c: CounterRecord) => ({
          ...c,
          updatedAt: c.updatedAt.toISOString(),
        })),
      };
    },
  },

  // ===========================================
  // Mutations
  // ===========================================
  Mutation: {
    /**
     * Increment counter
     * NAP automatically persists after this action
     */
    increment: async (_: unknown, __: unknown, ctx: GraphQLContext) => {
      console.log(`[Mutation] increment for "${ctx.counterId}"`);

      const rep = ctx.counter.representationRef.current;
      rep.actions.increment();

      // NAP (Step Reaction) automatically saves to DB here!
      // No explicit save call needed

      const result = getRepresentation(ctx);
      console.log(`[Mutation] increment complete -> count: ${result.count}`);
      return result;
    },

    /**
     * Decrement counter (gated by CAN_DECREMENT)
     * NAP automatically persists if action succeeds
     */
    decrement: async (_: unknown, __: unknown, ctx: GraphQLContext) => {
      console.log(`[Mutation] decrement for "${ctx.counterId}"`);

      if (!ctx.counter.controlStates.includes('CAN_DECREMENT')) {
        console.log(`[Mutation] decrement REJECTED - counter at zero`);
        return {
          success: false,
          error: 'Cannot decrement: counter is at zero',
          representation: getRepresentation(ctx),
        };
      }

      const rep = ctx.counter.representationRef.current;
      rep.actions.decrement();

      // NAP automatically saves to DB here!

      const result = getRepresentation(ctx);
      console.log(`[Mutation] decrement complete -> count: ${result.count}`);
      return {
        success: true,
        error: null,
        representation: result,
      };
    },

    /**
     * Reset counter to zero
     * NAP automatically persists
     */
    reset: async (_: unknown, __: unknown, ctx: GraphQLContext) => {
      console.log(`[Mutation] reset for "${ctx.counterId}"`);

      const rep = ctx.counter.representationRef.current;
      rep.actions.reset();

      // NAP automatically saves to DB here!

      const result = getRepresentation(ctx);
      console.log(`[Mutation] reset complete -> count: ${result.count}`);
      return result;
    },

    /**
     * Add arbitrary amount
     * NAP automatically persists
     */
    addAmount: async (_: unknown, { amount }: { amount: number }, ctx: GraphQLContext) => {
      console.log(`[Mutation] addAmount(${amount}) for "${ctx.counterId}"`);

      const rep = ctx.counter.representationRef.current;
      rep.actions.addAmount({ amount });

      // NAP automatically saves to DB here!

      const result = getRepresentation(ctx);
      console.log(`[Mutation] addAmount complete -> count: ${result.count}`);
      return result;
    },
  },
};
