# Visual Container Builder for Ravioli

> **Note:** This plan will be copied to `/Users/warfog/dev/ravioli/packages/visual-builder/IMPLEMENTATION_PLAN.md` once the package structure is created, for future reference.

## Overview

Create a new package `@warfog/ravioli-visual-builder` - a ComfyUI-inspired web app for visually building Ravioli containers. Users drag and drop pre-registered components (from a JSON asset library) onto a node graph canvas, connect them to a central container node, and export valid `ContainerConfig` JSON.

**Key Requirements:**
- React 19 web app with node-based visual editor
- **Use Ravioli itself for state management** (dog-fooding!)
- Asset store loaded from JSON file (defines available building blocks)
- Pure JSON builder - no code editing or runtime testing
- Exports valid ContainerConfig JSON ready for `createContainerFromJSON()`

**Key Innovation:** The visual builder **uses Ravioli to manage its own state**, demonstrating the library's power while providing a real-world example for users to learn from.

---

## Package Structure

**Location:** `/Users/warfog/dev/ravioli/packages/visual-builder/`

```
packages/visual-builder/
├── package.json
├── tsconfig.json
├── vite.config.ts
├── index.html
├── src/
│   ├── main.tsx                           # App entry point
│   ├── App.tsx                            # Root component with 3-panel layout
│   ├── types/
│   │   ├── asset.types.ts                 # Asset store schema (CRITICAL)
│   │   ├── node.types.ts                  # Node graph types
│   │   └── container.types.ts             # ContainerConfig extensions
│   ├── containers/
│   │   ├── graphContainer.ts              # Ravioli container - node/edge state (CRITICAL)
│   │   ├── assetContainer.ts              # Ravioli container - asset library state
│   │   └── appContainer.ts                # Main app container composition
│   ├── components/
│   │   ├── Layout/
│   │   │   └── MainLayout.tsx             # 3-panel layout (left/center/right)
│   │   ├── AssetPanel/
│   │   │   ├── AssetPanel.tsx             # Left panel - component library
│   │   │   └── AssetItem.tsx              # Draggable asset items
│   │   ├── Canvas/
│   │   │   ├── FlowCanvas.tsx             # ReactFlow wrapper (CRITICAL)
│   │   │   └── nodes/
│   │   │       ├── ContainerNode.tsx      # Central hub node (CRITICAL)
│   │   │       ├── AcceptorNode.tsx       # Blue nodes
│   │   │       ├── ActionNode.tsx         # Green nodes
│   │   │       ├── PredicateNode.tsx      # Yellow nodes
│   │   │       └── StepReactionNode.tsx   # Purple nodes
│   │   ├── Inspector/
│   │   │   └── NodeInspector.tsx          # Selected node details
│   │   └── Export/
│   │       ├── ExportPanel.tsx            # Right panel - JSON export
│   │       └── JSONPreview.tsx            # Formatted JSON display
│   ├── utils/
│   │   ├── graphToJSON.ts                 # Graph → ContainerConfig (CRITICAL)
│   │   ├── validation.ts                  # Connection rules
│   │   └── assetLoader.ts                 # Load/validate asset JSON
│   └── assets/
│       └── examples/
│           └── default-assets.json        # Sample asset library
└── README.md
```

---

## Technology Stack

**Core Dependencies:**
- `react` ^19.0.0 - UI framework (latest version)
- `react-dom` ^19.0.0
- `reactflow` ^11.10.0 - Node graph editor (industry standard)
- `@warfog/ravioli` workspace:* - State management AND ContainerConfig type
- `mobx` ^6.6.0 - Required peer dependency for Ravioli
- `mobx-react-lite` ^4.0.0 - React integration for MobX/Ravioli
- `lucide-react` ^0.294.0 - Icons

**Dev Dependencies:**
- `vite` ^5.0.0 - Modern build tool (faster than Parcel)
- `typescript` ^5.3.0 - Type safety
- `@vitejs/plugin-react` ^4.2.0 - React + Vite integration

**Key Decision: Use Ravioli for State Management**
- Dog-fooding: Visual builder uses the same library it helps create
- Demonstrates Ravioli's power for complex UI state
- Perfect example for users to learn from
- Leverages MobX reactivity for automatic UI updates

---

## Asset Store Schema

**File:** `src/types/asset.types.ts`

The asset library JSON defines all available building blocks. Structure:

```typescript
interface AssetLibrary {
  version: "1.0";
  metadata: { name: string; description?: string; author?: string };
  acceptors: AcceptorAsset[];
  actions: ActionAsset[];
  controlStatePredicates: PredicateAsset[];
  stepReactions: StepReactionAsset[];
}

interface AcceptorAsset {
  type: "acceptor";
  id: string;                    // Registry key
  name: string;                  // Display name
  mutationName: string;          // Mutation type string
  description?: string;
  category?: string;             // For organizing in panels
  payloadSchema?: JSONSchema;    // For documentation
  hasCondition: boolean;
}

interface ActionAsset {
  type: "action";
  id: string;
  name: string;
  parameters?: Parameter[];      // Function parameters
  produces: string[];            // Mutation names this action creates
  description?: string;
  category?: string;
}

interface PredicateAsset {
  type: "predicate";
  id: string;
  name: string;
  stateName: string;             // Control state name
  description?: string;
  category?: string;
}

interface StepReactionAsset {
  type: "stepReaction";
  id: string;
  name: string;
  hasCondition: boolean;
  triggers?: string[];           // Mutations that trigger this
  description?: string;
  category?: string;
}
```

**Example asset:** `assets/examples/default-assets.json` with RPG character components

---

## Node Graph Architecture

### Visual Node Types

1. **Container Node** (Central hub, one per graph)
   - Non-deletable
   - Has 4 input handles: acceptors, actions, controlStatePredicates, stepReactions
   - Shows summary of connected components
   - Color: White/gray

2. **Acceptor Node** (Blue)
   - Source node with right-side output handle
   - Displays: mutation name, payload schema preview
   - Connects to Container's "acceptors" input

3. **Action Node** (Green)
   - Source node with right-side output handle
   - Displays: action name, parameters, produced mutations
   - Connects to Container's "actions" input
   - Visual indicator for missing acceptor dependencies

4. **Predicate Node** (Yellow)
   - Source node with right-side output handle
   - Displays: state name
   - Connects to Container's "controlStatePredicates" input

5. **Step Reaction Node** (Purple)
   - Source node with right-side output handle
   - Displays: reaction name, order number
   - Connects to Container's "stepReactions" input
   - Shows which mutations trigger it

### Connection Rules

**Validation logic** (`src/utils/validation.ts`):
- Only connections TO the container node are allowed
- Each node type connects to specific handle on container
- No node-to-node connections (except to container)
- Connection type must match handle type

---

## Core Conversion Logic

**File:** `src/utils/graphToJSON.ts` (CRITICAL)

Function: `graphToContainerConfig(nodes, edges): ExportResult`

**Algorithm:**
1. Find container node (error if missing)
2. Follow edges to find all connected nodes
3. Build ContainerConfig object:
   - `acceptors`: Map connected acceptor nodes → `{ mappedName: assetId }`
   - `controlStatePredicates`: Map connected predicate nodes → `{ mappedName: assetId }`
   - `actions`: Map connected action nodes → `{ mappedName: assetId }`
   - `stepReactions`: Array of connected reaction nodes (sorted by order) → `[assetId, ...]`
4. Validate:
   - **Errors**: Missing container, invalid connections
   - **Warnings**: Actions referencing missing acceptors
5. Return `{ success, config, errors, warnings }`

**Key mapping:**
- Node `data.assetId` → Registry key (e.g., "updateHP")
- Node `data.mappedName` → ContainerConfig key (e.g., "setHealth")

---

## State Management with Ravioli Containers

**Key Architecture Decision:** Use Ravioli itself to manage the visual builder's state! This provides:
1. Perfect dog-fooding example
2. Demonstrates Ravioli's UI capabilities
3. Business rules enforced through acceptors
4. Automatic MobX reactivity for React components

### Graph Container (`src/containers/graphContainer.ts`) - CRITICAL

**Model Data:**
```typescript
interface GraphData {
  nodes: RavioliNode[];
  edges: RavioliEdge[];
  selectedNodeId: string | null;
}
```

**Acceptors (Mutations):**
- `addNode` - Add node to canvas, generate unique ID
- `removeNode` - Delete node (validates: can't delete container node)
- `updateNode` - Modify node data (mapped name, properties)
- `addEdge` - Add connection (validates: must be valid connection)
- `removeEdge` - Delete connection
- `setSelectedNode` - Update selection for inspector
- `clearGraph` - Reset to single container node

**Control State Predicates:**
- `HAS_CONTAINER_NODE` - At least one container exists
- `HAS_CONNECTIONS` - At least one edge exists
- `IS_VALID_GRAPH` - All connections valid

**Actions:**
- `addNodeFromAsset(asset)` - Create typed node from asset library item
- `connectNodes(source, target, handle)` - Validate and connect
- `deleteSelected()` - Remove selected node
- `resetCanvas()` - Clear all except container

**Step Reactions:**
- After `removeNode`: Update edges to remove orphaned connections
- After `addNode`: Auto-select new node
- After connection validation fails: Show error notification

**Representation:**
```typescript
{
  nodes: RavioliNode[];           // Reactive array
  edges: RavioliEdge[];           // Reactive array
  selectedNode: RavioliNode | null;
  canExport: boolean;             // Derived: graph is valid
  connectionCount: number;        // Derived
}
```

### Asset Container (`src/containers/assetContainer.ts`)

**Model Data:**
```typescript
interface AssetData {
  library: AssetLibrary | null;
  searchQuery: string;
  selectedCategory: string | null;
}
```

**Acceptors:**
- `setLibrary` - Load new asset library JSON
- `setSearchQuery` - Update search filter
- `setCategory` - Update category filter
- `clearFilters` - Reset to show all

**Actions:**
- `loadLibraryFromJSON(json)` - Validate and load assets
- `searchAssets(query)` - Update search
- `filterByCategory(category)` - Category filter

**Representation:**
```typescript
{
  library: AssetLibrary | null;
  filteredAssets: BaseAsset[];    // Derived: filtered by search + category
  categories: string[];           // Derived: unique categories
  assetCount: number;            // Derived
}
```

**Transformation:**
- Compute `filteredAssets` from library, searchQuery, and selectedCategory
- Extract unique categories for filter dropdown

### App Container Composition (`src/containers/appContainer.ts`)

**Purpose:** Compose graph and asset containers into single app-level container

```typescript
// The main app container orchestrates both sub-containers
const appContainer = createContainer<AppData>()
  .addAcceptor(/* ... */)
  .create({
    graph: graphContainer,
    assets: assetContainer,
    exportState: { isExporting: false, lastResult: null }
  });
```

This demonstrates **container composition** - a powerful Ravioli pattern!

### React Integration with MobX Observer

**Key Pattern:** Wrap React components with `observer()` from mobx-react-lite to auto-react to Ravioli representation changes.

**Example: AssetPanel Component**

```typescript
// src/components/AssetPanel/AssetPanel.tsx
import React from 'react';
import { observer } from 'mobx-react-lite';
import { assetContainer } from '../../containers/assetContainer';

// observer() makes component reactive to MobX observables (Ravioli representation)
export const AssetPanel = observer(() => {
  // Access reactive representation
  const { filteredAssets, categories } = assetContainer.representationRef.current;
  const { searchAssets, filterByCategory } = assetContainer.actions;

  return (
    <div className="asset-panel">
      <input
        type="text"
        placeholder="Search..."
        onChange={(e) => searchAssets({ query: e.target.value })}
      />

      <select onChange={(e) => filterByCategory({ category: e.target.value })}>
        <option value="">All Categories</option>
        {categories.map(cat => (
          <option key={cat} value={cat}>{cat}</option>
        ))}
      </select>

      {/* Automatically re-renders when filteredAssets changes */}
      {filteredAssets.map(asset => (
        <AssetItem key={asset.id} asset={asset} />
      ))}
    </div>
  );
});
```

**Example: FlowCanvas Component**

```typescript
// src/components/Canvas/FlowCanvas.tsx
import React from 'react';
import { observer } from 'mobx-react-lite';
import ReactFlow from 'reactflow';
import { graphContainer } from '../../containers/graphContainer';

export const FlowCanvas = observer(() => {
  // Reactive nodes and edges from Ravioli container
  const { nodes, edges } = graphContainer.representationRef.current;
  const { connectNodes } = graphContainer.actions;

  return (
    <ReactFlow
      nodes={nodes}           // Auto-updates when container state changes
      edges={edges}           // Auto-updates when container state changes
      onConnect={(params) => connectNodes(params)}
      // ... other props
    />
  );
});
```

**Why This Works:**
1. Ravioli representation uses MobX `observable`
2. `observer()` creates a MobX reaction that tracks accessed observables
3. When Ravioli actions mutate the model, representation updates
4. MobX triggers React re-render automatically
5. **Zero manual state synchronization needed!**

---

## Component Hierarchy

```
App.tsx (Main Layout) - Uses MobX observer
├── AssetPanel (Left) - observer(AssetPanel)
│   ├── Search input → assetContainer.actions.searchAssets()
│   ├── Category filter → assetContainer.actions.filterByCategory()
│   └── AssetItem[] (Draggable) → from assetContainer.representationRef.current.filteredAssets
├── FlowCanvas (Center) - observer(FlowCanvas)
│   ├── ReactFlow
│   │   ├── nodes={graphContainer.representationRef.current.nodes}
│   │   ├── edges={graphContainer.representationRef.current.edges}
│   │   ├── onConnect={graphContainer.actions.connectNodes}
│   │   ├── ContainerNode (always present)
│   │   ├── AcceptorNode[]
│   │   ├── ActionNode[]
│   │   ├── PredicateNode[]
│   │   └── StepReactionNode[]
│   ├── Controls (zoom, fit view)
│   ├── Background
│   └── MiniMap
└── RightPanel
    ├── NodeInspector (Top) - observer(NodeInspector)
    │   └── Edit selected node → graphContainer.actions.updateNode()
    └── ExportPanel (Bottom) - observer(ExportPanel)
        ├── Generate button → calls graphToJSON()
        ├── Validation errors/warnings
        ├── JSON preview
        └── Download button

Note: All components wrapped with mobx-react-lite's `observer()` for automatic reactivity
```

---

## User Workflow

1. **Start:** App loads with empty canvas (one container node) and default asset library
2. **Browse:** User searches/filters components in left panel
3. **Build:** Drag asset items onto canvas → creates typed nodes
4. **Connect:** Drag from node output handle → container input handle
5. **Configure:** Click node → edit properties in inspector (e.g., mapped names)
6. **Validate:** Click "Generate JSON" → see errors/warnings
7. **Export:** Download `container-config.json` or copy to clipboard

**Example exported JSON:**
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

---

## Build Configuration

### Vite Config (`vite.config.ts`)

```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') }
  },
  server: { port: 3000, open: true },
  build: { outDir: 'dist', sourcemap: true }
});
```

### TypeScript Config (`tsconfig.json`)

Extends root config, adds:
- `jsx: "react-jsx"`
- `lib: ["ES2020", "DOM", "DOM.Iterable"]`
- Path alias: `"@/*": ["./src/*"]`

### Package Scripts

```json
{
  "dev": "vite",
  "build": "tsc && vite build",
  "preview": "vite preview",
  "type-check": "tsc --noEmit"
}
```

---

## Monorepo Integration

**Update root `package.json`:**
```json
{
  "scripts": {
    "visual-builder": "yarn workspace @warfog/ravioli-visual-builder dev",
    "build:visual": "yarn workspace @warfog/ravioli-visual-builder build"
  }
}
```

**Run from root:**
```bash
yarn install              # Install all dependencies
yarn visual-builder       # Start dev server
```

---

## Implementation Sequence

### Phase 1: Foundation
1. Create package structure in `packages/visual-builder/`
2. Set up `package.json` with dependencies
3. Configure Vite, TypeScript, React
4. Create `src/types/asset.types.ts` with full schema
5. Create `assets/examples/default-assets.json` with RPG example

### Phase 2: Asset System
6. Implement `containers/assetContainer.ts` using Ravioli (load, search, filter)
7. Build `AssetPanel` component with search/filter UI (wrapped with observer)
8. Create `AssetItem` draggable components
9. Implement `utils/assetLoader.ts` (validate JSON schema)

### Phase 3: Canvas & Nodes
10. Set up ReactFlow in `Canvas/FlowCanvas.tsx` (wrapped with observer)
11. Create 5 custom node components (Container, Acceptor, Action, Predicate, StepReaction)
12. Implement `containers/graphContainer.ts` using Ravioli (acceptors, actions, validation)
13. Wire up drag-and-drop from AssetPanel to Canvas using container actions
14. Add connection validation logic in acceptors and step reactions

### Phase 4: Export System
15. Implement `utils/graphToJSON.ts` conversion logic
16. Build `ExportPanel` with validation display
17. Add JSON preview with syntax highlighting
18. Implement download functionality

### Phase 5: Polish
19. Create `NodeInspector` for editing properties
20. Add keyboard shortcuts (delete node, etc.)
21. Style with CSS (layout, colors, responsive)
22. Write comprehensive README with screenshots

---

## Critical Files to Implement (Priority Order)

1. **`src/types/asset.types.ts`** - Asset schema foundation
2. **`src/containers/graphContainer.ts`** - Ravioli container for graph state (CRITICAL)
3. **`src/containers/assetContainer.ts`** - Ravioli container for asset library
4. **`src/utils/graphToJSON.ts`** - Core conversion logic
5. **`src/components/Canvas/FlowCanvas.tsx`** - Main canvas (MobX observer)
6. **`src/components/Canvas/nodes/ContainerNode.tsx`** - Central hub node

---

## Validation Rules

**Connection Validation:**
- ✅ Source must be component node (not container)
- ✅ Target must be container node
- ✅ Handle type must match source type
- ✅ No duplicate connections (same node → same handle)

**Export Validation:**
- ❌ Error: No container node found
- ❌ Error: Invalid connection types
- ⚠️ Warning: Action references missing acceptor
- ⚠️ Warning: No components connected (empty container)
- ⚠️ Warning: Step reactions without conditions

---

## Design Principles (Aligned with Ravioli)

1. **Separation of Concerns**
   - Asset definitions separate from visual builder
   - UI doesn't execute containers (no runtime)
   - Clear model-view separation

2. **Simplicity First**
   - One container per graph
   - Simple drag-drop-connect workflow
   - No nested complexity

3. **Type Safety**
   - Full TypeScript coverage
   - Runtime JSON schema validation
   - Connection type checking

4. **Visual Clarity**
   - Color-coded nodes by type
   - Clear visual feedback for validation
   - Intuitive connection handles

---

## Out of Scope (Future Enhancements)

- Live container preview/testing (current: export-only)
- Code generation for registry functions
- Importing existing TypeScript registration code
- Multi-container composition
- Collaborative editing
- Version control integration
- Custom themes

---

## Example Asset Library

Create `src/assets/examples/default-assets.json`:

```json
{
  "version": "1.0",
  "metadata": {
    "name": "RPG Character Components",
    "description": "Building blocks for character containers",
    "author": "Ravioli Team"
  },
  "acceptors": [
    {
      "id": "updateHP",
      "type": "acceptor",
      "name": "Update HP",
      "mutationName": "updateHP",
      "description": "Modify character health points",
      "category": "Combat",
      "hasCondition": true,
      "payloadSchema": {
        "type": "object",
        "properties": {
          "hp": { "type": "number" }
        },
        "required": ["hp"]
      }
    }
  ],
  "actions": [
    {
      "id": "heal",
      "type": "action",
      "name": "Heal",
      "description": "Restore health points",
      "category": "Combat",
      "parameters": [
        { "name": "amount", "type": "number", "required": true }
      ],
      "produces": ["updateHP"]
    }
  ],
  "controlStatePredicates": [
    {
      "id": "isAlive",
      "type": "predicate",
      "name": "Is Alive",
      "stateName": "IS_ALIVE",
      "description": "Character has HP > 0",
      "category": "State"
    }
  ],
  "stepReactions": [
    {
      "id": "autoHeal",
      "type": "stepReaction",
      "name": "Auto Heal",
      "description": "Heal when HP is critically low",
      "category": "Effects",
      "hasCondition": true,
      "triggers": ["updateHP"]
    }
  ]
}
```

---

## Testing Strategy

**Manual Testing:**
1. Load default asset library
2. Drag each component type onto canvas
3. Connect all to container node
4. Generate JSON and verify structure
5. Test validation errors (missing container, invalid connections)
6. Test validation warnings (action without acceptor)
7. Download JSON and use with real Ravioli container

**Integration Test:**
- Export JSON from visual builder
- Use in example-json-config package
- Verify container works correctly

---

## Success Criteria

✅ Package builds and runs with `yarn visual-builder`
✅ Asset library loads from JSON file
✅ All 5 node types render with correct styling
✅ Drag-and-drop creates nodes on canvas
✅ Connections validate and display errors
✅ Export generates valid ContainerConfig JSON
✅ Downloaded JSON works with `createContainerFromJSON()`
✅ Validation shows helpful error messages
✅ README documents asset schema and usage

---

## File References

**Existing Files:**
- `/Users/warfog/dev/ravioli/packages/ravioli/src/api/fromJSON/containerConfig.ts` - ContainerConfig type
- `/Users/warfog/dev/ravioli/packages/ravioli/src/api/fromJSON/registry.ts` - Registry system
- `/Users/warfog/dev/ravioli/packages/ravioli/src/api/index.ts` - Public API exports

**New Package Location:**
- `/Users/warfog/dev/ravioli/packages/visual-builder/` - All new files here
