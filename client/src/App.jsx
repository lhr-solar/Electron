import React, { useState, useEffect, useCallback } from 'react';
import {
  Settings,
  LayoutDashboard,
  FileText,
  ExternalLink,
  PanelRightOpen,
  PanelRightClose,
  LineChart,
  Info,
  Lock,
  Atom,
  Home,
  Database,
} from 'lucide-react';
import { TelemetryDashboard } from './components/TelemetryDashboard';
import { LiveMessageLog } from './components/LiveMessageLog';
import { SignalDashboard } from './components/SignalDashboard';
import { DbcViewer } from './components/DbcViewer';
import { Analytics } from './components/Analytics';
import { StatusBar } from './components/StatusBar';
import { ServerInfoPanel } from './components/ServerInfoPanel';
import { DatabaseManagementModal } from './components/DatabaseManagementModal';
import { TimeMarkButton } from './components/TimeMarkButton';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { socket } from './socket';
import { apiJson, clearManageToken, setManageToken } from './lib/api';

const CLIENT_DEFAULT_PAGE = 'control';
const SERVER_VIEWER_DEFAULT = 'info';

const CLIENT_PAGES = [
  { id: 'control', label: 'Config', icon: Settings },
  { id: 'dashboard', label: 'Signals', icon: LayoutDashboard },
  { id: 'analytics', label: 'Analytics', icon: LineChart },
  { id: 'dbc-viewer', label: 'DBC Viewer', icon: FileText },
];

const SERVER_VIEWER_PAGES = [
  { id: 'info', label: 'Info', icon: Info },
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

function Wordmark({ title }) {
  return (
    <div className="flex shrink-0 items-center gap-2">
      <div className="flex size-7 items-center justify-center rounded-md border border-signal-blue/30 bg-linear-to-br from-signal-blue/20 to-signal-purple/20">
        <Atom className="size-4 text-signal-blue" strokeWidth={2} />
      </div>
      <span className="bg-linear-to-r from-signal-blue to-signal-purple bg-clip-text font-display text-[17px] font-bold leading-none tracking-tight text-transparent">
        {title}
      </span>
    </div>
  );
}

function TopLink({ href, active, imgSrc, alt, title }) {
  const className = cn(
    'inline-flex flex-col items-center justify-center gap-1 rounded-md px-2 py-0.5 outline-none transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/50',
    active
      ? 'text-foreground hover:bg-accent'
      : 'pointer-events-none text-muted-foreground'
  );
  const children = (
    <>
      <span className="inline-flex items-center gap-1.5">
        <img
          src={imgSrc}
          alt={alt}
          className={cn('h-[18px] w-auto', active ? 'opacity-100' : 'opacity-70')}
        />
        <ExternalLink className="size-3.5" strokeWidth={1.75} />
      </span>
      <span
        aria-hidden
        className={cn(
          'h-1 w-7 rounded-full',
          active ? 'bg-signal-green shadow-[0_0_6px_#22e39b]' : 'bg-signal-red'
        )}
      />
    </>
  );

  if (!active) {
    return (
      <span title={`${title} (disconnected)`} className={className}>
        {children}
      </span>
    );
  }

  return (
    <a href={href} target="_blank" rel="noreferrer" title={title} className={className}>
      {children}
    </a>
  );
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
    <div className="flex h-screen flex-col overflow-hidden bg-background">
      <header className="flex h-[52px] shrink-0 items-center gap-3 border-b border-border bg-card px-4">
        <div className="flex min-w-0 items-center gap-3">
          <Wordmark title={title} />
          {tabs?.length > 0 && (
            <nav className="flex min-w-0 items-center gap-0.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {tabs.map(({ id, label, icon: Icon }) => (
                <NavTab
                  key={id}
                  icon={<Icon size={14} strokeWidth={1.75} />}
                  label={label}
                  active={page === id}
                  onClick={() => onNavigate(id)}
                />
              ))}
            </nav>
          )}
        </div>

        <div className="flex min-w-0 flex-1 justify-center">
          <StatusBar />
        </div>

        <div className="flex shrink-0 items-center gap-1">
          {rightExtra}
          <TopLink
            href={grafanaUrl}
            active={grafanaActive}
            imgSrc={`${import.meta.env.BASE_URL}assets/grafana_logo.svg`}
            alt="Grafana"
            title="Open Grafana"
          />
          <TopLink
            href={influxUrl}
            active={influxActive}
            imgSrc={`${import.meta.env.BASE_URL}assets/influx_logo.svg`}
            alt="InfluxDB"
            title="Open InfluxDB"
          />
        </div>
      </header>
      <div className="relative flex min-h-0 flex-1">{children}</div>
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
    <AppShell
      title="Electron"
      tabs={CLIENT_PAGES}
      page={page}
      onNavigate={navigate}
      rightExtra={<TimeMarkButton />}
    >
      <div
        className="flex min-h-0 flex-1 flex-nowrap items-stretch"
        style={{ display: page === 'control' ? 'flex' : 'none' }}
      >
        <TelemetryDashboard />
        <LiveMessageLog />
      </div>
      {['dashboard', 'analytics', 'dbc-viewer'].map((id) => {
        const Component = id === 'dashboard' ? SignalDashboard : id === 'analytics' ? Analytics : DbcViewer;
        return (
          <div key={id} className="min-h-0 flex-1" style={{ display: page === id ? 'flex' : 'none' }}>
            <PageWithCollapsibleLog logOpen={sideLogOpen} onToggle={toggleSideLog}>
              {page === id ? <Component /> : <div className="min-h-0 flex-1" aria-hidden />}
            </PageWithCollapsibleLog>
          </div>
        );
      })}
    </AppShell>
  );
}

function resolveServerViewerPage(raw) {
  const p = raw === 'live-log' ? 'info' : raw;
  return SERVER_VIEWER_PAGES.some((t) => t.id === p) ? p : SERVER_VIEWER_DEFAULT;
}

function ServerViewerApp() {
  const [page, setPage] = useState(() => resolveServerViewerPage(getHashPage(SERVER_VIEWER_DEFAULT)));
  const [sideLogOpen, setSideLogOpen] = useState(false);
  const [runsOpen, setRunsOpen] = useState(false);
  const [vehicle, setVehicle] = useState('HighNoon');
  const [influxConnected, setInfluxConnected] = useState(false);
  // Manage/admin session lets the viewer delete runs (rename is always allowed).
  const [canDeleteRuns, setCanDeleteRuns] = useState(false);

  useEffect(() => {
    if (!runsOpen) return;
    apiJson('/api/manage/session')
      .then((s) => setCanDeleteRuns(!!s.authenticated))
      .catch(() => setCanDeleteRuns(false));
  }, [runsOpen]);

  useEffect(() => {
    const onHashChange = () => {
      setPage(resolveServerViewerPage(getHashPage(SERVER_VIEWER_DEFAULT)));
    };
    window.addEventListener('hashchange', onHashChange);
    const current = window.location.hash.replace('#', '');
    if (!current || current === 'live-log') window.location.hash = SERVER_VIEWER_DEFAULT;
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  useEffect(() => {
    const onStatus = (status) => {
      if (status?.vehicle) setVehicle(status.vehicle);
      if (typeof status?.influx_connected === 'boolean') setInfluxConnected(status.influx_connected);
    };
    socket.on('status', onStatus);
    return () => socket.off('status', onStatus);
  }, []);

  const navigate = useCallback((p) => {
    window.location.hash = p;
  }, []);
  const toggleSideLog = useCallback(() => setSideLogOpen((v) => !v), []);

  return (
    <AppShell
      title="Electron"
      tabs={SERVER_VIEWER_PAGES}
      page={page}
      onNavigate={navigate}
      rightExtra={
        <div className="flex items-center gap-1">
          <TimeMarkButton />
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setRunsOpen(true)}
            className="h-8 gap-1.5 px-2.5 text-[13px]"
            title="Select runs and download CSV"
          >
            <Database size={13} strokeWidth={1.75} />
            Runs
          </Button>
          <a
            href="/manage"
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-secondary px-2.5 text-[13px] font-medium text-foreground/90 transition-colors outline-none hover:bg-accent hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            <Lock size={13} strokeWidth={1.75} />
            Manage
          </a>
        </div>
      }
    >
      <DatabaseManagementModal
        opened={runsOpen}
        onClose={() => setRunsOpen(false)}
        influxConnected={influxConnected}
        vehicle={vehicle}
        dbcFiles={[]}
        canDeleteRuns={canDeleteRuns}
        eventsOnly
      />
      <div className="min-h-0 flex-1" style={{ display: page === 'info' ? 'flex' : 'none' }}>
        {page === 'info' ? (
          <div className="flex min-h-0 w-full flex-1 flex-col md:flex-row">
            <div className="flex min-h-0 min-w-0 flex-1 flex-col border-b border-border md:border-b-0 md:border-r">
              <LiveMessageLog variant="stage" />
            </div>
            <div className="flex min-h-0 w-full shrink-0 flex-col md:w-[380px] lg:w-[420px]">
              <ServerInfoPanel />
            </div>
          </div>
        ) : null}
      </div>
      {['dashboard', 'analytics', 'dbc-viewer'].map((id) => {
        const Component = id === 'dashboard' ? SignalDashboard : id === 'analytics' ? Analytics : DbcViewer;
        return (
          <div key={id} className="min-h-0 flex-1" style={{ display: page === id ? 'flex' : 'none' }}>
            <PageWithCollapsibleLog logOpen={sideLogOpen} onToggle={toggleSideLog}>
              {page === id ? <Component /> : <div className="min-h-0 flex-1" aria-hidden />}
            </PageWithCollapsibleLog>
          </div>
        );
      })}
    </AppShell>
  );
}

function HomeLink({ className }) {
  return (
    <a
      href="/"
      className={cn(
        'inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-secondary px-2.5 text-[13px] font-medium text-foreground/90 transition-colors outline-none hover:bg-accent hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50',
        className
      )}
    >
      <Home size={13} strokeWidth={1.75} />
      Home
    </a>
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
      const res = await apiJson('/api/manage/login', { method: 'POST', body: JSON.stringify({ password }) });
      if (res?.token) setManageToken(res.token);
      onSuccess();
    } catch (err) {
      setError(err.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative grid flex-1 place-items-center bg-background">
      <div className="absolute left-4 top-4">
        <HomeLink />
      </div>
      <form
        onSubmit={submit}
        className="w-80 rounded-xl border border-border bg-card p-6 shadow-2xl shadow-black/40"
      >
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <h3 className="font-display text-lg font-semibold text-foreground">Manage login</h3>
            <p className="text-sm text-muted-foreground">Password required to control this server.</p>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="manage-password">Password</Label>
            <Input
              id="manage-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.currentTarget.value)}
              autoFocus
            />
          </div>
          {error ? <p className="text-sm text-signal-red">{error}</p> : null}
          <Button type="submit" disabled={loading}>
            {loading ? 'Signing in…' : 'Sign in'}
          </Button>
        </div>
      </form>
    </div>
  );
}

function ServerManageApp() {
  const [authed, setAuthed] = useState(null);
  const [sideLogOpen, setSideLogOpen] = useState(true);

  const refreshSession = useCallback(() => {
    apiJson('/api/manage/session')
      .then((s) => {
        if (!s.authenticated) clearManageToken();
        setAuthed(!!s.authenticated);
      })
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
    clearManageToken();
    setAuthed(false);
  };

  if (authed === null) {
    return (
      <div className="grid h-screen place-items-center bg-background text-sm text-muted-foreground">
        Checking session…
      </div>
    );
  }

  if (!authed) {
    return (
      <div className="flex h-screen flex-col">
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
        <div className="flex items-center gap-1">
          <HomeLink />
          <Button variant="ghost" size="sm" onClick={logout} className="text-muted-foreground">
            Log out
          </Button>
        </div>
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
      <div className="grid h-screen place-items-center bg-background text-sm text-muted-foreground">
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
    <div className="relative flex min-h-0 min-w-0 flex-1">
      <div
        className="flex h-full min-h-0 min-w-0 flex-1 flex-col transition-[margin] duration-200 ease-out"
        style={{ marginRight: logOpen ? sidebarWidth : 0 }}
      >
        {children}
      </div>

      <div
        className="absolute top-1/2 z-[3] -translate-y-1/2 transition-[right] duration-200 ease-out"
        style={{ right: logOpen ? sidebarWidth : 0 }}
      >
        <button
          onClick={onToggle}
          title={logOpen ? 'Hide live log' : 'Show live log'}
          className="flex h-[72px] w-[26px] items-center justify-center rounded-l-xl border border-r-0 border-border bg-card text-muted-foreground shadow-[0_0_12px_rgba(0,0,0,0.6)] transition-colors outline-none hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          {logOpen ? (
            <PanelRightClose size={16} strokeWidth={1.75} />
          ) : (
            <PanelRightOpen size={16} strokeWidth={1.75} />
          )}
        </button>
      </div>

      <div
        className="absolute right-0 top-0 h-full overflow-hidden transition-[width] duration-200 ease-out"
        style={{ width: logOpen ? sidebarWidth : 0 }}
      >
        {logOpen && <LiveMessageLog />}
      </div>
    </div>
  );
});

function NavTab({ icon, label, active, onClick }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-[13px] font-medium transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:ring-inset',
        active
          ? 'bg-accent text-foreground'
          : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
      )}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

export default App;
