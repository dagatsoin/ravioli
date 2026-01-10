/**
 * Counter Model - Ravioli Container Definition
 *
 * SAM Pattern with Request-Scoped Container:
 * - Fresh container created for each request
 * - Data AND stepId hydrated from DB on init (via initialStepId option)
 * - NAP (Step Reaction) saves after each step
 *
 * KEY INSIGHT: Temporal logic preserved across requests!
 * No singleton needed - stepId continues from persisted state.
 */

import { createContainer, IInstance } from '@warfog/ravioli';

// ===========================================
// Data Shape
// ===========================================

export interface CounterData {
  id: string;
  count: number;
}

// ===========================================
// Representation
// ===========================================

export interface CounterRepresentation {
  id: string;
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

interface HydratePayload {
  count: number;
}

// ===========================================
// Ravioli Container Definition
// ===========================================

/**
 * Create a Counter container definition
 *
 * Note: onSave callback is passed to enable NAP persistence
 * without hardcoding the repository dependency.
 *
 * Using initialStepId option allows request-scoped containers
 * that preserve temporal logic across requests.
 */
export function createCounterContainer(
  id: string,
  initialCount: number,
  initialStepId: number,
  onSave: (id: string, count: number, stepId: number) => Promise<void>
) {
  // Reference to capture the instance for step reaction
  let instanceRef: IInstance<any, any, any, any, any> | null = null;

  const factory = createContainer<CounterData>()
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
    .addAcceptor('hydrate', {
      mutator(data: CounterData, payload: HydratePayload) {
        data.count = payload.count;
      },
    })

    // -----------------------------------------
    // Control States
    // -----------------------------------------
    .addControlStatePredicate('CAN_DECREMENT', ({ data }: { data: CounterData }) => data.count > 0)
    .addControlStatePredicate('IS_ZERO', ({ data }: { data: CounterData }) => data.count === 0)
    .addControlStatePredicate('IS_POSITIVE', ({ data }: { data: CounterData }) => data.count > 0)
    .addControlStatePredicate('IS_NEGATIVE', ({ data }: { data: CounterData }) => data.count < 0)

    // -----------------------------------------
    // Actions
    // -----------------------------------------
    .addActions({
      increment: () => [{ type: 'add' as const, payload: { amount: 1 } }],

      decrement: {
        isAllowed: (rep) => rep.controlStates.includes('CAN_DECREMENT'),
        action: () => [{ type: 'add' as const, payload: { amount: -1 } }],
      },

      reset: () => [{ type: 'set' as const, payload: { value: 0 } }],

      addAmount: ({ amount }: { amount: number }) => [{ type: 'add' as const, payload: { amount } }],

      // Hydrate action - used to load state from DB without triggering save
      // Note: We'll handle this specially to avoid save loop
      hydrateFromDB: ({ count }: { count: number }) => [{ type: 'hydrate' as const, payload: { count } }],
    })

    // -----------------------------------------
    // NAP: Step Reaction for Automatic Persistence
    //
    // TEMPORAL LOGIC PRESERVED:
    // - stepId initialized from DB via initialStepId option
    // - Step continues from where it left off across requests
    //
    // awaitAsync: true ensures saves complete in order,
    // preventing stale writes when persistence latency varies
    // -----------------------------------------
    .addStepReaction({
      debugName: 'persist',
      runOnInit: false,
      awaitAsync: true,
      do: async ({ data }) => {
        const stepId = instanceRef?.stepId ?? 0;
        await onSave(data.id, data.count, stepId);
        console.log(`[NAP] Persisted counter "${data.id}" with count ${data.count} at step ${stepId}`);
      },
    })

    // -----------------------------------------
    // Representation
    // -----------------------------------------
    .addStaticTransformation(({ data, actions }) => ({
      getId: () => data.id,
      getCount: () => data.count,
      actions,
    }));

  // Create instance with initial data AND initialStepId for hydration
  const instance = factory.create(
    { id, count: initialCount },
    { initialStepId }
  );

  // Capture reference for step reaction
  instanceRef = instance;

  return instance;
}

// Type export
export type CounterInstance = ReturnType<typeof createCounterContainer>;
