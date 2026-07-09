import React, { useState, useEffect, useCallback } from 'react';
import { Group, UnstyledButton, Text, PasswordInput, Button, Stack, Title } from '@mantine/core';
import {
  Settings,
  LayoutDashboard,
  FileText,
  ExternalLink,
  PanelRightOpen,
  PanelRightClose,
  LineChart,
  ScrollText,
} from 'lucide-react';
import { TelemetryDashboard } from './components/TelemetryDashboard';
import { LiveMessageLog } from './components/LiveMessageLog';
import { SignalDashboard } from './components/SignalDashboard';
import { DbcViewer } from './components/DbcViewer';
import { Analytics } from './components/Analytics';
import { StatusBar } from './components/StatusBar';
import { socket } from './socket';
import { apiJson } from './lib/api';

const CLIENT_DEFAULT_PAGE = 'control';
const SERVER_VIEWER_DEFAULT = 'live-log';

const CLIENT_PAGES = [
  { id: 'control', label: 'Config', icon: Settings },
  { id: 'dashboard', label: 'Signals', icon: LayoutDashboard },
  { id: 'analytics', label: 'Analytics', icon: LineChart },
  { id: 'dbc-viewer', label: 'DBC Viewer', icon: FileText },
];

const SERVER_VIEWER_PAGES = [
  { id: 'live-log', label: 'Live Log', icon: ScrollText },
  { id: 'dashboard', label: 'Signals', icon: LayoutDashboard },
  { id: 'analytics', label: 'Analytics', icon: LineChart },
  { id: 'dbc-viewer', label: 'DBC Viewer', icon: FileText },
];

function getHashPage(fallback) {
  return window.location.hash.replace('#', '') || fallback;
}

function isManagePath() {
  return window.location.pathname === '/manage' || window.location.pathname.startsWith('/manage/');
}

function AppShell({ title, tabs, page, onNavigate, children, rightExtra }) {
  const [grafanaActive, setGrafanaActive] = useState(false);
  const [grafanaUrl, setGrafanaUrl] = useState('/grafana/');
  const [influxActive, setInfluxActive] = useState(false);
  const [influxUrl, setInfluxUrl] = useState('/influx/');

  useEffect(() => {
    const onStatus = (status) => {
      if (typeof status.grafana_active === 'boolean') setGrafanaActive(status.grafana_active);
      if (status.grafana_url) setGrafanaUrl(status.grafana_url);
      if (typeof status.influx_connected === 'boolean') setInfluxActive(status.influx_connected);
      if (status.influx_url) setInfluxUrl(status.influx_url);
    };
    socket.on('status', onStatus);
    return () => socket.off('status', onStatus);
  }, []);

  return (
    <div style={{ height: '100vh', backgroundColor: '#0a0a0b', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div
        style={{
          borderBottom: '1px solid var(--border)',
          flexShrink: 0,
          backgroundColor: '#0f0f11',
          display: 'grid',
          gridTemplateColumns: '1fr auto 1fr',
          alignItems: 'center',
          gap: 12,
          padding: '6px 16px',
        }}
      >
        <Group gap="lg" align="center" wrap="nowrap" style={{ minWidth: 0, justifySelf: 'start' }}>
          <Text size="lg" fw={600} style={{ color: '#e4e4e7', letterSpacing: '-0.02em', flexShrink: 0 }}>
            {title}
          </Text>
          {tabs?.length > 0 && (
            <Group gap="xs" wrap="nowrap" style={{ minWidth: 0 }}>
              {tabs.map(({ id, label, icon: Icon }) => (
                <NavTab
                  key={id}
                  icon={<Icon size={14} strokeWidth={1.75} />}
                  label={label}
                  active={page === id}
                  onClick={() => onNavigate(id)}
                />
              ))}
            </Group>
          )}
        </Group>
        <StatusBar />
        <Group gap="md" wrap="nowrap" style={{ justifySelf: 'end', flexShrink: 0 }}>
          {rightExtra}
          <a
            href={grafanaActive ? grafanaUrl : undefined}
            target={grafanaActive ? '_blank' : undefined}
            rel={grafanaActive ? 'noreferrer' : undefined}
            title="Open Grafana"
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
            <img src={`${import.meta.env.BASE_URL}assets/grafana_logo.svg`} alt="Grafana" style={{ height: 18, opacity: 0.9 }} />
            <ExternalLink size={14} strokeWidth={1.75} />
          </a>
          <a
            href={influxActive ? influxUrl : undefined}
            target={influxActive ? '_blank' : undefined}
            rel={influxActive ? 'noreferrer' : undefined}
            title="Open InfluxDB"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              opacity: influxActive ? 1 : 0.4,
              pointerEvents: influxActive ? 'auto' : 'none',
              color: 'var(--text-muted)',
              textDecoration: 'none',
            }}
          >
            <img src={`${import.meta.env.BASE_URL}assets/influx_logo.svg`} alt="InfluxDB" style={{ height: 18, opacity: 0.9 }} />
            <ExternalLink size={14} strokeWidth={1.75} />
          </a>
        </Group>
      </div>
      <div style={{ flex: 1, display: 'flex', minHeight: 0, position: 'relative' }}>{children}</div>
    </div>
  );
}

function ClientApp() {
  const [page, setPage] = useState(() => getHashPage(CLIENT_DEFAULT_PAGE));
  const [sideLogOpen, setSideLogOpen] = useState(false);

  useEffect(() => {
    const onHashChange = () => setPage(getHashPage(CLIENT_DEFAULT_PAGE));
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  const navigate = useCallback((p) => {
    window.location.hash = p;
  }, []);
  const toggleSideLog = useCallback(() => setSideLogOpen((v) => !v), []);

  return (
    <AppShell title="Electron" tabs={CLIENT_PAGES} page={page} onNavigate={navigate}>
      <Group align="stretch" gap={0} wrap="nowrap" style={{ flex: 1, display: page === 'control' ? 'flex' : 'none' }}>
        <TelemetryDashboard />
        <LiveMessageLog />
      </Group>
      {['dashboard', 'analytics', 'dbc-viewer'].map((id) => {
        const Component = id === 'dashboard' ? SignalDashboard : id === 'analytics' ? Analytics : DbcViewer;
        return (
          <div key={id} style={{ flex: 1, display: page === id ? 'flex' : 'none', minHeight: 0 }}>
            <PageWithCollapsibleLog logOpen={sideLogOpen} onToggle={toggleSideLog}>
              {page === id ? <Component /> : <div style={{ flex: 1, minHeight: 0 }} aria-hidden />}
            </PageWithCollapsibleLog>
          </div>
        );
      })}
    </AppShell>
  );
}

function ServerViewerApp() {
  const [page, setPage] = useState(() => {
    const p = getHashPage(SERVER_VIEWER_DEFAULT);
    return SERVER_VIEWER_PAGES.some((t) => t.id === p) ? p : SERVER_VIEWER_DEFAULT;
  });
  const [sideLogOpen, setSideLogOpen] = useState(false);

  useEffect(() => {
    const onHashChange = () => {
      const p = getHashPage(SERVER_VIEWER_DEFAULT);
      setPage(SERVER_VIEWER_PAGES.some((t) => t.id === p) ? p : SERVER_VIEWER_DEFAULT);
    };
    window.addEventListener('hashchange', onHashChange);
    if (!window.location.hash) window.location.hash = SERVER_VIEWER_DEFAULT;
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  const navigate = useCallback((p) => {
    window.location.hash = p;
  }, []);
  const toggleSideLog = useCallback(() => setSideLogOpen((v) => !v), []);

  return (
    <AppShell title="Electron" tabs={SERVER_VIEWER_PAGES} page={page} onNavigate={navigate}>
      <div style={{ flex: 1, display: page === 'live-log' ? 'flex' : 'none', minHeight: 0 }}>
        {page === 'live-log' ? <LiveMessageLog /> : null}
      </div>
      {['dashboard', 'analytics', 'dbc-viewer'].map((id) => {
        const Component = id === 'dashboard' ? SignalDashboard : id === 'analytics' ? Analytics : DbcViewer;
        return (
          <div key={id} style={{ flex: 1, display: page === id ? 'flex' : 'none', minHeight: 0 }}>
            <PageWithCollapsibleLog logOpen={sideLogOpen} onToggle={toggleSideLog}>
              {page === id ? <Component /> : <div style={{ flex: 1, minHeight: 0 }} aria-hidden />}
            </PageWithCollapsibleLog>
          </div>
        );
      })}
    </AppShell>
  );
}

function ManageLogin({ onSuccess }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      await apiJson('/api/manage/login', { method: 'POST', body: JSON.stringify({ password }) });
      onSuccess();
    } catch (err) {
      setError(err.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ flex: 1, display: 'grid', placeItems: 'center', background: '#0a0a0b' }}>
      <form onSubmit={submit} style={{ width: 320, padding: 24, border: '1px solid #1f1f23', borderRadius: 8, background: '#0f0f11' }}>
        <Stack gap="md">
          <Title order={3} c="#e4e4e7">Manage login</Title>
          <Text size="sm" c="dimmed">Password required to control this server.</Text>
          <PasswordInput
            label="Password"
            value={password}
            onChange={(e) => setPassword(e.currentTarget.value)}
            autoFocus
          />
          {error ? <Text size="sm" c="red">{error}</Text> : null}
          <Button type="submit" loading={loading}>Sign in</Button>
        </Stack>
      </form>
    </div>
  );
}

function ServerManageApp() {
  const [authed, setAuthed] = useState(null);
  const [sideLogOpen, setSideLogOpen] = useState(true);

  const refreshSession = useCallback(() => {
    apiJson('/api/manage/session')
      .then((s) => setAuthed(!!s.authenticated))
      .catch(() => setAuthed(false));
  }, []);

  useEffect(() => {
    refreshSession();
  }, [refreshSession]);

  const logout = async () => {
    try {
      await apiJson('/api/manage/logout', { method: 'POST', body: '{}' });
    } catch {
      /* ignore */
    }
    setAuthed(false);
  };

  if (authed === null) {
    return (
      <div style={{ height: '100vh', background: '#0a0a0b', display: 'grid', placeItems: 'center', color: '#a1a1aa' }}>
        Checking session…
      </div>
    );
  }

  if (!authed) {
    return (
      <div style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
        <ManageLogin onSuccess={() => setAuthed(true)} />
      </div>
    );
  }

  return (
    <AppShell
      title="Electron Manage"
      tabs={[]}
      page="control"
      onNavigate={() => {}}
      rightExtra={
        <UnstyledButton onClick={logout} style={{ color: '#a1a1aa', fontSize: 13 }}>
          Log out
        </UnstyledButton>
      }
    >
      <PageWithCollapsibleLog logOpen={sideLogOpen} onToggle={() => setSideLogOpen((v) => !v)}>
        <TelemetryDashboard />
      </PageWithCollapsibleLog>
    </AppShell>
  );
}

function App() {
  const [mode, setMode] = useState(null);
  const manage = isManagePath();

  useEffect(() => {
    apiJson('/api/runtime-info')
      .then((info) => setMode(info.mode === 'server' ? 'server' : 'client'))
      .catch(() => setMode('client'));
  }, []);

  if (mode === null) {
    return (
      <div style={{ height: '100vh', background: '#0a0a0b', display: 'grid', placeItems: 'center', color: '#a1a1aa' }}>
        Loading…
      </div>
    );
  }

  if (mode === 'server') {
    return manage ? <ServerManageApp /> : <ServerViewerApp />;
  }
  return <ClientApp />;
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
