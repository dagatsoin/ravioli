import React from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import { StepReactionNodeData } from '../../../types/node.types';

/**
 * StepReactionNode - Purple nodes representing step reactions
 */
export default function StepReactionNode({ data, selected }: NodeProps<StepReactionNodeData>) {
  return (
    <div style={{
      background: '#e9d5ff',
      border: selected ? '2px solid #7c3aed' : '1px solid #c084fc',
      borderRadius: '10px',
      padding: '14px',
      minWidth: '180px',
      maxWidth: '250px',
      boxShadow: selected ? '0 4px 8px rgba(139, 92, 246, 0.3)' : '0 2px 4px rgba(0,0,0,0.1)'
    }}>
      <Handle
        type="source"
        position={Position.Right}
        style={{ background: '#8b5cf6', width: '10px', height: '10px' }}
      />

      <div>
        <div style={{
          fontWeight: 'bold',
          marginBottom: '6px',
          color: '#6b21a8',
          fontSize: '15px'
        }}>
          {data.label}
        </div>

        <div style={{
          fontSize: '12px',
          color: '#6b21a8',
          marginBottom: '4px',
          fontWeight: '500'
        }}>
          Order: <span style={{
            background: '#ddd6fe',
            padding: '2px 8px',
            borderRadius: '4px',
            fontSize: '11px',
            fontWeight: 'bold'
          }}>#{data.order}</span>
        </div>

        {data.description && (
          <div style={{
            fontSize: '11px',
            color: '#64748b',
            marginTop: '6px',
            lineHeight: '1.4'
          }}>
            {data.description}
          </div>
        )}

        <div style={{
          fontSize: '10px',
          color: '#581c87',
          marginTop: '8px',
          fontStyle: 'italic'
        }}>
          Step Reaction (Auto-triggered)
        </div>
      </div>
    </div>
  );
}
