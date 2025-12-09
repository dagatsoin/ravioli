/**
 * Example: JSON-Based Container Configuration
 *
 * This example demonstrates how to create Ravioli containers using JSON configuration.
 * Run with: npm start
 */

import {
  createContainerFromJSON,
  registerAcceptor,
  registerControlStatePredicate,
  registerAction,
  registerStepReaction,
  ContainerConfig
} from '../../dist';

// Define the data type
type Player = {
  hp: number;
  maxHP: number;
  name: string;
};

// ============================================
// Step 1: Register reusable components
// ============================================

console.log('📦 Registering components...\n');

// Register acceptors
registerAcceptor('updateHP', {
  condition: (data: Player, { hp }: { hp: number }) => {
    const newHP = data.hp + hp;
    return newHP >= 0 && newHP <= data.maxHP;
  },
  mutator: (data: Player, { hp }: { hp: number }) => {
    data.hp += hp;
  }
});

registerAcceptor('setName', {
  mutator: (data: Player, { name }: { name: string }) => {
    data.name = name;
  }
});

// Register control state predicates
registerControlStatePredicate('isAlive', ({ data }: { data: Player }) => data.hp > 0);
registerControlStatePredicate('isDead', ({ data }: { data: Player }) => data.hp <= 0);
registerControlStatePredicate('isHealthy', ({ data }: { data: Player }) => data.hp === data.maxHP);
registerControlStatePredicate('isWounded', ({ data }: { data: Player }) => data.hp < data.maxHP && data.hp > 0);

// Register actions
registerAction('takeDamage', ({ amount }: { amount: number }) => [
  { type: 'updateHP', payload: { hp: -amount } }
]);

registerAction('heal', ({ amount }: { amount: number }) => [
  { type: 'updateHP', payload: { hp: amount } }
]);

registerAction('rename', ({ name }: { name: string }) => [
  { type: 'setName', payload: { name } }
]);

// Register step reactions
registerStepReaction('logHealthChanges', {
  debugName: 'logHealthChanges',
  when: ({ delta }) => delta.acceptedMutations.some(m => m.type === 'updateHP'),
  do: ({ data }) => {
    console.log(`  💊 Health changed: ${(data as Player).hp}/${(data as Player).maxHP} HP`);
  }
});

registerStepReaction('autoHeal', {
  debugName: 'autoHeal',
  when: ({ delta, data }) => {
    const player = data as Player;
    return delta.acceptedMutations.some(m => m.type === 'updateHP' && m.payload.hp < 0) &&
           player.hp > 0 && player.hp < player.maxHP * 0.3;
  },
  do: ({ actions, data }) => {
    const healAmount = 10;
    console.log(`  ✨ Auto-heal triggered! Healing ${healAmount} HP`);
    (actions as any).heal({ amount: healAmount });
  }
});

// ============================================
// Step 2: Define JSON configuration
// ============================================

const playerConfig: ContainerConfig = {
  acceptors: {
    updateHP: 'updateHP',
    setName: 'setName'
  },
  controlStatePredicates: {
    IS_ALIVE: 'isAlive',
    IS_DEAD: 'isDead',
    IS_HEALTHY: 'isHealthy',
    IS_WOUNDED: 'isWounded'
  },
  actions: {
    takeDamage: 'takeDamage',
    heal: 'heal',
    rename: 'rename'
  },
  stepReactions: [
    'logHealthChanges',
    'autoHeal'
  ]
};

// ============================================
// Step 3: Create container from JSON
// ============================================

console.log('🏗️  Creating container from JSON config...\n');

const playerFactory = createContainerFromJSON<Player>(playerConfig);

// ============================================
// Step 4: Create and use instances
// ============================================

console.log('👤 Creating player instances...\n');

const hero = playerFactory.create({
  hp: 100,
  maxHP: 100,
  name: 'Aragorn'
});

const enemy = playerFactory.create({
  hp: 50,
  maxHP: 50,
  name: 'Goblin'
});

console.log(`\n🎮 Starting game simulation...\n`);
console.log(`${hero.representationRef.current.name}: ${hero.representationRef.current.hp} HP`);
console.log(`Control States: ${hero.controlStates.join(', ')}`);

console.log(`\n⚔️  ${hero.representationRef.current.name} attacks ${enemy.representationRef.current.name}!`);
(enemy.actions as any).takeDamage({ amount: 30 });
console.log(`${enemy.representationRef.current.name}: ${enemy.representationRef.current.hp} HP`);
console.log(`Control States: ${enemy.controlStates.join(', ')}`);

console.log(`\n💥 ${enemy.representationRef.current.name} critical hit on ${hero.representationRef.current.name}!`);
(hero.actions as any).takeDamage({ amount: 75 });
console.log(`${hero.representationRef.current.name}: ${hero.representationRef.current.hp} HP (auto-heal triggered!)`);
console.log(`Control States: ${hero.controlStates.join(', ')}`);

console.log(`\n🧪 ${hero.representationRef.current.name} drinks health potion!`);
(hero.actions as any).heal({ amount: 50 });
console.log(`${hero.representationRef.current.name}: ${hero.representationRef.current.hp} HP`);
console.log(`Control States: ${hero.controlStates.join(', ')}`);

console.log(`\n✨ ${hero.representationRef.current.name} fully healed!`);
(hero.actions as any).heal({ amount: 100 });
console.log(`${hero.representationRef.current.name}: ${hero.representationRef.current.hp} HP`);
console.log(`Control States: ${hero.controlStates.join(', ')}`);

console.log(`\n🎯 Final Stats:`);
console.log(`  ${hero.representationRef.current.name}: ${hero.representationRef.current.hp}/${hero.representationRef.current.maxHP} HP - ${hero.controlStates.join(', ')}`);
console.log(`  ${enemy.representationRef.current.name}: ${enemy.representationRef.current.hp}/${enemy.representationRef.current.maxHP} HP - ${enemy.controlStates.join(', ')}`);

console.log(`\n✅ JSON-based container configuration demo complete!`);
