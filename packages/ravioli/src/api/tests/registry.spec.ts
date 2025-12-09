import {
  registerAcceptor,
  registerControlStatePredicate,
  registerAction,
  registerStepReaction,
  getAcceptor,
  getControlStatePredicate,
  getAction,
  getStepReaction,
  clearRegistry
} from '../fromJSON/registry';

describe('Registry', () => {
  // Clear registry before each test to ensure isolation
  beforeEach(() => {
    clearRegistry();
  });

  // Also clear after all tests
  afterAll(() => {
    clearRegistry();
  });

  describe('Acceptors', () => {
    test('should register and retrieve an acceptor', () => {
      const acceptor = {
        mutator: (data: any, payload: any) => {
          data.value = payload;
        }
      };

      registerAcceptor('testAcceptor', acceptor);
      const retrieved = getAcceptor('testAcceptor');

      expect(retrieved).toBe(acceptor);
    });

    test('should throw error when registering duplicate acceptor', () => {
      const acceptor = {
        mutator: (data: any, payload: any) => {
          data.value = payload;
        }
      };

      registerAcceptor('testAcceptor', acceptor);

      expect(() => {
        registerAcceptor('testAcceptor', acceptor);
      }).toThrow("Acceptor 'testAcceptor' is already registered");
    });

    test('should throw error when getting non-existent acceptor', () => {
      expect(() => {
        getAcceptor('nonExistent');
      }).toThrow("Acceptor 'nonExistent' not found in registry");
    });

    test('should register acceptor with condition', () => {
      const acceptor = {
        condition: (data: any, payload: any) => payload > 0,
        mutator: (data: any, payload: any) => {
          data.value = payload;
        }
      };

      registerAcceptor('conditionalAcceptor', acceptor);
      const retrieved = getAcceptor('conditionalAcceptor');

      expect(retrieved).toBe(acceptor);
      expect(retrieved.condition).toBeDefined();
    });
  });

  describe('Control State Predicates', () => {
    test('should register and retrieve a control state predicate', () => {
      const predicate = ({ data }: any) => data.value > 0;

      registerControlStatePredicate('isPositive', predicate);
      const retrieved = getControlStatePredicate('isPositive');

      expect(retrieved).toBe(predicate);
    });

    test('should throw error when registering duplicate predicate', () => {
      const predicate = ({ data }: any) => data.value > 0;

      registerControlStatePredicate('isPositive', predicate);

      expect(() => {
        registerControlStatePredicate('isPositive', predicate);
      }).toThrow("Control state predicate 'isPositive' is already registered");
    });

    test('should throw error when getting non-existent predicate', () => {
      expect(() => {
        getControlStatePredicate('nonExistent');
      }).toThrow("Control state predicate 'nonExistent' not found in registry");
    });
  });

  describe('Actions', () => {
    test('should register and retrieve a sync action', () => {
      const action = () => [{ type: 'test', payload: {} }];

      registerAction('testAction', action);
      const retrieved = getAction('testAction');

      expect(retrieved).toBe(action);
    });

    test('should register and retrieve a string shortcut action', () => {
      const action = 'testMutation';

      registerAction('testAction', action);
      const retrieved = getAction('testAction');

      expect(retrieved).toBe(action);
    });

    test('should register and retrieve a configurable action', () => {
      const action = {
        isAllowed: ({ controlStates }: any) => controlStates.includes('READY'),
        isAsync: true,
        action: async () => [{ type: 'test', payload: {} }]
      };

      registerAction('testAction', action);
      const retrieved = getAction('testAction');

      expect(retrieved).toBe(action);
    });

    test('should throw error when registering duplicate action', () => {
      const action = () => [{ type: 'test', payload: {} }];

      registerAction('testAction', action);

      expect(() => {
        registerAction('testAction', action);
      }).toThrow("Action 'testAction' is already registered");
    });

    test('should throw error when getting non-existent action', () => {
      expect(() => {
        getAction('nonExistent');
      }).toThrow("Action 'nonExistent' not found in registry");
    });
  });

  describe('Step Reactions', () => {
    test('should register and retrieve a step reaction', () => {
      const reaction = {
        debugName: 'testReaction',
        when: ({ delta }: any) => delta.acceptedMutations.length > 0,
        do: ({ actions }: any) => {
          console.log('Reaction triggered');
        }
      };

      registerStepReaction('testReaction', reaction);
      const retrieved = getStepReaction('testReaction');

      expect(retrieved).toBe(reaction);
    });

    test('should register step reaction with once flag', () => {
      const reaction = {
        debugName: 'oneShot',
        once: true,
        do: ({ actions }: any) => {
          console.log('One-time reaction');
        }
      };

      registerStepReaction('oneShot', reaction);
      const retrieved = getStepReaction('oneShot');

      expect(retrieved).toBe(reaction);
      expect(retrieved.once).toBe(true);
    });

    test('should register step reaction with runOnInit flag', () => {
      const reaction = {
        debugName: 'noInit',
        runOnInit: false,
        do: ({ actions }: any) => {
          console.log('Skip on init');
        }
      };

      registerStepReaction('noInit', reaction);
      const retrieved = getStepReaction('noInit');

      expect(retrieved).toBe(reaction);
      expect(retrieved.runOnInit).toBe(false);
    });

    test('should throw error when registering duplicate step reaction', () => {
      const reaction = {
        do: ({ actions }: any) => {
          console.log('Test');
        }
      };

      registerStepReaction('testReaction', reaction);

      expect(() => {
        registerStepReaction('testReaction', reaction);
      }).toThrow("Step reaction 'testReaction' is already registered");
    });

    test('should throw error when getting non-existent step reaction', () => {
      expect(() => {
        getStepReaction('nonExistent');
      }).toThrow("Step reaction 'nonExistent' not found in registry");
    });
  });

  describe('clearRegistry', () => {
    test('should clear all registered components', () => {
      // Register components of each type
      registerAcceptor('acceptor1', { mutator: (data: any) => {} });
      registerControlStatePredicate('predicate1', ({ data }: any) => true);
      registerAction('action1', () => []);
      registerStepReaction('reaction1', { do: () => {} });

      // Verify they exist
      expect(getAcceptor('acceptor1')).toBeDefined();
      expect(getControlStatePredicate('predicate1')).toBeDefined();
      expect(getAction('action1')).toBeDefined();
      expect(getStepReaction('reaction1')).toBeDefined();

      // Clear registry
      clearRegistry();

      // Verify they're gone
      expect(() => getAcceptor('acceptor1')).toThrow();
      expect(() => getControlStatePredicate('predicate1')).toThrow();
      expect(() => getAction('action1')).toThrow();
      expect(() => getStepReaction('reaction1')).toThrow();
    });

    test('should allow re-registration after clearing', () => {
      const acceptor = { mutator: (data: any) => {} };

      registerAcceptor('test', acceptor);
      clearRegistry();

      // Should not throw
      expect(() => {
        registerAcceptor('test', acceptor);
      }).not.toThrow();
    });
  });

  describe('Multiple component registration', () => {
    test('should handle multiple acceptors', () => {
      const acceptor1 = { mutator: (data: any) => {} };
      const acceptor2 = { mutator: (data: any) => {} };
      const acceptor3 = { mutator: (data: any) => {} };

      registerAcceptor('acc1', acceptor1);
      registerAcceptor('acc2', acceptor2);
      registerAcceptor('acc3', acceptor3);

      expect(getAcceptor('acc1')).toBe(acceptor1);
      expect(getAcceptor('acc2')).toBe(acceptor2);
      expect(getAcceptor('acc3')).toBe(acceptor3);
    });

    test('should handle multiple control state predicates', () => {
      const pred1 = ({ data }: any) => data.value > 0;
      const pred2 = ({ data }: any) => data.value < 100;
      const pred3 = ({ data }: any) => data.value === 50;

      registerControlStatePredicate('positive', pred1);
      registerControlStatePredicate('lessThan100', pred2);
      registerControlStatePredicate('exactly50', pred3);

      expect(getControlStatePredicate('positive')).toBe(pred1);
      expect(getControlStatePredicate('lessThan100')).toBe(pred2);
      expect(getControlStatePredicate('exactly50')).toBe(pred3);
    });

    test('should handle multiple actions', () => {
      const action1 = () => [{ type: 'a1', payload: {} }];
      const action2 = () => [{ type: 'a2', payload: {} }];
      const action3 = 'shortcut';

      registerAction('action1', action1);
      registerAction('action2', action2);
      registerAction('action3', action3);

      expect(getAction('action1')).toBe(action1);
      expect(getAction('action2')).toBe(action2);
      expect(getAction('action3')).toBe(action3);
    });

    test('should handle multiple step reactions', () => {
      const reaction1 = { do: () => {} };
      const reaction2 = { do: () => {} };
      const reaction3 = { do: () => {} };

      registerStepReaction('reaction1', reaction1);
      registerStepReaction('reaction2', reaction2);
      registerStepReaction('reaction3', reaction3);

      expect(getStepReaction('reaction1')).toBe(reaction1);
      expect(getStepReaction('reaction2')).toBe(reaction2);
      expect(getStepReaction('reaction3')).toBe(reaction3);
    });
  });
});
