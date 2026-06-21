import { memo, useCallback, useState } from 'react';
import { UnstyledButton } from '@mantine/core';
import { PanelRightOpen, PanelRightClose } from 'lucide-react';
import SignalDashboard from './SignalDashboard.jsx';
import LiveMessageLog from './LiveMessageLog.jsx';
import IngestBar from './IngestBar.jsx';

const SIDEBAR_WIDTH = 320;

const PageWithCollapsibleLog = memo(function PageWithCollapsibleLog({ children, logOpen, onToggle }) {
  return (
    <div style={{ flex: 1, display: 'flex', position: 'relative', minHeight: 0, minWidth: 0, height: '100%' }}>
      <div
        style={{
          flex: 1,
          minWidth: 0,
          minHeight: 0,
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          transition: 'margin-right 200ms ease',
          marginRight: logOpen ? SIDEBAR_WIDTH : 0,
        }}
      >
        {children}
      </div>

      <div
        style={{
          position: 'absolute',
          top: '50%',
          right: logOpen ? SIDEBAR_WIDTH : 0,
          transform: 'translateY(-50%)',
          zIndex: 3,
        }}
      >
        <UnstyledButton
          onClick={onToggle}
          title={logOpen ? 'Hide live log' : 'Show live log'}
          style={{
            width: 26,
            height: 72,
            borderRadius: '12px 0 0 12px',
            border: '1px solid var(--border)',
            borderRight: 'none',
            backgroundColor: 'var(--bg-elevated)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--text-muted)',
            boxShadow: '0 0 12px rgba(0,0,0,0.6)',
          }}
        >
          {logOpen ? <PanelRightClose size={16} strokeWidth={1.75} /> : <PanelRightOpen size={16} strokeWidth={1.75} />}
        </UnstyledButton>
      </div>

      <div
        style={{
          position: 'absolute',
          top: 0,
          right: 0,
          height: '100%',
          width: logOpen ? SIDEBAR_WIDTH : 0,
          overflow: 'hidden',
          transition: 'width 220ms ease',
        }}
      >
        {logOpen && <LiveMessageLog />}
      </div>
    </div>
  );
});

export default function TelemetryWorkspace() {
  const [sideLogOpen, setSideLogOpen] = useState(false);
  const toggleSideLog = useCallback(() => setSideLogOpen((v) => !v), []);

  return (
    <div
      className="workspace-surface"
      style={{
        height: '100%',
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      <IngestBar />
      <div style={{ flex: 1, minHeight: 0, display: 'flex' }}>
      <PageWithCollapsibleLog logOpen={sideLogOpen} onToggle={toggleSideLog}>
        <SignalDashboard />
      </PageWithCollapsibleLog>
      </div>
    </div>
  );
}
