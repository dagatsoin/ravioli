import React from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import { AcceptorNodeData } from '../../../types/node.types';

/**
 * AcceptorNode - Blue nodes representing mutations
 */
export default function AcceptorNode({ data, selected }: NodeProps<AcceptorNodeData>) {
  return (
    <div style={{
      background: '#dbeafe',
      border: selected ? '2px solid #2563eb' : '1px solid #93c5fd',
      borderRadius: '10px',
      padding: '14px',
      minWidth: '180px',
      maxWidth: '250px',
      boxShadow: selected ? '0 4px 8px rgba(59, 130, 246, 0.3)' : '0 2px 4px rgba(0,0,0,0.1)'
    }}>
      <Handle
        type="source"
        position={Position.Right}
        style={{ background: '#3b82f6', width: '10px', height: '10px' }}
      />

      <div>
        <div style={{
          fontWeight: 'bold',
          marginBottom: '6px',
          color: '#1e40af',
          fontSize: '15px'
        }}>
          {data.label}
        </div>

        <div style={{
          fontSize: '12px',
          color: '#1e40af',
          marginBottom: '4px',
          fontWeight: '500'
        }}>
          Mutation: <code style={{
            background: '#bfdbfe',
            padding: '2px 6px',
            borderRadius: '4px',
            fontSize: '11px'
          }}>{data.mutationName}</code>
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

        {data.payloadSchema && (
          <div style={{
            fontSize: '10px',
            color: '#475569',
            marginTop: '6px',
            padding: '4px 6px',
            background: '#f1f5f9',
            borderRadius: '4px'
          }}>
            Payload: {Object.keys(data.payloadSchema.properties || {}).join(', ')}
          </div>
        )}
      </div>
    </div>
  );
}
