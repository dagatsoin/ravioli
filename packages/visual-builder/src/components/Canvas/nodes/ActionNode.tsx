import React from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import { ActionNodeData } from '../../../types/node.types';

/**
 * ActionNode - Green nodes representing high-level actions
 */
export default function ActionNode({ data, selected }: NodeProps<ActionNodeData>) {
  return (
    <div style={{
      background: '#d1fae5',
      border: selected ? '2px solid #059669' : '1px solid #6ee7b7',
      borderRadius: '10px',
      padding: '14px',
      minWidth: '180px',
      maxWidth: '250px',
      boxShadow: selected ? '0 4px 8px rgba(16, 185, 129, 0.3)' : '0 2px 4px rgba(0,0,0,0.1)'
    }}>
      <Handle
        type="source"
        position={Position.Right}
        style={{ background: '#10b981', width: '10px', height: '10px' }}
      />

      <div>
        <div style={{
          fontWeight: 'bold',
          marginBottom: '6px',
          color: '#065f46',
          fontSize: '15px'
        }}>
          {data.label}
        </div>

        <div style={{
          fontSize: '12px',
          color: '#065f46',
          marginBottom: '4px',
          fontWeight: '500'
        }}>
          Action: <code style={{
            background: '#a7f3d0',
            padding: '2px 6px',
            borderRadius: '4px',
            fontSize: '11px'
          }}>{data.actionName}</code>
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

        {data.produces && data.produces.length > 0 && (
          <div style={{
            fontSize: '10px',
            color: '#475569',
            marginTop: '6px',
            padding: '4px 6px',
            background: '#f1f5f9',
            borderRadius: '4px'
          }}>
            Produces: {data.produces.map(m => (
              <span key={m} style={{
                display: 'inline-block',
                background: '#dbeafe',
                padding: '2px 4px',
                borderRadius: '3px',
                marginRight: '4px',
                marginTop: '2px'
              }}>
                {m}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
