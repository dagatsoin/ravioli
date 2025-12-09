# JSON-Based Container Configuration Example

This example demonstrates how to use Ravioli's JSON-based container configuration feature.

## What This Example Shows

- How to register reusable components (acceptors, actions, control state predicates, step reactions)
- How to create container configurations using JSON objects
- How to instantiate containers from JSON configurations
- Step reactions with conditional execution (`when` predicates)
- Auto-heal reaction triggered when health drops below 30%
- Multiple instances from the same factory with isolated state

## Features Demonstrated

### Acceptors
- `updateHP` - Updates player health with validation (0 to maxHP)
- `setName` - Updates player name

### Control State Predicates
- `isAlive` - Player has HP > 0
- `isDead` - Player has HP <= 0
- `isHealthy` - Player is at max HP
- `isWounded` - Player is damaged but alive

### Actions
- `takeDamage` - Reduces player HP
- `heal` - Increases player HP
- `rename` - Changes player name

### Step Reactions
- `logHealthChanges` - Logs HP changes to console
- `autoHeal` - Automatically heals player when HP drops below 30%

## Running the Example

### Prerequisites

This example uses the local distribution build of Ravioli. Before running the example, you need to build the main package:

```bash
# From the ravioli root directory
npm run build
```

### Running

```bash
# From the example-json-config directory
npm install
npm start  # This will automatically build the parent package
```

Or for development (skip the build step):

```bash
npm run dev  # Use this only if dist is already built
```

## Expected Output

You'll see a simulated game scenario where:
1. A hero and goblin are created
2. They battle each other
3. Auto-heal triggers when the hero's HP drops critically low
4. Health changes are logged throughout
5. Control states update based on HP levels

## Key Concepts

### Global Registry Pattern
Components are registered once and can be reused across multiple container configurations:

```typescript
registerAcceptor('updateHP', { ... });
registerAction('takeDamage', { ... });
```

### JSON Configuration
Container structure is defined declaratively:

```typescript
const config: ContainerConfig = {
  acceptors: { updateHP: 'updateHP' },
  actions: { takeDamage: 'takeDamage' },
  stepReactions: ['autoHeal']
};
```

### Factory Pattern
One factory creates multiple isolated instances:

```typescript
const playerFactory = createContainerFromJSON<Player>(config);
const hero = playerFactory.create({ hp: 100, maxHP: 100, name: 'Aragorn' });
const enemy = playerFactory.create({ hp: 50, maxHP: 50, name: 'Goblin' });
```

## Learn More

See the main [Ravioli README](../README.md) for complete documentation on the JSON-based container configuration feature.
