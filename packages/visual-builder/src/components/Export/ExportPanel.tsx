import React, { useState } from 'react';
import { observer } from 'mobx-react-lite';
import { graphContainer } from '../../containers/graphContainer';
import { graphToContainerConfig, ExportResult } from '../../utils/graphToJSON';

/**
 * ExportPanel - Generates and exports ContainerConfig JSON
 * Uses MobX observer to react to graph changes
 */
const ExportPanel = observer(() => {
  const { nodes, edges, canExport, connectionCount } = graphContainer.representationRef.current;
  const [result, setResult] = useState<ExportResult | null>(null);

  const handleGenerate = () => {
    const exportResult = graphToContainerConfig(nodes, edges);
    setResult(exportResult);
  };

  const handleDownload = () => {
    if (!result?.config) return;

    const jsonString = JSON.stringify(result.config, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.href = url;
    link.download = 'container-config.json';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleCopy = () => {
    if (!result?.config) return;

    const jsonString = JSON.stringify(result.config, null, 2);
    navigator.clipboard.writeText(jsonString).then(() => {
      alert('JSON copied to clipboard!');
    });
  };

  return (
    <div className="export-panel">
      <h3 className="export-panel__title">Export Configuration</h3>

      <div style={{ marginBottom: '12px', fontSize: '13px', color: '#64748b' }}>
        <div>Nodes: {nodes.length}</div>
        <div>Connections: {connectionCount}</div>
      </div>

      <button
        className="export-panel__button"
        onClick={handleGenerate}
        disabled={!canExport}
        title={canExport ? 'Generate JSON configuration' : 'Add a container node first'}
      >
        Generate JSON
      </button>

      {result && (
        <div>
          {/* Errors */}
          {result.errors.length > 0 && (
            <div className="export-panel__errors">
              <h4>❌ Errors</h4>
              <ul>
                {result.errors.map((error, i) => (
                  <li key={i}>{error}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Warnings */}
          {result.warnings.length > 0 && (
            <div className="export-panel__warnings">
              <h4>⚠️ Warnings</h4>
              <ul>
                {result.warnings.map((warning, i) => (
                  <li key={i}>{warning}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Success - Show JSON */}
          {result.success && result.config && (
            <>
              <div className="export-panel__preview">
                <pre>
                  {JSON.stringify(result.config, null, 2)}
                </pre>
              </div>

              <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
                <button
                  className="export-panel__button"
                  onClick={handleDownload}
                  style={{ flex: 1 }}
                >
                  💾 Download
                </button>
                <button
                  className="export-panel__button"
                  onClick={handleCopy}
                  style={{ flex: 1 }}
                >
                  📋 Copy
                </button>
              </div>

              <div style={{
                marginTop: '16px',
                padding: '12px',
                background: '#f0fdf4',
                border: '1px solid #86efac',
                borderRadius: '6px',
                fontSize: '12px',
                color: '#166534'
              }}>
                <strong>✅ Ready to use!</strong>
                <div style={{ marginTop: '4px' }}>
                  Import this JSON in your code:
                </div>
                <code style={{
                  display: 'block',
                  marginTop: '8px',
                  padding: '8px',
                  background: 'white',
                  borderRadius: '4px',
                  fontSize: '11px',
                  color: '#0f172a'
                }}>
                  createContainerFromJSON(config)
                </code>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
});

export default ExportPanel;
