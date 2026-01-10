/**
 * Counter Tests - SAM Pattern Verification
 *
 * Tests verify:
 * 1. Acceptors perform atomic mutations
 * 2. Control states compute correctly
 * 3. Actions are gated by control states (isAllowed)
 * 4. Representation reflects current state
 * 5. Service layer correctly wraps the model
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

    it('should NOT have CAN_DECREMENT control state at 0', () => {
      expect(counter.controlStates).not.toContain('CAN_DECREMENT');
    });
  });

  describe('Acceptors (Atomic Mutations)', () => {
    it('add acceptor should modify count by amount', () => {
      const rep = counter.representationRef.current;
      // Access actions through representation
      rep.actions.addAmount({ amount: 5 });
      expect(rep.getCount()).toBe(5);
    });

    it('add acceptor should handle negative amounts', () => {
      const rep = counter.representationRef.current;
      rep.actions.addAmount({ amount: 10 });
      rep.actions.addAmount({ amount: -3 });
      expect(rep.getCount()).toBe(7);
    });
  });

  describe('Control States', () => {
    it('should have CAN_DECREMENT when count > 0', () => {
      const rep = counter.representationRef.current;
      rep.actions.increment();
      expect(counter.controlStates).toContain('CAN_DECREMENT');
      expect(counter.controlStates).toContain('IS_POSITIVE');
    });

    it('should have IS_ZERO when count === 0', () => {
      expect(counter.controlStates).toContain('IS_ZERO');
    });

    it('should have IS_NEGATIVE when count < 0', () => {
      const rep = counter.representationRef.current;
      rep.actions.addAmount({ amount: -5 });
      expect(counter.controlStates).toContain('IS_NEGATIVE');
    });

    it('should update control states after mutations', () => {
      const rep = counter.representationRef.current;

      // Initially at 0
      expect(counter.controlStates).toContain('IS_ZERO');
      expect(counter.controlStates).not.toContain('CAN_DECREMENT');

      // After increment
      rep.actions.increment();
      expect(counter.controlStates).not.toContain('IS_ZERO');
      expect(counter.controlStates).toContain('CAN_DECREMENT');

      // After decrement back to 0
      rep.actions.decrement();
      expect(counter.controlStates).toContain('IS_ZERO');
      expect(counter.controlStates).not.toContain('CAN_DECREMENT');
    });
  });

  describe('Actions', () => {
    it('increment should add 1', () => {
      const rep = counter.representationRef.current;
      rep.actions.increment();
      expect(rep.getCount()).toBe(1);
    });

    it('decrement should subtract 1 when allowed', () => {
      const rep = counter.representationRef.current;
      rep.actions.increment();
      rep.actions.increment();
      rep.actions.decrement();
      expect(rep.getCount()).toBe(1);
    });

    it('decrement should be gated by CAN_DECREMENT', () => {
      const rep = counter.representationRef.current;
      // At 0, decrement should not work
      rep.actions.decrement();
      expect(rep.getCount()).toBe(0); // Still 0, action was blocked
    });

    it('reset should set count to 0', () => {
      const rep = counter.representationRef.current;
      rep.actions.addAmount({ amount: 100 });
      rep.actions.reset();
      expect(rep.getCount()).toBe(0);
    });
  });

  describe('Representation', () => {
    it('should return correct count', () => {
      const rep = counter.representationRef.current;
      rep.actions.increment();
      rep.actions.increment();

      expect(rep.getCount()).toBe(2);
      expect(counter.controlStates).toContain('CAN_DECREMENT');
      expect(counter.controlStates).toContain('IS_POSITIVE');
    });

    it('representation should update after each action', () => {
      const rep = counter.representationRef.current;

      expect(rep.getCount()).toBe(0);
      rep.actions.increment();
      expect(rep.getCount()).toBe(1);
      rep.actions.increment();
      expect(rep.getCount()).toBe(2);
    });
  });

  describe('Step ID (SAM Concept)', () => {
    it('should increment stepId after each mutation', () => {
      const rep = counter.representationRef.current;
      const initialStep = counter.stepId;

      rep.actions.increment();
      expect(counter.stepId).toBe(initialStep + 1);

      rep.actions.increment();
      expect(counter.stepId).toBe(initialStep + 2);
    });
  });
});

describe('Counter Service (Actions Layer)', () => {
  let service: CounterService;

  beforeEach(() => {
    service = new CounterService();
  });

  describe('getRepresentation', () => {
    it('should return initial representation', () => {
      const rep = service.getRepresentation();
      expect(rep.count).toBe(0);
      expect(rep.controlStates).toContain('IS_ZERO');
    });
  });

  describe('increment', () => {
    it('should increment and return new representation', () => {
      const rep = service.increment();
      expect(rep.count).toBe(1);
    });

    it('should allow multiple increments', () => {
      service.increment();
      service.increment();
      const rep = service.increment();
      expect(rep.count).toBe(3);
    });
  });

  describe('decrement', () => {
    it('should fail when count is 0', () => {
      const result = service.decrement();
      expect(result.success).toBe(false);
      expect(result.representation.count).toBe(0);
    });

    it('should succeed when count > 0', () => {
      service.increment();
      service.increment();
      const result = service.decrement();
      expect(result.success).toBe(true);
      expect(result.representation.count).toBe(1);
    });
  });

  describe('reset', () => {
    it('should reset to 0', () => {
      service.increment();
      service.increment();
      service.increment();
      const rep = service.reset();
      expect(rep.count).toBe(0);
    });
  });

  describe('addAmount', () => {
    it('should add positive amount', () => {
      const rep = service.addAmount(10);
      expect(rep.count).toBe(10);
    });

    it('should add negative amount', () => {
      service.addAmount(10);
      const rep = service.addAmount(-3);
      expect(rep.count).toBe(7);
    });
  });
});
