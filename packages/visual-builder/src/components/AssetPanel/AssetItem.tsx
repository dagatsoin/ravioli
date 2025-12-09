import React from 'react';
import { Asset } from '../../types/asset.types';

interface AssetItemProps {
  asset: Asset;
}

/**
 * AssetItem - Draggable component representing a single asset
 */
export default function AssetItem({ asset }: AssetItemProps) {
  const handleDragStart = (event: React.DragEvent) => {
    event.dataTransfer.setData('application/reactflow', JSON.stringify(asset));
    event.dataTransfer.effectAllowed = 'move';
  };

  return (
    <div
      className="asset-item"
      draggable
      onDragStart={handleDragStart}
    >
      <div className="asset-item__header">
        <span className="asset-item__name">{asset.name}</span>
        <span className={`asset-item__badge asset-item__badge--${asset.type}`}>
          {asset.type}
        </span>
      </div>

      {asset.description && (
        <div className="asset-item__description">{asset.description}</div>
      )}

      {asset.category && (
        <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '4px' }}>
          {asset.category}
        </div>
      )}
    </div>
  );
}
