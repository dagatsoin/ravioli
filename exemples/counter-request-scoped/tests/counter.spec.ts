/**
 * Request-Scoped Counter Tests
 *
 * Verifies:
 * 1. Container is request-scoped (fresh each time)
 * 2. NAP automatically persists changes with stepId
 * 3. Step count preserved across requests via initialStepId (TEMPORAL LOGIC)
 * 4. Multi-tenant support
 * 5. Data AND stepId hydrated from DB
 */

import { jest } from '@jest/globals';
import { createCounterContainer, CounterInstance } from '../server/counter.js';
import { getCounter, getCachedCounter, clearCache } from '../server/counter-manager.js';
import { counterRepository, saveLog } from '../server/repository.js';

describe('Request-Scoped Counter with NAP Persistence', () => {
  beforeEach(async () => {
    // Clear everything before each test
    clearCache();
    await counterRepository.clear();
  });

  describe('Container Creation', () => {
    it('should create container with initial state', () => {
      const onSave = jest.fn<(id: string, count: number, stepId: number) => Promise<void>>();
      const counter = createCounterContainer('test-1', 0, 0, onSave);
      const rep = counter.representationRef.current;

      expect(rep.getId()).toBe('test-1');
      expect(rep.getCount()).toBe(0);
      expect(counter.stepId).toBe(0);
    });

    it('should create container with hydrated state and stepId', () => {
      const onSave = jest.fn<(id: string, count: number, stepId: number) => Promise<void>>();
      const counter = createCounterContainer('test-2', 42, 10, onSave);
      const rep = counter.representationRef.current;

      expect(rep.getId()).toBe('test-2');
      expect(rep.getCount()).toBe(42);
      expect(counter.stepId).toBe(10); // Hydrated stepId
    });
  });

  describe('Request-Scoped Behavior', () => {
    it('should create fresh container for each request (getCounter)', async () => {
      const counter1 = await getCounter('request-test');
      counter1.representationRef.current.actions.increment();
      await new Promise((r) => setTimeout(r, 20));

      const counter2 = await getCounter('request-test');

      // Different instances (request-scoped)
      expect(counter1).not.toBe(counter2);

      // But stepId preserved via DB hydration
      expect(counter2.stepId).toBe(1);
    });

    it('should support cached containers if needed (getCachedCounter)', async () => {
      const counter1 = await getCachedCounter('cached-test');
      const counter2 = await getCachedCounter('cached-test');

      expect(counter1).toBe(counter2); // Same instance when using cache
    });

    it('should return different containers for different tenants', async () => {
      const counterA = await getCounter('tenant-a');
      const counterB = await getCounter('tenant-b');

      expect(counterA).not.toBe(counterB);
    });
  });

  describe('Temporal Logic (Step Preservation via initialStepId)', () => {
    it('should increment step across multiple actions', async () => {
      const counter = await getCounter('step-test');
      const rep = counter.representationRef.current;

      expect(counter.stepId).toBe(0);

      rep.actions.increment();
      await new Promise((r) => setTimeout(r, 20));
      expect(counter.stepId).toBe(1);

      rep.actions.increment();
      await new Promise((r) => setTimeout(r, 20));
      expect(counter.stepId).toBe(2);

      rep.actions.increment();
      await new Promise((r) => setTimeout(r, 20));
      expect(counter.stepId).toBe(3);

      expect(rep.getCount()).toBe(3);
    });

    it('should preserve step count across multiple requests via DB', async () => {
      // Request 1: start at 0, increment
      const req1Counter = await getCounter('multi-request');
      expect(req1Counter.stepId).toBe(0);
      req1Counter.representationRef.current.actions.increment();
      await new Promise((r) => setTimeout(r, 20));
      expect(req1Counter.stepId).toBe(1);

      // Request 2: fresh container, but stepId hydrated from DB
      const req2Counter = await getCounter('multi-request');
      expect(req2Counter.stepId).toBe(1); // Hydrated from DB!
      req2Counter.representationRef.current.actions.increment();
      await new Promise((r) => setTimeout(r, 20));
      expect(req2Counter.stepId).toBe(2);

      // Request 3: stepId continues
      const req3Counter = await getCounter('multi-request');
      expect(req3Counter.stepId).toBe(2);
      expect(req3Counter.representationRef.current.getCount()).toBe(2);
    });
  });

  describe('NAP Persistence (Step Reaction with stepId)', () => {
    it('should automatically persist count AND stepId after increment', async () => {
      const counter = await getCounter('nap-test');
      const rep = counter.representationRef.current;

      expect(saveLog.length).toBe(0);

      rep.actions.increment();
      await new Promise((r) => setTimeout(r, 50));

      expect(saveLog.length).toBe(1);
      expect(saveLog[0].id).toBe('nap-test');
      expect(saveLog[0].count).toBe(1);
      expect(saveLog[0].stepId).toBe(1); // stepId also persisted!
    });

    it('should persist stepId with each action', async () => {
      const counter = await getCounter('multi-action');
      const rep = counter.representationRef.current;

      rep.actions.increment();
      await new Promise((r) => setTimeout(r, 20));

      rep.actions.increment();
      await new Promise((r) => setTimeout(r, 20));

      rep.actions.increment();
      await new Promise((r) => setTimeout(r, 20));

      // 3 saves (one per action)
      expect(saveLog.length).toBe(3);
      expect(saveLog[0].stepId).toBe(1);
      expect(saveLog[1].stepId).toBe(2);
      expect(saveLog[2].stepId).toBe(3);
    });

    it('should not persist if action is blocked', async () => {
      const counter = await getCounter('blocked');
      const rep = counter.representationRef.current;

      // Try to decrement at 0 (should be blocked)
      rep.actions.decrement();
      await new Promise((r) => setTimeout(r, 50));

      // No save should have occurred
      expect(saveLog.length).toBe(0);
      expect(rep.getCount()).toBe(0);
    });
  });

  describe('Hydration from DB (count AND stepId)', () => {
    it('should hydrate both count and stepId from DB', async () => {
      // Pre-populate DB with count AND stepId
      await counterRepository.save('hydrate-test', 100, 42);

      // Access counter - should hydrate from DB
      const counter = await getCounter('hydrate-test');
      expect(counter.representationRef.current.getCount()).toBe(100);
      expect(counter.stepId).toBe(42); // stepId also hydrated!
    });

    it('should start at 0 for both count and stepId if not in DB', async () => {
      const counter = await getCounter('new-counter');
      expect(counter.representationRef.current.getCount()).toBe(0);
      expect(counter.stepId).toBe(0);
    });
  });

  describe('Multi-Tenant Support', () => {
    it('should handle multiple counters independently', async () => {
      const counter1 = await getCounter('tenant-a');
      const counter2 = await getCounter('tenant-b');

      const rep1 = counter1.representationRef.current;
      const rep2 = counter2.representationRef.current;

      rep1.actions.increment();
      rep2.actions.addAmount({ amount: 5 });

      await new Promise((r) => setTimeout(r, 50));

      expect(rep1.getCount()).toBe(1);
      expect(rep2.getCount()).toBe(5);

      // Both should be persisted
      const saved = saveLog.filter((s) => s.id === 'tenant-a' || s.id === 'tenant-b');
      expect(saved.length).toBe(2);
    });

    it('should maintain separate step counts per tenant', async () => {
      // Tenant A: 3 actions
      let counterA = await getCounter('steps-a');
      counterA.representationRef.current.actions.increment();
      await new Promise((r) => setTimeout(r, 10));
      counterA = await getCounter('steps-a');
      counterA.representationRef.current.actions.increment();
      await new Promise((r) => setTimeout(r, 10));
      counterA = await getCounter('steps-a');
      counterA.representationRef.current.actions.increment();
      await new Promise((r) => setTimeout(r, 10));

      // Tenant B: 1 action
      const counterB = await getCounter('steps-b');
      counterB.representationRef.current.actions.increment();
      await new Promise((r) => setTimeout(r, 10));

      // Check final state
      const finalA = await getCounter('steps-a');
      const finalB = await getCounter('steps-b');

      expect(finalA.stepId).toBe(3); // 3 steps
      expect(finalB.stepId).toBe(1); // 1 step
    });
  });

  describe('Control States', () => {
    it('should compute control states correctly', async () => {
      // Pre-populate DB with count 5
      await counterRepository.save('control-test', 5, 0);

      const counter = await getCounter('control-test');

      expect(counter.controlStates).toContain('CAN_DECREMENT');
      expect(counter.controlStates).toContain('IS_POSITIVE');
      expect(counter.controlStates).not.toContain('IS_ZERO');
    });

    it('should update control states after mutations', async () => {
      // Start at 1
      await counterRepository.save('control-update', 1, 0);

      const counter = await getCounter('control-update');
      const rep = counter.representationRef.current;

      expect(counter.controlStates).toContain('CAN_DECREMENT');

      rep.actions.decrement();
      await new Promise((r) => setTimeout(r, 20));

      expect(counter.controlStates).toContain('IS_ZERO');
      expect(counter.controlStates).not.toContain('CAN_DECREMENT');
    });
  });
});
