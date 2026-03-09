import React from 'react';
import { Group } from '@mantine/core';
import { TelemetryDashboard } from './components/TelemetryDashboard';
import { LiveMessageLog } from './components/LiveMessageLog';

function App() {
  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#0a0a0b' }}>
      <Group align="stretch" gap={0} wrap="nowrap" style={{ minHeight: '100vh' }}>
        <TelemetryDashboard />
        <LiveMessageLog />
      </Group>
    </div>
  );
}

export default App;
