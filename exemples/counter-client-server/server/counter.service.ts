/**
 * Counter Service - Actions Layer
 *
 * SAM Pattern Placement:
 * - This is the Actions layer that proposes changes to the Model
 * - Actions are triggered by external requests (HTTP)
 * - Each action returns the new Representation
 * - Actions can be rejected by the Model (isAllowed check)
 */

import { Counter, CounterRepresentation, createInitialCounter, CounterInstance } from './counter.js';

export class CounterService {
  private counter: CounterInstance;

  constructor() {
    // Create the Model (single source of truth)
    this.counter = Counter.create(createInitialCounter());
  }

  /**
   * Get current representation
   * This is what clients see - never raw state
   * Control states come from instance, not representation
   */
  getRepresentation(): CounterRepresentation {
    const rep = this.counter.representationRef.current;
    return {
      count: rep.getCount(),
      controlStates: [...this.counter.controlStates],
    };
  }

  /**
   * Action: Increment
   * Proposes +1 to the model
   */
  increment(): CounterRepresentation {
    const rep = this.counter.representationRef.current;
    rep.actions.increment();
    return this.getRepresentation();
  }

  /**
   * Action: Decrement
   * Proposes -1 to the model
   * Will be rejected if count <= 0 (gated by CAN_DECREMENT)
   */
  decrement(): { success: boolean; representation: CounterRepresentation } {
    const rep = this.counter.representationRef.current;

    // Check if action is allowed (control state gate)
    if (!this.counter.controlStates.includes('CAN_DECREMENT')) {
      return {
        success: false,
        representation: this.getRepresentation(),
      };
    }

    rep.actions.decrement();
    return {
      success: true,
      representation: this.getRepresentation(),
    };
  }

  /**
   * Action: Reset
   * Sets count to 0
   */
  reset(): CounterRepresentation {
    const rep = this.counter.representationRef.current;
    rep.actions.reset();
    return this.getRepresentation();
  }

  /**
   * Action: Add Amount
   * Adds arbitrary amount (can be negative)
   */
  addAmount(amount: number): CounterRepresentation {
    const rep = this.counter.representationRef.current;
    rep.actions.addAmount({ amount });
    return this.getRepresentation();
  }

  /**
   * Get current step ID (for debugging/testing)
   */
  getStepId(): number {
    return this.counter.stepId;
  }
}

// Singleton instance for the server
export const counterService = new CounterService();
