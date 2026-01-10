/**
 * Counter Client - View Layer
 *
 * SAM Pattern Placement:
 * - This is purely a VIEW - no local state!
 * - Displays the Representation received from server
 * - Sends action requests to server
 * - UI state (button disabled) derived from control states
 *
 * Key principle: Client NEVER mutates state locally.
 * All mutations happen on the server through Actions.
 */

const API_BASE = 'http://localhost:3333';

// ===========================================
// Types (mirror server's Representation)
// ===========================================

interface CounterRepresentation {
  count: number;
  controlStates: string[];
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

// ===========================================
// Render Function (Updates View from Representation)
// ===========================================

function render(representation: CounterRepresentation) {
  const { count, controlStates } = representation;

  // Update count display
  countDisplay.textContent = String(count);
  countDisplay.className = 'count-display';
  if (count < 0) countDisplay.classList.add('negative');
  if (count === 0) countDisplay.classList.add('zero');

  // Update button states based on control states
  // Client uses control states for UX, but server also enforces them
  btnDecrement.disabled = !controlStates.includes('CAN_DECREMENT');

  // Render control states badges
  controlStatesEl.innerHTML = controlStates.map((s) => `<span>${s}</span>`).join('');

  // Clear error message on successful render
  errorMessageEl.textContent = '';
}

function showError(message: string) {
  errorMessageEl.textContent = message;
}

function updateStepInfo(stepId: number) {
  stepInfoEl.textContent = `Step: ${stepId}`;
}

// ===========================================
// API Calls (Send Action Requests to Server)
// ===========================================

async function fetchRepresentation(): Promise<CounterRepresentation> {
  const response = await fetch(`${API_BASE}/counter`);
  return response.json();
}

async function sendAction(action: string, body?: object): Promise<CounterRepresentation | null> {
  try {
    const response = await fetch(`${API_BASE}/counter/${action}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });

    const data = await response.json();

    if (!response.ok) {
      // Server rejected the action (e.g., decrement at 0)
      showError(data.error || 'Action rejected');
      if (data.representation) {
        render(data.representation);
      }
      return null;
    }

    return data;
  } catch (error) {
    showError('Server connection failed');
    return null;
  }
}

// ===========================================
// Action Handlers (Called by UI)
// ===========================================

// Expose to window for onclick handlers
declare global {
  interface Window {
    increment: () => void;
    decrement: () => void;
    reset: () => void;
  }
}

window.increment = async function increment() {
  const representation = await sendAction('increment');
  if (representation) {
    render(representation);
    console.log('[Action] increment ->', representation);
  }
};

window.decrement = async function decrement() {
  const representation = await sendAction('decrement');
  if (representation) {
    render(representation);
    console.log('[Action] decrement ->', representation);
  }
};

window.reset = async function reset() {
  const representation = await sendAction('reset');
  if (representation) {
    render(representation);
    console.log('[Action] reset ->', representation);
  }
};

// ===========================================
// Initialize (Fetch Initial Representation)
// ===========================================

async function init() {
  try {
    const representation = await fetchRepresentation();
    render(representation);
    console.log('[Init] Loaded representation:', representation);

    // Also fetch debug info for step display
    const debug = await fetch(`${API_BASE}/counter/debug`).then((r) => r.json());
    updateStepInfo(debug.stepId);
  } catch (error) {
    showError('Failed to connect to server. Is it running on port 3333?');
  }
}

// Start
init();

// Poll for step updates (simple approach - could use WebSocket for real-time)
setInterval(async () => {
  try {
    const debug = await fetch(`${API_BASE}/counter/debug`).then((r) => r.json());
    updateStepInfo(debug.stepId);
  } catch {
    // Ignore polling errors
  }
}, 1000);
