# Ravioli Visual Builder

A ComfyUI-inspired visual node editor for building Ravioli containers. Drag and drop components, connect them visually, and export valid `ContainerConfig` JSON ready for use with `createContainerFromJSON()`.

## Key Features

- **Visual Node Editor**: Drag-and-drop interface powered by ReactFlow
- **Dog-fooding**: Built with Ravioli itself for state management
- **Asset Library**: Load components from JSON files
- **Type-Safe**: Full TypeScript support
- **Export Ready**: Generates valid ContainerConfig JSON
- **Validation**: Real-time error and warning detection

## Quick Start

### Running the Visual Builder

From the repository root:

```bash
# Install dependencies
yarn install

# Start the visual builder
yarn visual-builder
```

The app will open at `http://localhost:3000`

### Building for Production

```bash
yarn build:visual
```

## How It Works

### 1. Asset Library

The visual builder loads components from a JSON asset library. Components must be registered in your codebase using Ravioli's registry functions before the container can be used.

**Example asset library** (`src/assets/examples/default-assets.json`):

```json
{
  "version": "1.0",
  "metadata": {
    "name": "RPG Character Components",
    "description": "Building blocks for character containers"
  },
  "acceptors": [
    {
      "id": "updateHP",
      "type": "acceptor",
      "name": "Update HP",
      "mutationName": "updateHP",
      "description": "Modify character health points",
      "category": "Combat",
      "hasCondition": true
    }
  ],
  "actions": [
    {
      "id": "heal",
      "type": "action",
      "name": "Heal",
      "description": "Restore health points",
      "category": "Combat",
      "produces": ["updateHP"]
    }
  ],
  "controlStatePredicates": [...],
  "stepReactions": [...]
}
```

### 2. Visual Workflow

1. **Browse Components**: Search/filter in the left panel
2. **Drag to Canvas**: Drop components onto the central canvas
3. **Connect Nodes**: Drag from component output → container input
4. **Configure**: Click nodes to edit properties (mapped names)
5. **Export**: Generate and download ContainerConfig JSON

### 3. Node Types

- **Container Node** (Gray) - Central hub with 4 input handles
- **Acceptor Node** (Blue) - Mutations that modify model data
- **Action Node** (Green) - High-level operations
- **Predicate Node** (Yellow) - Control state conditions
- **Step Reaction Node** (Purple) - Auto-triggered effects

### 4. Export

The "Generate JSON" button produces a ContainerConfig like this:

```json
{
  "acceptors": {
    "updateHP": "updateHP",
    "addItem": "addItem"
  },
  "controlStatePredicates": {
    "IS_ALIVE": "isAlive",
    "IS_DEAD": "isDead"
  },
  "actions": {
    "heal": "heal",
    "takeDamage": "takeDamage"
  },
  "stepReactions": ["autoHeal"]
}
```

### 5. Using the Exported JSON

```typescript
import { createContainerFromJSON } from '@warfog/ravioli';
import config from './container-config.json';

// Register components first (see Ravioli docs)
registerAcceptor('updateHP', { /* ... */ });
registerAction('heal', () => [/* ... */]);
// ... register other components

// Create factory from JSON
const characterFactory = createContainerFromJSON<Character>(config);

// Create instances
const hero = characterFactory.create({ hp: 100, maxHP: 100, inventory: [] });
```

## Architecture: Dog-fooding with Ravioli

The visual builder **uses Ravioli itself** for state management, demonstrating the library's power:

### Asset Container (`src/containers/assetContainer.ts`)

Manages the asset library with search/filter:

```typescript
export const assetContainer = createContainer<AssetData>()
  .addAcceptor('setSearchQuery', { /* ... */ })
  .addActions({ searchAssets: 'setSearchQuery' })
  .addTransformation(({ data }) => ({
    filteredAssets: /* filter logic */
  }))
  .create({ library, searchQuery: '', selectedCategory: null });
```

### Graph Container (`src/containers/graphContainer.ts`)

Manages the node graph with validation:

```typescript
export const graphContainer = createContainer<GraphData>()
  .addAcceptor('removeNode', {
    condition: (data, { nodeId }) => {
      // Business rule: Can't delete container node
      const node = data.nodes.find(n => n.id === nodeId);
      return node?.data.type !== 'container';
    },
    mutator: /* ... */
  })
  .addControlStatePredicate('IS_VALID_GRAPH', ({ data }) => /* ... */)
  .addActions({ addNodeFromAsset: /* composite action */ })
  .create({ nodes: [containerNode], edges: [] });
```

### React Integration

Components use `observer()` from `mobx-react-lite` for automatic reactivity:

```typescript
const AssetPanel = observer(() => {
  const { filteredAssets } = assetContainer.representationRef.current;
  const { searchAssets } = assetContainer.actions;

  return (
    <input onChange={(e) => searchAssets({ query: e.target.value })} />
    {filteredAssets.map(asset => <AssetItem asset={asset} />)}
  );
});
```

## Asset Library Schema

### AssetLibrary Interface

```typescript
interface AssetLibrary {
  version: "1.0";
  metadata: {
    name: string;
    description?: string;
    author?: string;
  };
  acceptors: AcceptorAsset[];
  actions: ActionAsset[];
  controlStatePredicates: PredicateAsset[];
  stepReactions: StepReactionAsset[];
}
```

### Asset Types

**AcceptorAsset:**
```typescript
{
  id: string;              // Registry key
  type: "acceptor";
  name: string;            // Display name
  mutationName: string;    // Mutation type string
  description?: string;
  category?: string;
  hasCondition: boolean;
  payloadSchema?: object;  // JSON Schema for documentation
}
```

**ActionAsset:**
```typescript
{
  id: string;
  type: "action";
  name: string;
  description?: string;
  category?: string;
  parameters?: Array<{ name: string; type: string; required: boolean }>;
  produces: string[];      // Mutations this action creates
}
```

**PredicateAsset:**
```typescript
{
  id: string;
  type: "predicate";
  name: string;
  stateName: string;       // Control state name (e.g., "IS_ALIVE")
  description?: string;
  category?: string;
}
```

**StepReactionAsset:**
```typescript
{
  id: string;
  type: "stepReaction";
  name: string;
  description?: string;
  category?: string;
  hasCondition: boolean;
  triggers?: string[];     // Mutations that trigger this
}
```

## Validation & Warnings

The visual builder validates your configuration:

**Errors (prevent export):**
- ❌ Missing container node
- ❌ Invalid connection types

**Warnings (export allowed):**
- ⚠️ Actions referencing missing acceptors
- ⚠️ Empty container (no components)
- ⚠️ Orphaned nodes (not connected)

## Project Structure

```
packages/visual-builder/
├── src/
│   ├── types/
│   │   ├── asset.types.ts       # Asset schema definitions
│   │   └── node.types.ts        # ReactFlow node types
│   ├── containers/
│   │   ├── assetContainer.ts    # Ravioli container for assets
│   │   └── graphContainer.ts    # Ravioli container for graph
│   ├── components/
│   │   ├── AssetPanel/          # Left panel - component library
│   │   ├── Canvas/              # Center - ReactFlow canvas
│   │   │   └── nodes/           # 5 custom node components
│   │   └── Export/              # Right panel - JSON export
│   ├── utils/
│   │   └── graphToJSON.ts       # Graph → ContainerConfig converter
│   └── assets/
│       └── examples/
│           └── default-assets.json  # Sample asset library
└── IMPLEMENTATION_PLAN.md       # Detailed implementation plan
```

## Technology Stack

- **React 19** - UI framework
- **ReactFlow 11** - Node graph editor
- **Ravioli** - State management (dog-fooding!)
- **MobX 6** - Reactive state (required by Ravioli)
- **mobx-react-lite 4** - React-MobX integration
- **Vite 5** - Build tool
- **TypeScript 5** - Type safety

## Development

### Start Dev Server

```bash
cd packages/visual-builder
yarn dev
```

### Build

```bash
yarn build
```

### Type Check

```bash
yarn type-check
```

## Creating Custom Asset Libraries

1. Create a JSON file following the `AssetLibrary` schema
2. Register all components in your codebase:
   ```typescript
   import { registerAcceptor, registerAction /* ... */ } from '@warfog/ravioli';

   registerAcceptor('myMutation', { mutator: (data, payload) => { /* ... */ } });
   registerAction('myAction', () => [{ type: 'myMutation', payload: {} }]);
   ```

3. Load in visual builder (future: file upload feature)
4. Build your container visually
5. Export and use with `createContainerFromJSON()`

## Limitations

- **Export only**: No live container preview/testing
- **Single container**: One container per graph
- **Manual registration**: Components must be registered in code before runtime

## Future Enhancements

- 📤 Upload custom asset libraries
- 🔍 Live container preview with test data
- 🔗 Multi-container composition
- 📝 TypeScript code generation for registry
- 🎨 Custom themes and node styling
- 🔄 Import existing container code

## Contributing

This is part of the Ravioli monorepo. See the main project README for contribution guidelines.

## License

MIT

---

**Built with Ravioli** - A perfect example of dog-fooding! The visual builder uses Ravioli containers to manage its own state, demonstrating the library's power for complex UI applications.
