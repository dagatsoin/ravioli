/**
 * Counter GraphQL Tests
 *
 * Tests verify:
 * 1. Model works correctly (same as REST)
 * 2. Service returns correct representations
 * 3. Action gating works via control states
 */

import { Counter, createInitialCounter, CounterInstance } from '../server/counter.js';
import { CounterService } from '../server/counter.service.js';

describe('Counter Model (Ravioli Container)', () => {
  let counter: CounterInstance;

  beforeEach(() => {
    counter = Counter.create(createInitialCounter());
  });

  describe('Initial State', () => {
    it('should start with count of 0', () => {
      const rep = counter.representationRef.current;
      expect(rep.getCount()).toBe(0);
    });

    it('should have IS_ZERO control state initially', () => {
      expect(counter.controlStates).toContain('IS_ZERO');
    });

    it('should NOT have CAN_DECREMENT at 0', () => {
      expect(counter.controlStates).not.toContain('CAN_DECREMENT');
    });
  });

  describe('Actions', () => {
    it('increment should add 1', () => {
      const rep = counter.representationRef.current;
      rep.actions.increment();
      expect(rep.getCount()).toBe(1);
    });

    it('decrement should be gated', () => {
      const rep = counter.representationRef.current;
      rep.actions.decrement();
      expect(rep.getCount()).toBe(0); // Blocked
    });

    it('reset should set to 0', () => {
      const rep = counter.representationRef.current;
      rep.actions.addAmount({ amount: 50 });
      rep.actions.reset();
      expect(rep.getCount()).toBe(0);
    });
  });

  describe('Control States', () => {
    it('should update after mutations', () => {
      const rep = counter.representationRef.current;

      expect(counter.controlStates).toContain('IS_ZERO');
      rep.actions.increment();
      expect(counter.controlStates).toContain('CAN_DECREMENT');
      expect(counter.controlStates).not.toContain('IS_ZERO');
    });
  });
});

describe('Counter Service (GraphQL Actions Layer)', () => {
  let service: CounterService;

  beforeEach(() => {
    service = new CounterService();
  });

  describe('getRepresentation', () => {
    it('should return representation with step', () => {
      const rep = service.getRepresentation();
      expect(rep.count).toBe(0);
      expect(rep.controlStates).toContain('IS_ZERO');
      expect(rep.step).toBe(0);
    });
  });

  describe('increment mutation', () => {
    it('should increment and return new representation', () => {
      const rep = service.increment();
      expect(rep.count).toBe(1);
      expect(rep.step).toBe(1);
    });
  });

  describe('decrement mutation', () => {
    it('should return error when count is 0', () => {
      const result = service.decrement();
      expect(result.success).toBe(false);
      expect(result.error).toBe('Cannot decrement: counter is at zero');
      expect(result.representation.count).toBe(0);
    });

    it('should succeed when count > 0', () => {
      service.increment();
      service.increment();
      const result = service.decrement();
      expect(result.success).toBe(true);
      expect(result.error).toBeNull();
      expect(result.representation.count).toBe(1);
    });
  });

  describe('reset mutation', () => {
    it('should reset to 0', () => {
      service.increment();
      service.increment();
      const rep = service.reset();
      expect(rep.count).toBe(0);
      expect(rep.controlStates).toContain('IS_ZERO');
    });
  });

  describe('add mutation', () => {
    it('should add amount', () => {
      const rep = service.addAmount(10);
      expect(rep.count).toBe(10);
    });

    it('should handle negative amount', () => {
      service.addAmount(10);
      const rep = service.addAmount(-3);
      expect(rep.count).toBe(7);
    });
  });

  describe('step tracking', () => {
    it('should increment step with each action', () => {
      expect(service.getRepresentation().step).toBe(0);
      service.increment();
      expect(service.getRepresentation().step).toBe(1);
      service.increment();
      expect(service.getRepresentation().step).toBe(2);
      service.reset();
      expect(service.getRepresentation().step).toBe(3);
    });
  });
});
