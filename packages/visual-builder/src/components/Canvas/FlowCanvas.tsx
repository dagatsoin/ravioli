import React, { useCallback, useRef } from 'react';
import { observer } from 'mobx-react-lite';
import ReactFlow, {
  Controls,
  Background,
  MiniMap,
  Panel,
  Connection,
  NodeChange,
  EdgeChange,
  applyNodeChanges,
  applyEdgeChanges,
  useReactFlow,
  ReactFlowProvider
} from 'reactflow';
import { graphContainer } from '../../containers/graphContainer';
import { Asset } from '../../types/asset.types';

// Import custom node components
import ContainerNode from './nodes/ContainerNode';
import AcceptorNode from './nodes/AcceptorNode';
import ActionNode from './nodes/ActionNode';
import PredicateNode from './nodes/PredicateNode';
import StepReactionNode from './nodes/StepReactionNode';

// Register custom node types (defined outside component to prevent recreation)
const nodeTypes = {
  container: ContainerNode,
  acceptor: AcceptorNode,
  action: ActionNode,
  predicate: PredicateNode,
  stepReaction: StepReactionNode
};

/**
 * FlowCanvas - Main ReactFlow canvas (inner component with ReactFlow instance)
 */
const FlowCanvasInner = observer(() => {
  const { nodes, edges } = graphContainer.representationRef.current;
  const { connectNodes, updateNodePosition, setSelectedNode } = graphContainer.actions;
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const { screenToFlowPosition } = useReactFlow();

  // Handle node changes (position updates, deletions)
  const onNodesChange = useCallback((changes: NodeChange[]) => {
    // Apply changes using ReactFlow's helper
    const updatedNodes = applyNodeChanges(changes, nodes);

    // Update positions in container
    changes.forEach(change => {
      if (change.type === 'position' && change.position) {
        updateNodePosition({
          nodeId: change.id,
          position: change.position
        });
      }
    });
  }, [nodes, updateNodePosition]);

  // Handle edge changes
  const onEdgesChange = useCallback((changes: EdgeChange[]) => {
    // For now, just apply changes directly
    // You could add validation or custom logic here
    applyEdgeChanges(changes, edges);
  }, [edges]);

  // Handle new connections
  const onConnect = useCallback((params: Connection) => {
    if (params.source && params.target) {
      connectNodes({
        source: params.source,
        target: params.target,
        sourceHandle: params.sourceHandle,
        targetHandle: params.targetHandle
      });
    }
  }, [connectNodes]);

  // Handle node selection
  const onNodeClick = useCallback((_event: React.MouseEvent, node: any) => {
    setSelectedNode({ nodeId: node.id });
  }, [setSelectedNode]);

  // Handle pane click (deselect)
  const onPaneClick = useCallback(() => {
    setSelectedNode({ nodeId: null });
  }, [setSelectedNode]);

  // Handle drop from asset panel
  const onDrop = useCallback((event: React.DragEvent) => {
    event.preventDefault();

    const assetData = event.dataTransfer.getData('application/reactflow');
    if (!assetData) {
      console.warn('No asset data in drop event');
      return;
    }

    try {
      const asset: Asset = JSON.parse(assetData);
      console.log('Dropping asset:', asset);

      // Convert screen coordinates to flow coordinates (accounting for zoom/pan)
      const position = screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });

      console.log('Drop position:', position);

      // Add node via container action
      graphContainer.actions.addNodeFromAsset({ asset, position });
    } catch (error) {
      console.error('Failed to parse dropped asset:', error);
    }
  }, [screenToFlowPosition]);

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  return (
    <div ref={reactFlowWrapper} style={{ width: '100%', height: '100%' }} onDrop={onDrop} onDragOver={onDragOver}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeClick={onNodeClick}
        onPaneClick={onPaneClick}
        nodeTypes={nodeTypes}
        fitView
        snapToGrid
        snapGrid={[15, 15]}
      >
        <Controls />
        <Background />
        <MiniMap
          nodeColor={(node) => {
            switch (node.type) {
              case 'acceptor': return '#3b82f6';
              case 'action': return '#10b981';
              case 'predicate': return '#f59e0b';
              case 'stepReaction': return '#8b5cf6';
              case 'container': return '#64748b';
              default: return '#e2e8f0';
            }
          }}
        />

        <Panel position="top-left">
          <div style={{
            background: 'white',
            padding: '12px 16px',
            borderRadius: '8px',
            boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
            fontSize: '14px'
          }}>
            <strong>Ravioli Visual Builder</strong>
            <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>
              Drag components from the left panel to build your container
            </div>
          </div>
        </Panel>
      </ReactFlow>
    </div>
  );
});

/**
 * FlowCanvas wrapper with ReactFlowProvider
 */
const FlowCanvas = observer(() => {
  return (
    <ReactFlowProvider>
      <FlowCanvasInner />
    </ReactFlowProvider>
  );
});

export default FlowCanvas;
