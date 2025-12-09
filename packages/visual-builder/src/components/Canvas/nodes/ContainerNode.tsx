import React from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import { ContainerNodeData } from '../../../types/node.types';

/**
 * ContainerNode - Central hub node (non-deletable)
 * Has 4 input handles for different component types
 */
export default function ContainerNode({ data, selected }: NodeProps<ContainerNodeData>) {
  return (
    <div style={{
      background: 'white',
      border: selected ? '3px solid #64748b' : '2px solid #94a3b8',
      borderRadius: '12px',
      padding: '24px',
      minWidth: '220px',
      boxShadow: '0 4px 12px rgba(0,0,0,0.15)'
    }}>
      {/* Input handles for each component type */}
      <Handle
        type="target"
        position={Position.Left}
        id="acceptors"
        style={{ top: '25%', background: '#3b82f6', width: '12px', height: '12px' }}
        title="Acceptors"
      />
      <Handle
        type="target"
        position={Position.Left}
        id="actions"
        style={{ top: '50%', background: '#10b981', width: '12px', height: '12px' }}
        title="Actions"
      />
      <Handle
        type="target"
        position={Position.Left}
        id="controlStatePredicates"
        style={{ top: '75%', background: '#f59e0b', width: '12px', height: '12px' }}
        title="Control State Predicates"
      />
      <Handle
        type="target"
        position={Position.Bottom}
        id="stepReactions"
        style={{ background: '#8b5cf6', width: '12px', height: '12px' }}
        title="Step Reactions"
      />

      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: '20px', fontWeight: 'bold', marginBottom: '4px' }}>
          {data.containerName}
        </div>
        <div style={{ fontSize: '12px', color: '#64748b', fontWeight: '500' }}>
          CONTAINER CONFIG
        </div>
      </div>

      {/* Legend */}
      <div style={{ marginTop: '16px', fontSize: '11px', color: '#64748b' }}>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: '4px' }}>
          <div style={{ width: '8px', height: '8px', background: '#3b82f6', borderRadius: '50%', marginRight: '6px' }} />
          Acceptors
        </div>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: '4px' }}>
          <div style={{ width: '8px', height: '8px', background: '#10b981', borderRadius: '50%', marginRight: '6px' }} />
          Actions
        </div>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: '4px' }}>
          <div style={{ width: '8px', height: '8px', background: '#f59e0b', borderRadius: '50%', marginRight: '6px' }} />
          Predicates
        </div>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <div style={{ width: '8px', height: '8px', background: '#8b5cf6', borderRadius: '50%', marginRight: '6px' }} />
          Reactions
        </div>
      </div>
    </div>
  );
}
