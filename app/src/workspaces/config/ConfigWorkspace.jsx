// Role/config workspace: pick desktop vs server mode, edit engine config
// (sources/sinks/listeners/api), start/stop the engine, and link to Grafana.
// Config shape follows engine/config.schema.json.

import { useEffect, useState } from 'react';
import {
  Anchor,
  Badge,
  Button,
  Card,
  Group,
  JsonInput,
  NumberInput,
  SegmentedControl,
  Select,
  Stack,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useEngineClient, useEngineStatus } from '../../lib/useEngine.jsx';
import { isTauri } from '../../lib/runtime.js';
import { useVehicles } from '../../lib/useVehicles.js';
import SharepointSettings from './SharepointSettings.jsx';
import pkg from '../../../package.json';

const EMPTY_CONFIG = {
  role: 'desktop',
  sources: [],
  sinks: [],
  api: { host: '127.0.0.1', port: 8350 },
  server: { listeners: [{ type: 'tcp-slcan', host: '0.0.0.0', port: 8187 }] },
};

const DEFAULT_LISTENER = { type: 'tcp-slcan', host: '0.0.0.0', port: 8187 };

function normalizeListener(raw) {
  return {
    type: raw?.type === 'capnp-tcp' ? 'capnp-tcp' : 'tcp-slcan',
    host: raw?.host ?? DEFAULT_LISTENER.host,
    port: Number(raw?.port) || DEFAULT_LISTENER.port,
  };
}

export default function ConfigWorkspace() {
  const client = useEngineClient();
  const { status, connected } = useEngineStatus();
  const inTauri = isTauri();
  const { vehicles, settings, resolvedDefault, refresh: refreshVehicles, setDefaultVehicle } = useVehicles();

  const [config, setConfig] = useState(EMPTY_CONFIG);
  const [sourcesText, setSourcesText] = useState('[]');
  const [sinksText, setSinksText] = useState('[]');
  const [listener, setListener] = useState(DEFAULT_LISTENER);
  const [busy, setBusy] = useState(false);
  const [spStatus, setSpStatus] = useState(null);
  const [bitrate, setBitrate] = useState(500000);

  useEffect(() => {
    client
      .getConfig()
      .then((cfg) => {
        const merged = {
          ...EMPTY_CONFIG,
          ...cfg,
          api: { ...EMPTY_CONFIG.api, ...cfg?.api },
          server: { ...EMPTY_CONFIG.server, ...cfg?.server },
        };
        setConfig(merged);
        setSourcesText(JSON.stringify(merged.sources ?? [], null, 2));
        setSinksText(JSON.stringify(merged.sinks ?? [], null, 2));
        const first = merged.server?.listeners?.[0];
        setListener(normalizeListener(first));
      })
      .catch((e) => notifications.show({ title: 'Load config failed', message: e.message, color: 'red' }));
  }, [client]);

  useEffect(() => {
    if (settings?.defaultReadBitrate != null) setBitrate(settings.defaultReadBitrate);
  }, [settings?.defaultReadBitrate]);

  const running = status.service_running;
  const isServer = config.role === 'server';

  const run = async (label, fn) => {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      notifications.show({ title: `${label} failed`, message: e.message, color: 'red' });
    } finally {
      setBusy(false);
    }
  };

  const save = () =>
    run('Save', async () => {
      const next = {
        ...config,
        sources: JSON.parse(sourcesText || '[]'),
        sinks: JSON.parse(sinksText || '[]'),
        server: isServer
          ? { ...config.server, listeners: [listener] }
          : config.server,
      };
      await client.saveConfig(next);
      setConfig(next);
      notifications.show({ title: 'Saved', message: 'Engine config saved', color: 'green' });
    });

  const saveGeneral = () =>
    run('Save settings', async () => {
      await client.updateSettings({
        defaultVehicle: resolvedDefault,
        defaultReadBitrate: Number(bitrate) || 500000,
      });
      await refreshVehicles();
      notifications.show({ title: 'Saved', message: 'General settings updated', color: 'green' });
    });

  const vehicleOptions = vehicles.map((v) => ({ value: v.id, label: v.id }));

  return (
    <Stack p="md" gap="md" style={{ overflow: 'auto', height: '100%' }}>
      <Group justify="space-between">
        <Title order={3}>Settings</Title>
        <Badge variant="outline" color="gray">
          {inTauri ? 'Desktop (Tauri)' : 'Browser'}
        </Badge>
      </Group>

      <Card withBorder>
        <Stack gap="sm">
          <Text fw={600}>General</Text>
          <Group grow align="flex-end">
            <Select
              label="Default vehicle"
              data={vehicleOptions}
              value={resolvedDefault}
              onChange={(v) => v && setDefaultVehicle(v)}
              searchable
              disabled={running}
            />
            <NumberInput
              label="Default read bitrate (bit/s)"
              value={bitrate}
              onChange={setBitrate}
              min={1000}
              step={1000}
              disabled={running}
            />
          </Group>
          <Button size="sm" onClick={saveGeneral} disabled={running || busy} style={{ alignSelf: 'flex-start' }}>
            Save general
          </Button>
        </Stack>
      </Card>

      <SharepointSettings
        settings={settings}
        onSettingsChange={() => refreshVehicles()}
        onStatusChange={setSpStatus}
      />

      <Card withBorder>
        <Stack gap="xs">
          <Text fw={600}>About</Text>
          <Text size="sm">App version {pkg.version}</Text>
          {spStatus?.commit ? (
            <Text size="sm" c="dimmed" ff="monospace">
              Data checkout {spStatus.branch} @ {spStatus.commit}
            </Text>
          ) : null}
        </Stack>
      </Card>

      <Title order={4}>Engine configuration</Title>

      <Card withBorder>
        <Group justify="space-between">
          <Group gap="xs">
            <Text size="sm" c="dimmed">Engine</Text>
            <Text size="sm">{connected ? 'connected' : 'disconnected'}</Text>
            <Text size="sm" c="dimmed">·</Text>
            <Text size="sm">{running ? 'running' : 'stopped'}</Text>
            <Text size="sm" c="dimmed">·</Text>
            <Text size="sm">parser: {status.parser_status}</Text>
            {status.vehicle ? (
              <>
                <Text size="sm" c="dimmed">·</Text>
                <Text size="sm">{status.vehicle}</Text>
              </>
            ) : null}
          </Group>
          <Group>
            <Button onClick={() => run('Start', client.start)} disabled={running || busy}>Start</Button>
            <Button color="red" onClick={() => run('Stop', client.stop)} disabled={!running || busy}>Stop</Button>
          </Group>
        </Group>
      </Card>

      <Card withBorder>
        <Stack gap="sm">
          <Text fw={600}>Role</Text>
          <SegmentedControl
            value={config.role}
            onChange={(role) => setConfig((c) => ({ ...c, role }))}
            disabled={running}
            data={[
              { label: 'Desktop (user)', value: 'desktop' },
              { label: 'Server (host)', value: 'server' },
            ]}
          />
          <Text size="xs" c="dimmed">
            {isServer
              ? 'Server mode: TCP ingest listeners + static web app served by the backend.'
              : 'Desktop mode: local sources via the Tauri sidecar or a remote API.'}
          </Text>
        </Stack>
      </Card>

      <Card withBorder>
        <Stack gap="sm">
          <Text fw={600}>API (REST + WebSocket)</Text>
          <Group grow>
            <TextInput
              label="Host"
              value={config.api?.host ?? ''}
              onChange={(e) =>
                setConfig((c) => ({ ...c, api: { ...c.api, host: e.currentTarget.value } }))
              }
              disabled={running}
            />
            <NumberInput
              label="Port"
              value={config.api?.port ?? 8350}
              onChange={(v) => setConfig((c) => ({ ...c, api: { ...c.api, port: Number(v) || 8350 } }))}
              min={1}
              max={65535}
              disabled={running}
            />
          </Group>
          <Text size="xs" c="dimmed">
            UI talks to {client.httpBase} (override with VITE_ENGINE_BASE_URL).
          </Text>
        </Stack>
      </Card>

      {isServer ? (
        <Card withBorder>
          <Stack gap="sm">
            <Text fw={600}>TCP ingest listener</Text>
            <Text size="xs" c="dimmed">
              Remote producers connect here to push vehicle CAN streams (server.listeners).
            </Text>
            <Group grow align="flex-end">
              <Select
                label="Wire format"
                value={listener.type}
                onChange={(type) => type && setListener((l) => ({ ...l, type }))}
                disabled={running}
                data={[
                  { value: 'tcp-slcan', label: 'TCP SLCAN' },
                  { value: 'capnp-tcp', label: 'Capn Proto TCP' },
                ]}
              />
              <TextInput
                label="Bind host"
                value={listener.host}
                onChange={(e) => setListener((l) => ({ ...l, host: e.currentTarget.value }))}
                disabled={running}
              />
              <NumberInput
                label="Port"
                value={listener.port}
                onChange={(v) => setListener((l) => ({ ...l, port: Number(v) || DEFAULT_LISTENER.port }))}
                min={1}
                max={65535}
                disabled={running}
              />
            </Group>
          </Stack>
        </Card>
      ) : null}

      <Card withBorder>
        <Stack gap="sm">
          <Text fw={600}>Sources</Text>
          <Text size="xs" c="dimmed">
            Input adapters (desktop: socketcan, pcan, file, tcp-slcan client, etc.).
          </Text>
          <JsonInput
            value={sourcesText}
            onChange={setSourcesText}
            disabled={running}
            autosize
            minRows={4}
            formatOnBlur
            validationError="Invalid JSON"
          />
        </Stack>
      </Card>

      <Card withBorder>
        <Stack gap="sm">
          <Text fw={600}>Sinks</Text>
          <Text size="xs" c="dimmed">
            Outputs (influx, sqlite, file) — configured per engine/config.schema.json.
          </Text>
          <JsonInput
            value={sinksText}
            onChange={setSinksText}
            disabled={running}
            autosize
            minRows={4}
            formatOnBlur
            validationError="Invalid JSON"
          />
        </Stack>
      </Card>

      <Group justify="space-between">
        <Button onClick={save} disabled={running || busy}>Save config</Button>
        <Group gap="md">
          {status.grafana_active ? (
            <Badge color="green" variant="dot" size="sm">Grafana active</Badge>
          ) : null}
          {status.grafana_url ? (
            <Anchor href={status.grafana_url} target="_blank" rel="noreferrer">
              Open Grafana
            </Anchor>
          ) : null}
        </Group>
      </Group>
    </Stack>
  );
}
