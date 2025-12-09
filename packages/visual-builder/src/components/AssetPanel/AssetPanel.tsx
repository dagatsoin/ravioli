import React from 'react';
import { observer } from 'mobx-react-lite';
import { assetContainer } from '../../containers/assetContainer';
import AssetItem from './AssetItem';

/**
 * AssetPanel - Lists available building blocks from the asset library
 * Uses MobX observer to auto-react to assetContainer changes
 */
const AssetPanel = observer(() => {
  const { filteredAssets, categories, assetCount } = assetContainer.representationRef.current;
  const { searchAssets, filterByCategory } = assetContainer.actions;

  return (
    <div className="asset-panel">
      <div className="asset-panel__header">
        <h2 className="asset-panel__title">Components ({assetCount})</h2>

        <input
          type="text"
          className="asset-panel__search"
          placeholder="Search components..."
          onChange={(e) => searchAssets({ query: e.target.value })}
        />

        <select
          className="asset-panel__category"
          onChange={(e) => filterByCategory({ category: e.target.value || null })}
        >
          <option value="">All Categories</option>
          {categories.map(cat => (
            <option key={cat} value={cat}>{cat}</option>
          ))}
        </select>
      </div>

      <div className="asset-panel__list">
        {filteredAssets.length === 0 ? (
          <div style={{ padding: '20px', textAlign: 'center', color: '#64748b' }}>
            No components found
          </div>
        ) : (
          filteredAssets.map(asset => (
            <AssetItem key={asset.id} asset={asset} />
          ))
        )}
      </div>
    </div>
  );
});

export default AssetPanel;
