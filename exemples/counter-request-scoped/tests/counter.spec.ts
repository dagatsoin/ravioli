/**
 * Singleton Counter Tests
 *
 * Verifies:
 * 1. Container is singleton per tenant
 * 2. NAP automatically persists changes
 * 3. Step count preserved across actions (TEMPORAL LOGIC)
 * 4. Multi-tenant support
 * 5. Data hydrated from DB on first access
 */

import { jest } from '@jest/globals';
import { createCounterContainer, CounterInstance } from '../server/counter.js';
import { counterManager } from '../server/counter-manager.js';
import { counterRepository, saveLog } from '../server/repository.js';

describe('Singleton Counter with NAP Persistence', () => {
  beforeEach(async () => {
    // Clear everything before each test
    counterManager.clear();
    await counterRepository.clear();
  });

  describe('Container Creation', () => {
    it('should create container with initial state', () => {
      const onSave = jest.fn();
      const counter = createCounterContainer('test-1', 0, onSave);
      const rep = counter.representationRef.current;

      expect(rep.getId()).toBe('test-1');
      expect(rep.getCount()).toBe(0);
      expect(counter.stepId).toBe(0);
    });

    it('should create container with hydrated state', () => {
      const onSave = jest.fn();
      const counter = createCounterContainer('test-2', 42, onSave);
      const rep = counter.representationRef.current;

      expect(rep.getId()).toBe('test-2');
      expect(rep.getCount()).toBe(42);
    });
  });

  describe('Singleton Behavior', () => {
    it('should return same container instance for same tenant', async () => {
      const counter1 = await counterManager.getCounter('singleton-test');
      const counter2 = await counterManager.getCounter('singleton-test');

      expect(counter1).toBe(counter2); // Same instance
    });

    it('should return different containers for different tenants', async () => {
      const counterA = await counterManager.getCounter('tenant-a');
      const counterB = await counterManager.getCounter('tenant-b');

      expect(counterA).not.toBe(counterB); // Different instances
    });
  });

  describe('Temporal Logic (Step Preservation)', () => {
    it('should increment step across multiple actions', async () => {
      const counter = await counterManager.getCounter('step-test');
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

      // Step count preserved: 0 → 1 → 2 → 3
      expect(counter.stepId).toBe(3);
      expect(rep.getCount()).toBe(3);
    });

    it('should maintain step count across multiple requests (simulated)', async () => {
      // Simulate multiple requests accessing same counter
      // All should see the same singleton with preserved step

      // Request 1
      const req1Counter = await counterManager.getCounter('multi-request');
      req1Counter.representationRef.current.actions.increment();
      await new Promise((r) => setTimeout(r, 20));

      // Request 2 (same tenant)
      const req2Counter = await counterManager.getCounter('multi-request');
      expect(req2Counter.stepId).toBe(1); // Step preserved from req1
      req2Counter.representationRef.current.actions.increment();
      await new Promise((r) => setTimeout(r, 20));

      // Request 3 (same tenant)
      const req3Counter = await counterManager.getCounter('multi-request');
      expect(req3Counter.stepId).toBe(2); // Step preserved from req1+req2
      expect(req3Counter.representationRef.current.getCount()).toBe(2);
    });
  });

  describe('NAP Persistence (Step Reaction)', () => {
    it('should automatically persist after increment', async () => {
      const counter = await counterManager.getCounter('nap-test');
      const rep = counter.representationRef.current;

      expect(saveLog.length).toBe(0);

      rep.actions.increment();
      await new Promise((r) => setTimeout(r, 50));

      expect(saveLog.length).toBe(1);
      expect(saveLog[0].id).toBe('nap-test');
      expect(saveLog[0].count).toBe(1);
    });

    it('should persist after each action', async () => {
      const counter = await counterManager.getCounter('multi-action');
      const rep = counter.representationRef.current;

      rep.actions.increment();
      await new Promise((r) => setTimeout(r, 20));

      rep.actions.increment();
      await new Promise((r) => setTimeout(r, 20));

      rep.actions.increment();
      await new Promise((r) => setTimeout(r, 20));

      // 3 saves (one per action)
      expect(saveLog.length).toBe(3);
      expect(saveLog[2].count).toBe(3);
    });

    it('should not persist if action is blocked', async () => {
      const counter = await counterManager.getCounter('blocked');
      const rep = counter.representationRef.current;

      // Try to decrement at 0 (should be blocked)
      rep.actions.decrement();
      await new Promise((r) => setTimeout(r, 50));

      // No save should have occurred
      expect(saveLog.length).toBe(0);
      expect(rep.getCount()).toBe(0);
    });
  });

  describe('Hydration from DB', () => {
    it('should hydrate state from DB on first access', async () => {
      // Pre-populate DB
      await counterRepository.save('hydrate-test', 100);

      // Clear manager to force re-hydration
      counterManager.clear();

      // Access counter - should hydrate from DB
      const counter = await counterManager.getCounter('hydrate-test');
      expect(counter.representationRef.current.getCount()).toBe(100);
    });

    it('should start at 0 if not in DB', async () => {
      const counter = await counterManager.getCounter('new-counter');
      expect(counter.representationRef.current.getCount()).toBe(0);
    });
  });

  describe('Multi-Tenant Support', () => {
    it('should handle multiple counters independently', async () => {
      const counter1 = await counterManager.getCounter('tenant-a');
      const counter2 = await counterManager.getCounter('tenant-b');

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
      const counterA = await counterManager.getCounter('steps-a');
      const counterB = await counterManager.getCounter('steps-b');

      // 3 actions on A
      counterA.representationRef.current.actions.increment();
      await new Promise((r) => setTimeout(r, 10));
      counterA.representationRef.current.actions.increment();
      await new Promise((r) => setTimeout(r, 10));
      counterA.representationRef.current.actions.increment();
      await new Promise((r) => setTimeout(r, 10));

      // 1 action on B
      counterB.representationRef.current.actions.increment();
      await new Promise((r) => setTimeout(r, 10));

      expect(counterA.stepId).toBe(3); // 3 steps
      expect(counterB.stepId).toBe(1); // 1 step
    });
  });

  describe('Control States', () => {
    it('should compute control states correctly', async () => {
      // Pre-populate DB with count 5
      await counterRepository.save('control-test', 5);
      counterManager.clear();

      const counter = await counterManager.getCounter('control-test');

      expect(counter.controlStates).toContain('CAN_DECREMENT');
      expect(counter.controlStates).toContain('IS_POSITIVE');
      expect(counter.controlStates).not.toContain('IS_ZERO');
    });

    it('should update control states after mutations', async () => {
      // Start at 1
      await counterRepository.save('control-update', 1);
      counterManager.clear();

      const counter = await counterManager.getCounter('control-update');
      const rep = counter.representationRef.current;

      expect(counter.controlStates).toContain('CAN_DECREMENT');

      rep.actions.decrement();
      await new Promise((r) => setTimeout(r, 20));

      expect(counter.controlStates).toContain('IS_ZERO');
      expect(counter.controlStates).not.toContain('CAN_DECREMENT');
    });
  });
});
