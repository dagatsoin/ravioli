import React from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import { PredicateNodeData } from '../../../types/node.types';

/**
 * PredicateNode - Yellow nodes representing control state predicates
 */
export default function PredicateNode({ data, selected }: NodeProps<PredicateNodeData>) {
  return (
    <div style={{
      background: '#fef3c7',
      border: selected ? '2px solid #d97706' : '1px solid #fde047',
      borderRadius: '10px',
      padding: '14px',
      minWidth: '180px',
      maxWidth: '250px',
      boxShadow: selected ? '0 4px 8px rgba(245, 158, 11, 0.3)' : '0 2px 4px rgba(0,0,0,0.1)'
    }}>
      <Handle
        type="source"
        position={Position.Right}
        style={{ background: '#f59e0b', width: '10px', height: '10px' }}
      />

      <div>
        <div style={{
          fontWeight: 'bold',
          marginBottom: '6px',
          color: '#92400e',
          fontSize: '15px'
        }}>
          {data.label}
        </div>

        <div style={{
          fontSize: '12px',
          color: '#92400e',
          marginBottom: '4px',
          fontWeight: '500'
        }}>
          State: <code style={{
            background: '#fde68a',
            padding: '2px 6px',
            borderRadius: '4px',
            fontSize: '11px'
          }}>{data.stateName}</code>
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
          color: '#78350f',
          marginTop: '8px',
          fontStyle: 'italic'
        }}>
          Control State Predicate
        </div>
      </div>
    </div>
  );
}
