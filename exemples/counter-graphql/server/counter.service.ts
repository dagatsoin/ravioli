/**
 * Counter Service - Actions Layer
 *
 * SAM Pattern Placement:
 * - Actions layer that proposes changes to the Model
 * - Publishes representation changes for GraphQL subscriptions
 * - Same logic as REST version, adds PubSub for real-time
 */

import { PubSub } from 'graphql-subscriptions';
import { Counter, CounterRepresentation, createInitialCounter, CounterInstance } from './counter.js';

// PubSub for GraphQL subscriptions
export const pubsub = new PubSub();
export const COUNTER_UPDATED = 'COUNTER_UPDATED';

export class CounterService {
  private counter: CounterInstance;

  constructor() {
    this.counter = Counter.create(createInitialCounter());
  }

  /**
   * Get current representation
   * This is what GraphQL queries return
   */
  getRepresentation(): CounterRepresentation {
    const rep = this.counter.representationRef.current;
    return {
      count: rep.getCount(),
      controlStates: [...this.counter.controlStates],
      step: this.counter.stepId,
    };
  }

  /**
   * Publish representation update for subscriptions
   */
  private publishUpdate(): void {
    const representation = this.getRepresentation();
    pubsub.publish(COUNTER_UPDATED, { counterUpdated: representation });
  }

  /**
   * Action: Increment
   * GraphQL Mutation: increment
   */
  increment(): CounterRepresentation {
    const rep = this.counter.representationRef.current;
    rep.actions.increment();
    this.publishUpdate();
    return this.getRepresentation();
  }

  /**
   * Action: Decrement
   * GraphQL Mutation: decrement
   * Returns success/error for gated action
   */
  decrement(): { success: boolean; error: string | null; representation: CounterRepresentation } {
    if (!this.counter.controlStates.includes('CAN_DECREMENT')) {
      return {
        success: false,
        error: 'Cannot decrement: counter is at zero',
        representation: this.getRepresentation(),
      };
    }

    const rep = this.counter.representationRef.current;
    rep.actions.decrement();
    this.publishUpdate();

    return {
      success: true,
      error: null,
      representation: this.getRepresentation(),
    };
  }

  /**
   * Action: Reset
   * GraphQL Mutation: reset
   */
  reset(): CounterRepresentation {
    const rep = this.counter.representationRef.current;
    rep.actions.reset();
    this.publishUpdate();
    return this.getRepresentation();
  }

  /**
   * Action: Add Amount
   * GraphQL Mutation: add(amount: Int!)
   */
  addAmount(amount: number): CounterRepresentation {
    const rep = this.counter.representationRef.current;
    rep.actions.addAmount({ amount });
    this.publishUpdate();
    return this.getRepresentation();
  }
}

// Singleton instance
export const counterService = new CounterService();
