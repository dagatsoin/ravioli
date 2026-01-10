import { createContainerFromJSON } from '../fromJSON/containerFromJSON';
import {
  registerAcceptor,
  registerControlStatePredicate,
  registerAction,
  registerStepReaction,
  clearRegistry
} from '../fromJSON/registry';
import { ContainerConfig } from '../fromJSON/containerConfig';

describe('createContainerFromJSON', () => {
  beforeEach(() => {
    clearRegistry();
  });

  afterAll(() => {
    clearRegistry();
  });

  describe('Basic container creation', () => {
    test('should create container with acceptors only', () => {
      // Register acceptor
      registerAcceptor('setHP', {
        mutator: (data: { hp: number }, { hp }: { hp: number }) => {
          data.hp = hp;
        }
      });

      // Create container from config
      const config: ContainerConfig = {
        acceptors: {
          setHP: 'setHP'
        }
      };

      const container = createContainerFromJSON<{ hp: number }>(config);

      // Verify container can be instantiated
      const instance = container.create({ hp: 100 });
      expect(instance).toBeDefined();
      expect(instance.representationRef.current.hp).toBe(100);
    });

    test('should create container with control state predicates only', () => {
      // Register predicate
      registerControlStatePredicate('isAlive', ({ data }: { data: { hp: number } }) => data.hp > 0);

      // Create container from config
      const config: ContainerConfig = {
        controlStatePredicates: {
          IS_ALIVE: 'isAlive'
        }
      };

      const container = createContainerFromJSON<{ hp: number }>(config);
      const instance = container.create({ hp: 100 });

      expect(instance.controlStates).toContain('IS_ALIVE');
    });

    test('should create container with actions only', () => {
      // Register action
      registerAction('doNothing', () => []);

      // Create container from config
      const config: ContainerConfig = {
        actions: {
          doNothing: 'doNothing'
        }
      };

      const container = createContainerFromJSON<{ hp: number }>(config);
      const instance = container.create({ hp: 100 });

      expect(instance.actions).toBeDefined();
      expect(typeof (instance.actions as any).doNothing).toBe('function');
    });

    test('should create container with step reactions only', () => {
      let reactionRan = false;

      // Register step reaction
      registerStepReaction('initReaction', {
        debugName: 'initReaction',
        do: () => {
          reactionRan = true;
        }
      });

      // Create container from config
      const config: ContainerConfig = {
        stepReactions: ['initReaction']
      };

      const container = createContainerFromJSON<{ hp: number }>(config);
      container.create({ hp: 100 });

      expect(reactionRan).toBe(true);
    });

    test('should create empty container with no config', () => {
      const config: ContainerConfig = {};

      const container = createContainerFromJSON<{ hp: number }>(config);
      const instance = container.create({ hp: 100 });

      expect(instance).toBeDefined();
      expect(instance.representationRef.current.hp).toBe(100);
    });
  });

  describe('Full container with all component types', () => {
    test('should create container with acceptors, predicates, actions, and reactions', () => {
      let reactionCount = 0;

      // Register all components
      registerAcceptor('setHP', {
        mutator: (data: { hp: number }, { hp }: { hp: number }) => {
          data.hp = hp;
        }
      });

      registerControlStatePredicate('isAlive', ({ data }: { data: { hp: number } }) => data.hp > 0);
      registerControlStatePredicate('isDead', ({ data }: { data: { hp: number } }) => data.hp <= 0);

      registerAction('heal', () => [{ type: 'setHP', payload: { hp: 100 } }]);
      registerAction('damage', () => [{ type: 'setHP', payload: { hp: 0 } }]);

      registerStepReaction('countChanges', {
        debugName: 'countChanges',
        do: () => {
          reactionCount++;
        }
      });

      // Create container from config
      const config: ContainerConfig = {
        acceptors: {
          setHP: 'setHP'
        },
        controlStatePredicates: {
          IS_ALIVE: 'isAlive',
          IS_DEAD: 'isDead'
        },
        actions: {
          heal: 'heal',
          damage: 'damage'
        },
        stepReactions: ['countChanges']
      };

      const container = createContainerFromJSON<{ hp: number }>(config);
      const instance = container.create({ hp: 50 });

      // Verify control states
      expect(instance.controlStates).toContain('IS_ALIVE');
      expect(instance.controlStates).not.toContain('IS_DEAD');

      // Verify actions work
      (instance.actions as any).damage();
      expect(instance.representationRef.current.hp).toBe(0);
      expect(instance.controlStates).toContain('IS_DEAD');

      (instance.actions as any).heal();
      expect(instance.representationRef.current.hp).toBe(100);
      expect(instance.controlStates).toContain('IS_ALIVE');

      // Verify reactions ran (init + damage + heal = 3)
      expect(reactionCount).toBe(3);
    });
  });

  describe('Action shortcuts', () => {
    test('should support string shortcut actions', () => {
      // Register acceptor
      registerAcceptor('setHP', {
        mutator: (data: { hp: number }, { hp }: { hp: number }) => {
          data.hp = hp;
        }
      });

      // Register action as string shortcut to acceptor
      registerAction('setHP_shortcut', 'setHP');

      // Create container
      const config: ContainerConfig = {
        acceptors: {
          setHP: 'setHP'
        },
        actions: {
          setHP: 'setHP_shortcut'
        }
      };

      const container = createContainerFromJSON<{ hp: number }>(config);
      const instance = container.create({ hp: 100 });

      (instance.actions as any).setHP({ hp: 50 });
      expect(instance.representationRef.current.hp).toBe(50);
    });
  });

  describe('Step reactions with different configurations', () => {
    test('should support once flag in step reactions', () => {
      let runCount = 0;

      registerStepReaction('onceReaction', {
        once: true,
        do: () => {
          runCount++;
        }
      });

      registerAcceptor('increment', {
        mutator: (data: { count: number }) => {
          data.count++;
        }
      });

      registerAction('inc', () => [{ type: 'increment', payload: {} }]);

      const config: ContainerConfig = {
        acceptors: { increment: 'increment' },
        actions: { inc: 'inc' },
        stepReactions: ['onceReaction']
      };

      const container = createContainerFromJSON<{ count: number }>(config);
      const instance = container.create({ count: 0 });

      // Reaction runs on init
      expect(runCount).toBe(1);

      // Trigger multiple actions
      (instance.actions as any).inc();
      (instance.actions as any).inc();
      (instance.actions as any).inc();

      // Reaction should only have run once (on init)
      expect(runCount).toBe(1);
    });

    test('should support runOnInit flag', () => {
      let runCount = 0;

      registerStepReaction('noInitReaction', {
        runOnInit: false,
        do: () => {
          runCount++;
        }
      });

      registerAcceptor('increment', {
        mutator: (data: { count: number }) => {
          data.count++;
        }
      });

      registerAction('inc', () => [{ type: 'increment', payload: {} }]);

      const config: ContainerConfig = {
        acceptors: { increment: 'increment' },
        actions: { inc: 'inc' },
        stepReactions: ['noInitReaction']
      };

      const container = createContainerFromJSON<{ count: number }>(config);
      const instance = container.create({ count: 0 });

      // Reaction should not run on init
      expect(runCount).toBe(0);

      // Trigger action
      (instance.actions as any).inc();

      // Now reaction should have run
      expect(runCount).toBe(1);
    });

    test('should support conditional reactions with when predicate', () => {
      let reactionRan = false;

      registerStepReaction('conditionalReaction', {
        when: ({ delta }: any) => delta.acceptedMutations.some((m: any) => m.type === 'setHP'),
        do: () => {
          reactionRan = true;
        }
      });

      registerAcceptor('setHP', {
        mutator: (data: { hp: number }, { hp }: { hp: number }) => {
          data.hp = hp;
        }
      });

      registerAcceptor('setName', {
        mutator: (data: any, { name }: { name: string }) => {
          data.name = name;
        }
      });

      registerAction('changeHP', () => [{ type: 'setHP', payload: { hp: 50 } }]);
      registerAction('changeName', () => [{ type: 'setName', payload: { name: 'test' } }]);

      const config: ContainerConfig = {
        acceptors: {
          setHP: 'setHP',
          setName: 'setName'
        },
        actions: {
          changeHP: 'changeHP',
          changeName: 'changeName'
        },
        stepReactions: ['conditionalReaction']
      };

      const container = createContainerFromJSON<{ hp: number; name: string }>(config);
      const instance = container.create({ hp: 100, name: 'player' });

      reactionRan = false;

      // This should NOT trigger the reaction
      (instance.actions as any).changeName();
      expect(reactionRan).toBe(false);

      // This SHOULD trigger the reaction
      (instance.actions as any).changeHP();
      expect(reactionRan).toBe(true);
    });
  });

  describe('Error handling', () => {
    test('should throw error for missing acceptor', () => {
      const config: ContainerConfig = {
        acceptors: {
          setHP: 'nonExistentAcceptor'
        }
      };

      expect(() => {
        createContainerFromJSON<{ hp: number }>(config);
      }).toThrow("Acceptor 'nonExistentAcceptor' not found in registry");
    });

    test('should throw error for missing predicate', () => {
      const config: ContainerConfig = {
        controlStatePredicates: {
          IS_ALIVE: 'nonExistentPredicate'
        }
      };

      expect(() => {
        createContainerFromJSON<{ hp: number }>(config);
      }).toThrow("Control state predicate 'nonExistentPredicate' not found in registry");
    });

    test('should throw error for missing action', () => {
      const config: ContainerConfig = {
        actions: {
          heal: 'nonExistentAction'
        }
      };

      expect(() => {
        createContainerFromJSON<{ hp: number }>(config);
      }).toThrow("Action 'nonExistentAction' not found in registry");
    });

    test('should throw error for missing step reaction', () => {
      const config: ContainerConfig = {
        stepReactions: ['nonExistentReaction']
      };

      expect(() => {
        createContainerFromJSON<{ hp: number }>(config);
      }).toThrow("Step reaction 'nonExistentReaction' not found in registry");
    });
  });

  describe('Multiple instances from same factory', () => {
    test('should create isolated instances from JSON factory', () => {
      // Register components
      registerAcceptor('setHP', {
        mutator: (data: { hp: number }, { hp }: { hp: number }) => {
          data.hp = hp;
        }
      });

      registerAction('heal', () => [{ type: 'setHP', payload: { hp: 100 } }]);
      registerAction('damage', () => [{ type: 'setHP', payload: { hp: 0 } }]);

      // Create factory
      const config: ContainerConfig = {
        acceptors: { setHP: 'setHP' },
        actions: { heal: 'heal', damage: 'damage' }
      };

      const playerFactory = createContainerFromJSON<{ hp: number }>(config);

      // Create multiple instances
      const player1 = playerFactory.create({ hp: 100 });
      const player2 = playerFactory.create({ hp: 50 });

      // Modify player1
      (player1.actions as any).damage();

      // Verify isolation
      expect(player1.representationRef.current.hp).toBe(0);
      expect(player2.representationRef.current.hp).toBe(50);

      // Modify player2
      (player2.actions as any).heal();

      // Verify isolation again
      expect(player1.representationRef.current.hp).toBe(0);
      expect(player2.representationRef.current.hp).toBe(100);
    });
  });

  describe('Complex integration test', () => {
    test('should handle game character with health, inventory, and auto-heal', () => {
      type Character = {
        hp: number;
        maxHP: number;
        inventory: string[];
      };

      let autoHealCount = 0;

      // Register acceptors
      registerAcceptor('updateHP', {
        condition: (data: Character, { hp }: { hp: number }) => {
          const newHP = data.hp + hp;
          return newHP >= 0 && newHP <= data.maxHP;
        },
        mutator: (data: Character, { hp }: { hp: number }) => {
          data.hp += hp;
        }
      });

      registerAcceptor('addItem', {
        mutator: (data: Character, { item }: { item: string }) => {
          data.inventory.push(item);
        }
      });

      // Register predicates
      registerControlStatePredicate('isAlive', ({ data }: { data: Character }) => data.hp > 0);
      registerControlStatePredicate('isDead', ({ data }: { data: Character }) => data.hp <= 0);
      registerControlStatePredicate('isHealthy', ({ data }: { data: Character }) => data.hp === data.maxHP);

      // Register actions
      registerAction('takeDamage', ({ amount }: { amount: number }) => [
        { type: 'updateHP', payload: { hp: -amount } }
      ]);

      registerAction('heal', ({ amount }: { amount: number }) => [
        { type: 'updateHP', payload: { hp: amount } }
      ]);

      registerAction('pickupItem', ({ item }: { item: string }) => [
        { type: 'addItem', payload: { item } }
      ]);

      // Register step reaction for auto-heal
      registerStepReaction('autoHeal', {
        debugName: 'autoHeal',
        when: ({ delta, data }: any) =>
          delta.acceptedMutations.some((m: any) => m.type === 'updateHP' && m.payload.hp < 0) &&
          data.hp > 0 && data.hp < data.maxHP * 0.3,
        do: ({ actions }: any) => {
          autoHealCount++;
          actions.heal({ amount: 10 });
        }
      });

      // Create container
      const config: ContainerConfig = {
        acceptors: {
          updateHP: 'updateHP',
          addItem: 'addItem'
        },
        controlStatePredicates: {
          IS_ALIVE: 'isAlive',
          IS_DEAD: 'isDead',
          IS_HEALTHY: 'isHealthy'
        },
        actions: {
          takeDamage: 'takeDamage',
          heal: 'heal',
          pickupItem: 'pickupItem'
        },
        stepReactions: ['autoHeal']
      };

      const characterFactory = createContainerFromJSON<Character>(config);
      const hero = characterFactory.create({ hp: 100, maxHP: 100, inventory: [] });

      // Initial state
      expect(hero.controlStates).toContain('IS_ALIVE');
      expect(hero.controlStates).toContain('IS_HEALTHY');
      expect(hero.representationRef.current.hp).toBe(100);

      // Take damage
      (hero.actions as any).takeDamage({ amount: 50 });
      expect(hero.representationRef.current.hp).toBe(50);
      expect(hero.controlStates).toContain('IS_ALIVE');

      // Take more damage to trigger auto-heal (< 30% health)
      (hero.actions as any).takeDamage({ amount: 30 });
      // HP becomes 20, auto-heal triggers adding 10, final HP = 30
      expect(hero.representationRef.current.hp).toBe(30);
      expect(autoHealCount).toBe(1);

      // Pickup items
      (hero.actions as any).pickupItem({ item: 'sword' });
      (hero.actions as any).pickupItem({ item: 'shield' });
      expect(hero.representationRef.current.inventory).toEqual(['sword', 'shield']);

      // Heal to full
      (hero.actions as any).heal({ amount: 70 });
      expect(hero.representationRef.current.hp).toBe(100);
      expect(hero.controlStates).toContain('IS_HEALTHY');
    });
  });
});
