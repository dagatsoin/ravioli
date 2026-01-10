/**
 * Counter Model - Ravioli Container
 *
 * SAM Pattern Placement:
 * - This IS the Model (single source of truth)
 * - UNCHANGED from REST version - Model is transport-agnostic
 * - Acceptors are atomic mutations
 * - Control states are computed predicates
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
// Representation (matches GraphQL schema)
// ===========================================

export interface CounterRepresentation {
  count: number;
  controlStates: string[];
  step: number;
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
  // -----------------------------------------
  .addControlStatePredicate('CAN_DECREMENT', ({ data }: { data: CounterData }) => data.count > 0)
  .addControlStatePredicate('IS_ZERO', ({ data }: { data: CounterData }) => data.count === 0)
  .addControlStatePredicate('IS_POSITIVE', ({ data }: { data: CounterData }) => data.count > 0)
  .addControlStatePredicate('IS_NEGATIVE', ({ data }: { data: CounterData }) => data.count < 0)

  // -----------------------------------------
  // Actions (Compose Acceptors)
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
  // Representation
  // -----------------------------------------
  .addStaticTransformation(({ data, actions }) => ({
    getCount: () => data.count,
    actions,
  }));

// Type exports
export type CounterInstance = ReturnType<typeof Counter.create>;
