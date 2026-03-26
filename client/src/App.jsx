import React, { useState, useEffect, useCallback } from 'react';
import { Group, UnstyledButton, Text } from '@mantine/core';
import { Settings, LayoutDashboard, FileText, ExternalLink, PanelRightOpen, PanelRightClose } from 'lucide-react';
import { TelemetryDashboard } from './components/TelemetryDashboard';
import { LiveMessageLog } from './components/LiveMessageLog';
import { SignalDashboard } from './components/SignalDashboard';
import { DbcViewer } from './components/DbcViewer';
import { socket } from './socket';

const PAGE_LAYOUTS = [
  { id: 'dashboard', Component: SignalDashboard },
  { id: 'dbc-viewer', Component: DbcViewer },
];

function getPage() {
  const hash = window.location.hash.replace('#', '') || 'control';
  return hash;
}

function App() {
  const [page, setPage] = useState(getPage);
  const [grafanaActive, setGrafanaActive] = useState(false);
  const [grafanaUrl, setGrafanaUrl] = useState('http://127.0.0.1:3000');
  const [sideLogOpen, setSideLogOpen] = useState(false);

  useEffect(() => {
    const onHashChange = () => setPage(getPage());
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  useEffect(() => {
    const onStatus = (status) => {
      if (typeof status.grafana_active === 'boolean') {
        setGrafanaActive(status.grafana_active);
      }
      if (status.grafana_url) {
        setGrafanaUrl(status.grafana_url);
      }
    };
    socket.on('status', onStatus);
    return () => socket.off('status', onStatus);
  }, []);

  const navigate = useCallback((p) => {
    window.location.hash = p;
  }, []);
  const toggleSideLog = useCallback(() => setSideLogOpen((v) => !v), []);

  return (
    <div style={{ height: '100vh', backgroundColor: '#0a0a0b', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <Group
        gap="md"
        px="md"
        py={6}
        style={{
          borderBottom: '1px solid var(--border)',
          flexShrink: 0,
          backgroundColor: '#0f0f11',
          justifyContent: 'space-between',
        }}
      >
        <Group gap="md">
          <NavTab icon={<Settings size={14} />} label="Config" active={page === 'control'} onClick={() => navigate('control')} />
          <NavTab icon={<LayoutDashboard size={14} />} label="Signals" active={page === 'dashboard'} onClick={() => navigate('dashboard')} />
          <NavTab icon={<FileText size={14} />} label="DBC Viewer" active={page === 'dbc-viewer'} onClick={() => navigate('dbc-viewer')} />
        </Group>
        <a
          href={grafanaActive ? grafanaUrl : undefined}
          target={grafanaActive ? '_blank' : undefined}
          rel={grafanaActive ? 'noreferrer' : undefined}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            opacity: grafanaActive ? 1 : 0.4,
            pointerEvents: grafanaActive ? 'auto' : 'none',
            color: 'var(--text-muted)',
            textDecoration: 'none',
          }}
        >
          <img
            src="/assets/grafana_logo.svg"
            alt="Grafana"
            style={{ height: 18, opacity: 0.9 }}
          />
          <ExternalLink size={14} />
        </a>
      </Group>
      <div style={{ flex: 1, display: 'flex', minHeight: 0, position: 'relative' }}>
        <Group align="stretch" gap={0} wrap="nowrap" style={{ flex: 1, display: page === 'control' ? 'flex' : 'none' }}>
          <TelemetryDashboard />
          <LiveMessageLog />
        </Group>
        {PAGE_LAYOUTS.map(({ id, Component }) => (
          <div key={id} style={{ flex: 1, display: page === id ? 'flex' : 'none' }}>
            <PageWithCollapsibleLog logOpen={sideLogOpen} onToggle={toggleSideLog}>
              <Component />
            </PageWithCollapsibleLog>
          </div>
        ))}
      </div>
    </div>
  );
}

const PageWithCollapsibleLog = React.memo(function PageWithCollapsibleLog({ children, logOpen, onToggle }) {
  const sidebarWidth = 320;

  return (
    <div style={{ flex: 1, display: 'flex', position: 'relative', minHeight: 0 }}>
      <div
        style={{
          flex: 1,
          minWidth: 0,
          transition: 'margin-right 200ms ease',
          marginRight: logOpen ? sidebarWidth : 0,
        }}
      >
        {children}
      </div>

      <div
        style={{
          position: 'absolute',
          top: '50%',
          right: logOpen ? sidebarWidth : 0,
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
            backgroundColor: '#0f0f11',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 0 12px rgba(0,0,0,0.6)',
          }}
        >
          {logOpen ? <PanelRightClose size={16} /> : <PanelRightOpen size={16} />}
        </UnstyledButton>
      </div>

      <div
        style={{
          position: 'absolute',
          top: 0,
          right: 0,
          height: '100%',
          width: logOpen ? sidebarWidth : 0,
          overflow: 'hidden',
          transition: 'width 220ms ease',
        }}
      >
        {logOpen && <LiveMessageLog />}
      </div>
    </div>
  );
});

const NavTab = React.memo(function NavTab({ icon, label, active, onClick }) {
  return (
    <UnstyledButton
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '6px 12px',
        borderRadius: 4,
        backgroundColor: active ? '#27272a' : 'transparent',
        color: active ? '#e4e4e7' : '#71717a',
      }}
    >
      {icon}
      <Text size="sm" style={{ color: 'inherit' }}>{label}</Text>
    </UnstyledButton>
  );
});

export default App;
