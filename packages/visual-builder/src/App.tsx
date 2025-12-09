import React from 'react';
import { observer } from 'mobx-react-lite';
import FlowCanvas from './components/Canvas/FlowCanvas';
import AssetPanel from './components/AssetPanel/AssetPanel';
import ExportPanel from './components/Export/ExportPanel';

const App = observer(() => {
  return (
    <div className="app-layout">
      <div className="app-layout__left">
        <AssetPanel />
      </div>

      <div className="app-layout__center">
        <FlowCanvas />
      </div>

      <div className="app-layout__right">
        <ExportPanel />
      </div>
    </div>
  );
});

export default App;
