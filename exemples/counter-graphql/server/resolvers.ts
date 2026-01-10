/**
 * GraphQL Resolvers - Actions Layer
 *
 * SAM Pattern Placement:
 * - Query resolvers: Return Representation
 * - Mutation resolvers: Execute Actions, return new Representation
 * - Subscription resolvers: Push Representation updates
 *
 * The resolvers ARE the bridge between GraphQL and the SAM Model
 */

import { counterService, pubsub, COUNTER_UPDATED } from './counter.service.js';

export const resolvers = {
  // ===========================================
  // Queries - Return Representation
  // ===========================================
  Query: {
    /**
     * Get current counter representation
     * This is how clients READ the state
     */
    counter: () => {
      console.log('[Query] counter');
      return counterService.getRepresentation();
    },
  },

  // ===========================================
  // Mutations - Execute Actions
  // ===========================================
  Mutation: {
    /**
     * Action: Increment
     * Proposes +1 to the model
     */
    increment: () => {
      const result = counterService.increment();
      console.log(`[Mutation] increment -> count: ${result.count}`);
      return result;
    },

    /**
     * Action: Decrement
     * Proposes -1 to the model (gated by CAN_DECREMENT)
     * Returns DecrementResult with success/error
     */
    decrement: () => {
      const result = counterService.decrement();
      if (result.success) {
        console.log(`[Mutation] decrement -> count: ${result.representation.count}`);
      } else {
        console.log(`[Mutation] decrement REJECTED: ${result.error}`);
      }
      return result;
    },

    /**
     * Action: Reset
     * Sets count to 0
     */
    reset: () => {
      const result = counterService.reset();
      console.log(`[Mutation] reset -> count: ${result.count}`);
      return result;
    },

    /**
     * Action: Add
     * Adds arbitrary amount
     */
    add: (_: unknown, { amount }: { amount: number }) => {
      const result = counterService.addAmount(amount);
      console.log(`[Mutation] add(${amount}) -> count: ${result.count}`);
      return result;
    },
  },

  // ===========================================
  // Subscriptions - Push Representation Updates
  // This implements real-time state synchronization
  // ===========================================
  Subscription: {
    counterUpdated: {
      subscribe: () => {
        console.log('[Subscription] Client subscribed to counterUpdated');
        return pubsub.asyncIterableIterator([COUNTER_UPDATED]);
      },
    },
  },
};
