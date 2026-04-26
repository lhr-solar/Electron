import React, { useState, useEffect, useCallback } from 'react';
import { Group, UnstyledButton, Text } from '@mantine/core';
import { Settings, LayoutDashboard, FileText, ExternalLink, PanelRightOpen, PanelRightClose, LineChart } from 'lucide-react';
import { TelemetryDashboard } from './components/TelemetryDashboard';
import { LiveMessageLog } from './components/LiveMessageLog';
import { SignalDashboard } from './components/SignalDashboard';
import { DbcViewer } from './components/DbcViewer';
import { DbcEditor } from './components/DbcEditor';
import { Analytics } from './components/Analytics';
import { socket } from './socket';
import { backendDownloadUrl } from './lib/api';

const PAGE_LAYOUTS = [
  { id: 'dashboard', Component: SignalDashboard },
  { id: 'analytics', Component: Analytics },
  { id: 'dbc-viewer', Component: DbcViewer },
  { id: 'dbc-editor', Component: DbcEditor },
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
  const [backendConnected, setBackendConnected] = useState(socket.connected);

  useEffect(() => {
    const onHashChange = () => setPage(getPage());
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  useEffect(() => {
    const onConnect = () => setBackendConnected(true);
    const onDisconnect = () => setBackendConnected(false);
    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
    };
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
        wrap="nowrap"
        style={{
          borderBottom: '1px solid var(--border)',
          flexShrink: 0,
          backgroundColor: '#0f0f11',
          justifyContent: 'space-between',
        }}
      >
        <Group gap="lg" align="center" wrap="nowrap" style={{ minWidth: 0 }}>
          <Text
            size="lg"
            fw={600}
            style={{ color: '#e4e4e7', letterSpacing: '-0.02em', flexShrink: 0 }}
          >
            Electron
          </Text>
          <Group gap="xs" wrap="nowrap" style={{ minWidth: 0 }}>
            <NavTab
              icon={<Settings size={14} strokeWidth={1.75} />}
              label="Config"
              active={page === 'control'}
              onClick={() => navigate('control')}
            />
            <NavTab
              icon={<LayoutDashboard size={14} strokeWidth={1.75} />}
              label="Signals"
              active={page === 'dashboard'}
              onClick={() => navigate('dashboard')}
            />
            <NavTab
              icon={<LineChart size={14} strokeWidth={1.75} />}
              label="Analytics"
              active={page === 'analytics'}
              onClick={() => navigate('analytics')}
            />
            <NavTab
              icon={<FileText size={14} strokeWidth={1.75} />}
              label="DBC Viewer"
              active={page === 'dbc-viewer'}
              onClick={() => navigate('dbc-viewer')}
            />
            <NavTab
              icon={<FileText size={14} strokeWidth={1.75} />}
              label="DBC Editor"
              active={page === 'dbc-editor'}
              onClick={() => navigate('dbc-editor')}
            />
          </Group>
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
            flexShrink: 0,
          }}
        >
          <img src="/assets/grafana_logo.svg" alt="Grafana" style={{ height: 18, opacity: 0.9 }} />
          <ExternalLink size={14} strokeWidth={1.75} />
        </a>
      </Group>
      {!backendConnected && backendDownloadUrl && (
        <Group
          gap="xs"
          px="md"
          py={6}
          wrap="nowrap"
          style={{
            borderBottom: '1px solid var(--border)',
            backgroundColor: '#111114',
            justifyContent: 'space-between',
          }}
        >
          <Text size="sm" c="dimmed">Backend not connected. Download the latest desktop backend to continue.</Text>
          <a href={backendDownloadUrl} target="_blank" rel="noreferrer" style={{ color: '#93c5fd', textDecoration: 'none', fontSize: 13 }}>
            Download backend
          </a>
        </Group>
      )}
      <div style={{ flex: 1, display: 'flex', minHeight: 0, position: 'relative' }}>
        <Group align="stretch" gap={0} wrap="nowrap" style={{ flex: 1, display: page === 'control' ? 'flex' : 'none' }}>
          <TelemetryDashboard />
          <LiveMessageLog />
        </Group>
        {PAGE_LAYOUTS.map(({ id, Component }) => (
          <div key={id} style={{ flex: 1, display: page === id ? 'flex' : 'none', minHeight: 0 }}>
            <PageWithCollapsibleLog logOpen={sideLogOpen} onToggle={toggleSideLog}>
              {page === id ? <Component /> : <div style={{ flex: 1, minHeight: 0 }} aria-hidden />}
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
    <div style={{ flex: 1, display: 'flex', position: 'relative', minHeight: 0, minWidth: 0 }}>
      <div
        style={{
          flex: 1,
          minWidth: 0,
          minHeight: 0,
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
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
            color: '#a1a1aa',
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

function NavTab({ icon, label, active, onClick }) {
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
      <Text size="sm" style={{ color: 'inherit' }}>
        {label}
      </Text>
    </UnstyledButton>
  );
}

export default App;
