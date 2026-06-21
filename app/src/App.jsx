import { NavLink, Navigate, Route, Routes } from 'react-router-dom';
import { AppShell, Group, Text, NavLink as MantineNavLink } from '@mantine/core';
import { Activity, BarChart3, FileCode2, Settings } from 'lucide-react';
import EventControl from './components/EventControl.jsx';
import SharepointGuard from './components/SharepointGuard.jsx';
import TelemetryWorkspace from './workspaces/telemetry/TelemetryWorkspace.jsx';
import AnalyticsWorkspace from './workspaces/analytics/AnalyticsWorkspace.jsx';
import MdcEditorWorkspace from './workspaces/mdc-editor/MdcEditorWorkspace.jsx';
import ConfigWorkspace from './workspaces/config/ConfigWorkspace.jsx';

const NAV = [
  { to: '/telemetry', label: 'Telemetry', icon: Activity },
  { to: '/analytics', label: 'Analytics', icon: BarChart3 },
  { to: '/mdc', label: 'MDC Editor', icon: FileCode2 },
  { to: '/config', label: 'Config', icon: Settings },
];

export default function App() {
  return (
    <SharepointGuard>
      <AppShell
      header={{ height: 48 }}
      navbar={{ width: 200, breakpoint: 'sm' }}
      padding={0}
    >
      <AppShell.Header px="md">
        <Group h="100%" justify="space-between" wrap="nowrap">
          <Text size="sm" c="dimmed" visibleFrom="sm">
            Session markers
          </Text>
          <EventControl />
        </Group>
      </AppShell.Header>
      <AppShell.Navbar p="xs">
        <Group mb="md" px="xs" gap="xs">
          <Text fw={600} size="sm" style={{ color: 'var(--text)', letterSpacing: '-0.02em' }}>
            CAN
          </Text>
        </Group>
        {NAV.map((item) => {
          const Icon = item.icon;
          return (
            <MantineNavLink
              key={item.to}
              component={NavLink}
              to={item.to}
              label={item.label}
              leftSection={<Icon size={14} strokeWidth={1.75} />}
            />
          );
        })}
      </AppShell.Navbar>
      <AppShell.Main style={{ height: 'calc(100vh - 48px)', overflow: 'hidden' }}>
        <Routes>
          <Route path="/" element={<Navigate to="/telemetry" replace />} />
          <Route path="/telemetry" element={<TelemetryWorkspace />} />
          <Route path="/analytics" element={<AnalyticsWorkspace />} />
          <Route path="/mdc" element={<MdcEditorWorkspace />} />
          <Route path="/config" element={<ConfigWorkspace />} />
        </Routes>
      </AppShell.Main>
    </AppShell>
    </SharepointGuard>
  );
}
