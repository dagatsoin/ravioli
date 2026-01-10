/**
 * Counter Server - API Layer
 *
 * SAM Pattern Placement:
 * - This is the entry point for client requests
 * - Routes map to Actions in the service layer
 * - Only Representation crosses the network boundary
 * - Clients never see or modify raw state directly
 */

import express from 'express';
import cors from 'cors';
import { counterService } from './counter.service.js';

const app = express();
const PORT = 3333;

// Middleware
app.use(cors());
app.use(express.json());

// ===========================================
// API Routes
// ===========================================

/**
 * GET /counter
 * Returns current representation
 */
app.get('/counter', (_req, res) => {
  const representation = counterService.getRepresentation();
  res.json(representation);
});

/**
 * POST /counter/increment
 * Action: Increment counter
 */
app.post('/counter/increment', (_req, res) => {
  const representation = counterService.increment();
  console.log(`[Action] increment -> count: ${representation.count}`);
  res.json(representation);
});

/**
 * POST /counter/decrement
 * Action: Decrement counter (gated by CAN_DECREMENT)
 */
app.post('/counter/decrement', (_req, res) => {
  const result = counterService.decrement();

  if (!result.success) {
    console.log(`[Action] decrement REJECTED (count at ${result.representation.count})`);
    res.status(400).json({
      error: 'Cannot decrement below zero',
      representation: result.representation,
    });
    return;
  }

  console.log(`[Action] decrement -> count: ${result.representation.count}`);
  res.json(result.representation);
});

/**
 * POST /counter/reset
 * Action: Reset counter to zero
 */
app.post('/counter/reset', (_req, res) => {
  const representation = counterService.reset();
  console.log(`[Action] reset -> count: ${representation.count}`);
  res.json(representation);
});

/**
 * POST /counter/add
 * Action: Add arbitrary amount
 * Body: { amount: number }
 */
app.post('/counter/add', (req, res) => {
  const { amount } = req.body;

  if (typeof amount !== 'number') {
    res.status(400).json({ error: 'amount must be a number' });
    return;
  }

  const representation = counterService.addAmount(amount);
  console.log(`[Action] add(${amount}) -> count: ${representation.count}`);
  res.json(representation);
});

/**
 * GET /counter/debug
 * Debug endpoint showing internal state
 */
app.get('/counter/debug', (_req, res) => {
  res.json({
    representation: counterService.getRepresentation(),
    stepId: counterService.getStepId(),
  });
});

// ===========================================
// Start Server
// ===========================================

app.listen(PORT, () => {
  console.log(`
╔═══════════════════════════════════════════════════════════╗
║           Counter Server (SAM Pattern + Ravioli)          ║
╠═══════════════════════════════════════════════════════════╣
║  Listening on http://localhost:${PORT}                       ║
║                                                           ║
║  Endpoints:                                               ║
║    GET  /counter           - Get representation           ║
║    POST /counter/increment - Increment (+1)               ║
║    POST /counter/decrement - Decrement (-1, gated)        ║
║    POST /counter/reset     - Reset to 0                   ║
║    POST /counter/add       - Add amount { amount: n }     ║
║    GET  /counter/debug     - Debug info                   ║
╚═══════════════════════════════════════════════════════════╝
  `);
});
