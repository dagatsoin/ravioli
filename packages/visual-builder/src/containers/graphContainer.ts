/**
 * Graph Container - Manages the node graph state using Ravioli
 *
 * This is the CRITICAL container that demonstrates Ravioli's power:
 * - Business rules enforced through acceptors (can't delete container node, connection validation)
 * - High-level actions compose mutations
 * - Step reactions for automatic cleanup
 * - Reactive representation for React components
 */

import { createContainer } from '@warfog/ravioli';
import { RavioliNode, RavioliEdge, NodeType } from '../types/node.types';
import { Asset } from '../types/asset.types';

interface GraphData {
  nodes: RavioliNode[];
  edges: RavioliEdge[];
  selectedNodeId: string | null;
}

// Helper to generate unique IDs
let nodeCounter = 0;
function generateNodeId(type: NodeType): string {
  return `${type}-${++nodeCounter}`;
}

// Helper to validate connections
function isValidConnection(
  sourceType: NodeType,
  targetType: NodeType,
  targetHandle: string
): boolean {
  // Only connections TO the container node are allowed
  if (targetType !== 'container') return false;

  // Check handle matches node type
  const expectedHandles: Record<NodeType, string> = {
    acceptor: 'acceptors',
    action: 'actions',
    predicate: 'controlStatePredicates',
    stepReaction: 'stepReactions',
    container: '' // No outgoing connections
  };

  return targetHandle === expectedHandles[sourceType];
}

// Create the graph container with Ravioli
export const graphContainer = createContainer<GraphData>()
  // Acceptor: Add a node (no business rules, always allowed)
  .addAcceptor('addNode', {
    mutator(data, { node }: { node: RavioliNode }) {
      console.log('Adding node to graph:', node);
      data.nodes.push(node);
      console.log('Total nodes:', data.nodes.length);
    }
  })

  // Acceptor: Remove a node (with validation - can't delete container)
  .addAcceptor('removeNode', {
    condition(data, { nodeId }: { nodeId: string }) {
      const node = data.nodes.find(n => n.id === nodeId);
      // Prevent deletion of container node
      if (node && node.data.type === 'container') {
        console.warn('Cannot delete container node');
        return false;
      }
      return true;
    },
    mutator(data, { nodeId }: { nodeId: string }) {
      data.nodes = data.nodes.filter(n => n.id !== nodeId);
      // Remove connected edges
      data.edges = data.edges.filter(
        e => e.source !== nodeId && e.target !== nodeId
      );
      // Clear selection if deleted node was selected
      if (data.selectedNodeId === nodeId) {
        data.selectedNodeId = null;
      }
    }
  })

  // Acceptor: Update node data
  .addAcceptor('updateNode', {
    mutator(data, { nodeId, updates }: { nodeId: string; updates: any }) {
      const node = data.nodes.find(n => n.id === nodeId);
      if (node) {
        node.data = { ...node.data, ...updates };
      }
    }
  })

  // Acceptor: Update node position (for drag-and-drop)
  .addAcceptor('updateNodePosition', {
    mutator(data, { nodeId, position }: { nodeId: string; position: { x: number; y: number } }) {
      const node = data.nodes.find(n => n.id === nodeId);
      if (node) {
        node.position = position;
      }
    }
  })

  // Acceptor: Add an edge (with validation)
  .addAcceptor('addEdge', {
    condition(data, { edge }: { edge: RavioliEdge }) {
      // Find source and target nodes
      const sourceNode = data.nodes.find(n => n.id === edge.source);
      const targetNode = data.nodes.find(n => n.id === edge.target);

      if (!sourceNode || !targetNode) {
        console.warn('Invalid connection: node not found');
        return false;
      }

      // Validate connection rules
      const valid = isValidConnection(
        sourceNode.data.type,
        targetNode.data.type,
        edge.targetHandle || ''
      );

      if (!valid) {
        console.warn('Invalid connection: type mismatch');
      }

      return valid;
    },
    mutator(data, { edge }: { edge: RavioliEdge }) {
      data.edges.push(edge);
    }
  })

  // Acceptor: Remove an edge
  .addAcceptor('removeEdge', {
    mutator(data, { edgeId }: { edgeId: string }) {
      data.edges = data.edges.filter(e => e.id !== edgeId);
    }
  })

  // Acceptor: Set selected node
  .addAcceptor('setSelectedNode', {
    mutator(data, { nodeId }: { nodeId: string | null }) {
      data.selectedNodeId = nodeId;
    }
  })

  // Acceptor: Clear graph (keep only container node)
  .addAcceptor('clearGraph', {
    mutator(data) {
      const containerNode = data.nodes.find(n => n.data.type === 'container');
      data.nodes = containerNode ? [containerNode] : [];
      data.edges = [];
      data.selectedNodeId = null;
    }
  })

  // Control State Predicates
  .addControlStatePredicate('HAS_CONTAINER_NODE', ({ data }) =>
    data.nodes.some(n => n.data.type === 'container')
  )
  .addControlStatePredicate('HAS_CONNECTIONS', ({ data }) =>
    data.edges.length > 0
  )
  .addControlStatePredicate('IS_VALID_GRAPH', ({ data }) => {
    // Graph is valid if it has a container node and all connections are valid
    const hasContainer = data.nodes.some(n => n.data.type === 'container');
    if (!hasContainer) return false;

    // Check all edges are valid
    return data.edges.every(edge => {
      const sourceNode = data.nodes.find(n => n.id === edge.source);
      const targetNode = data.nodes.find(n => n.id === edge.target);
      if (!sourceNode || !targetNode) return false;
      return isValidConnection(
        sourceNode.data.type,
        targetNode.data.type,
        edge.targetHandle || ''
      );
    });
  })

  // High-level Actions
  .addActions({
    // Simple pass-through actions
    addNode: 'addNode',
    removeNode: 'removeNode',
    updateNode: 'updateNode',
    updateNodePosition: 'updateNodePosition',
    addEdge: 'addEdge',
    removeEdge: 'removeEdge',
    setSelectedNode: 'setSelectedNode',
    clearGraph: 'clearGraph'
  })

  // Add composite action: Add node from asset
  .addActions({
    addNodeFromAsset: ({ asset, position }: { asset: Asset; position: { x: number; y: number } }) => {
      console.log('addNodeFromAsset called with:', { asset, position });
      const nodeId = generateNodeId(asset.type);
      console.log('Generated node ID:', nodeId);

      let nodeData: any = {
        label: asset.name,
        assetId: asset.id,
        description: asset.description,
        category: asset.category
      };

      // Type-specific data
      switch (asset.type) {
        case 'acceptor':
          nodeData = {
            ...nodeData,
            type: 'acceptor',
            mutationName: asset.mutationName,
            mappedName: asset.mutationName, // Default to same name
            payloadSchema: asset.payloadSchema
          };
          break;
        case 'action':
          nodeData = {
            ...nodeData,
            type: 'action',
            actionName: asset.name,
            mappedName: asset.id, // Default to asset ID
            produces: asset.produces
          };
          break;
        case 'predicate':
          nodeData = {
            ...nodeData,
            type: 'predicate',
            stateName: asset.stateName,
            mappedName: asset.stateName // Default to same name
          };
          break;
        case 'stepReaction':
          nodeData = {
            ...nodeData,
            type: 'stepReaction',
            order: 0 // Will be updated based on connections
          };
          break;
      }

      const proposal = [
        {
          type: 'addNode' as const,
          payload: {
            node: {
              id: nodeId,
              type: asset.type,
              position,
              data: nodeData
            }
          }
        }
      ];

      console.log('Returning proposal:', proposal);
      return proposal;
    }
  })

  // Add composite action: Connect nodes with validation
  .addActions({
    connectNodes: (params: { source: string; target: string; sourceHandle?: string | null; targetHandle?: string | null }) => [
      {
        type: 'addEdge',
        payload: {
          edge: {
            id: `e${params.source}-${params.target}`,
            source: params.source,
            target: params.target,
            sourceHandle: params.sourceHandle || undefined,
            targetHandle: params.targetHandle || undefined
          }
        }
      }
    ]
  })

  // Transformation: Create reactive representation
  .addTransformation(({ data }) => {
    const selectedNode = data.selectedNodeId
      ? data.nodes.find(n => n.id === data.selectedNodeId) || null
      : null;

    // Return new array instances to trigger ReactFlow updates
    return {
      nodes: [...data.nodes],
      edges: [...data.edges],
      selectedNode,
      canExport: data.nodes.some(n => n.data.type === 'container'),
      connectionCount: data.edges.length
    };
  })

  // Initialize with single container node in center
  .create({
    nodes: [
      {
        id: 'container-1',
        type: 'container',
        position: { x: 400, y: 300 },
        data: {
          type: 'container',
          label: 'Container',
          assetId: 'container',
          containerName: 'MyContainer'
        }
      }
    ],
    edges: [],
    selectedNodeId: null
  });
