/**
 * Counter Model - Ravioli Container
 *
 * SAM Pattern Placement:
 * - This IS the Model (single source of truth)
 * - Acceptors are atomic mutations (don't know business context)
 * - Control states are computed predicates
 * - Representation is what clients see
 */

import { createContainer } from '@warfog/ravioli';

// ===========================================
// Data Shape
// ===========================================

export interface CounterData {
  count: number;
}

export function createInitialCounter(): CounterData {
  return { count: 0 };
}

// ===========================================
// Representation (API Contract)
// ===========================================

export interface CounterRepresentation {
  count: number;
  controlStates: string[];
}

// ===========================================
// Acceptor Payloads
// ===========================================

interface AddPayload {
  amount: number;
}

interface SetPayload {
  value: number;
}

// ===========================================
// Ravioli Container Definition
// ===========================================

export const Counter = createContainer<CounterData>()
  // -----------------------------------------
  // Acceptors (Atomic Mutations)
  // These don't know about "increment" or "decrement"
  // They just know how to mutate state atomically
  // -----------------------------------------
  .addAcceptor('add', {
    mutator(data: CounterData, payload: AddPayload) {
      data.count += payload.amount;
    },
  })
  .addAcceptor('set', {
    mutator(data: CounterData, payload: SetPayload) {
      data.count = payload.value;
    },
  })

  // -----------------------------------------
  // Control States (Computed Predicates)
  // Used for action gating and UI state
  // -----------------------------------------
  .addControlStatePredicate('CAN_DECREMENT', ({ data }: { data: CounterData }) => data.count > 0)
  .addControlStatePredicate('IS_ZERO', ({ data }: { data: CounterData }) => data.count === 0)
  .addControlStatePredicate('IS_POSITIVE', ({ data }: { data: CounterData }) => data.count > 0)
  .addControlStatePredicate('IS_NEGATIVE', ({ data }: { data: CounterData }) => data.count < 0)

  // -----------------------------------------
  // Actions (Compose Acceptors)
  // These ARE business operations
  // They can be gated by control states via isAllowed
  // -----------------------------------------
  .addActions({
    increment: () => [{ type: 'add' as const, payload: { amount: 1 } }],

    decrement: {
      isAllowed: (rep) => rep.controlStates.includes('CAN_DECREMENT'),
      action: () => [{ type: 'add' as const, payload: { amount: -1 } }],
    },

    reset: () => [{ type: 'set' as const, payload: { value: 0 } }],

    addAmount: ({ amount }: { amount: number }) => [{ type: 'add' as const, payload: { amount } }],
  })

  // -----------------------------------------
  // Representation (What Clients See)
  // This is the API contract - clients never see raw data
  // Note: controlStates accessed from instance, not transformation
  // -----------------------------------------
  .addStaticTransformation(({ data, actions }) => ({
    // Getters for representation
    getCount: () => data.count,

    // Expose actions
    actions,
  }));

// Type exports
export type CounterInstance = ReturnType<typeof Counter.create>;
