/**
 * Counter Client - GraphQL View Layer
 *
 * SAM Pattern Placement:
 * - Pure VIEW - no local state
 * - Uses GraphQL queries/mutations instead of REST
 * - Subscribes via WebSocket for real-time updates
 *
 * Key difference: Subscriptions provide automatic updates (NAP)
 */

const GRAPHQL_HTTP = 'http://localhost:4000/graphql';
const GRAPHQL_WS = 'ws://localhost:4000/graphql';

// ===========================================
// Types (match GraphQL schema)
// ===========================================

interface CounterRepresentation {
  count: number;
  controlStates: string[];
  step: number;
}

interface DecrementResult {
  success: boolean;
  error: string | null;
  representation: CounterRepresentation;
}

// ===========================================
// DOM Elements
// ===========================================

const countDisplay = document.getElementById('count')!;
const btnDecrement = document.getElementById('btn-decrement') as HTMLButtonElement;
const btnReset = document.getElementById('btn-reset') as HTMLButtonElement;
const btnIncrement = document.getElementById('btn-increment') as HTMLButtonElement;
const controlStatesEl = document.getElementById('control-states')!;
const errorMessageEl = document.getElementById('error-message')!;
const stepInfoEl = document.getElementById('step-info')!;
const subscriptionStatusEl = document.getElementById('subscription-status')!;

// ===========================================
// Render Function
// ===========================================

function render(representation: CounterRepresentation) {
  const { count, controlStates, step } = representation;

  // Update count display
  countDisplay.textContent = String(count);
  countDisplay.className = 'count-display';
  if (count < 0) countDisplay.classList.add('negative');
  if (count === 0) countDisplay.classList.add('zero');

  // Update button states
  btnDecrement.disabled = !controlStates.includes('CAN_DECREMENT');

  // Render control states
  controlStatesEl.innerHTML = controlStates.map((s) => `<span>${s}</span>`).join('');

  // Update step
  stepInfoEl.textContent = `Step: ${step}`;

  // Clear error
  errorMessageEl.textContent = '';
}

function showError(message: string) {
  errorMessageEl.textContent = message;
}

function setSubscriptionStatus(connected: boolean) {
  subscriptionStatusEl.textContent = connected ? 'WebSocket: Connected' : 'WebSocket: Disconnected';
  subscriptionStatusEl.className = connected ? 'subscription-status' : 'subscription-status disconnected';
}

// ===========================================
// GraphQL Operations
// ===========================================

async function graphqlQuery<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
  const response = await fetch(GRAPHQL_HTTP, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  });

  const result = await response.json();

  if (result.errors) {
    throw new Error(result.errors[0].message);
  }

  return result.data;
}

// GraphQL Queries
const QUERY_COUNTER = `
  query GetCounter {
    counter {
      count
      controlStates
      step
    }
  }
`;

// GraphQL Mutations
const MUTATION_INCREMENT = `
  mutation Increment {
    increment {
      count
      controlStates
      step
    }
  }
`;

const MUTATION_DECREMENT = `
  mutation Decrement {
    decrement {
      success
      error
      representation {
        count
        controlStates
        step
      }
    }
  }
`;

const MUTATION_RESET = `
  mutation Reset {
    reset {
      count
      controlStates
      step
    }
  }
`;

// ===========================================
// Action Handlers
// ===========================================

declare global {
  interface Window {
    increment: () => void;
    decrement: () => void;
    reset: () => void;
  }
}

window.increment = async function increment() {
  try {
    const data = await graphqlQuery<{ increment: CounterRepresentation }>(MUTATION_INCREMENT);
    render(data.increment);
    console.log('[Mutation] increment ->', data.increment);
  } catch (error) {
    showError('Failed to increment');
  }
};

window.decrement = async function decrement() {
  try {
    const data = await graphqlQuery<{ decrement: DecrementResult }>(MUTATION_DECREMENT);
    if (data.decrement.success) {
      render(data.decrement.representation);
      console.log('[Mutation] decrement ->', data.decrement.representation);
    } else {
      showError(data.decrement.error || 'Decrement rejected');
      render(data.decrement.representation);
    }
  } catch (error) {
    showError('Failed to decrement');
  }
};

window.reset = async function reset() {
  try {
    const data = await graphqlQuery<{ reset: CounterRepresentation }>(MUTATION_RESET);
    render(data.reset);
    console.log('[Mutation] reset ->', data.reset);
  } catch (error) {
    showError('Failed to reset');
  }
};

// ===========================================
// WebSocket Subscription (Real-time NAP)
// ===========================================

function setupSubscription() {
  const ws = new WebSocket(GRAPHQL_WS, 'graphql-transport-ws');

  ws.onopen = () => {
    // Initialize connection
    ws.send(JSON.stringify({ type: 'connection_init' }));
  };

  ws.onmessage = (event) => {
    const message = JSON.parse(event.data);

    switch (message.type) {
      case 'connection_ack':
        // Connection acknowledged, subscribe
        setSubscriptionStatus(true);
        ws.send(
          JSON.stringify({
            id: '1',
            type: 'subscribe',
            payload: {
              query: `
                subscription OnCounterUpdated {
                  counterUpdated {
                    count
                    controlStates
                    step
                  }
                }
              `,
            },
          })
        );
        console.log('[Subscription] Connected and subscribed');
        break;

      case 'next':
        // Received subscription data
        if (message.payload?.data?.counterUpdated) {
          const representation = message.payload.data.counterUpdated;
          render(representation);
          console.log('[Subscription] counterUpdated ->', representation);
        }
        break;

      case 'error':
        console.error('[Subscription] Error:', message.payload);
        break;
    }
  };

  ws.onclose = () => {
    setSubscriptionStatus(false);
    console.log('[Subscription] Disconnected, reconnecting in 3s...');
    setTimeout(setupSubscription, 3000);
  };

  ws.onerror = (error) => {
    console.error('[Subscription] WebSocket error:', error);
  };
}

// ===========================================
// Initialize
// ===========================================

async function init() {
  try {
    // Fetch initial state via query
    const data = await graphqlQuery<{ counter: CounterRepresentation }>(QUERY_COUNTER);
    render(data.counter);
    console.log('[Query] Initial state:', data.counter);

    // Setup real-time subscription
    setupSubscription();
  } catch (error) {
    showError('Failed to connect to GraphQL server');
  }
}

init();
