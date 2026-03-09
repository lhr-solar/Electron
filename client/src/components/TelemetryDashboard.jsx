import React, { useState, useEffect, useCallback } from 'react';
import { Stack, Group, Text, Select, TextInput, Button, Box, Divider, Checkbox, Switch } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { socket } from '../socket';
import { Power, RefreshCw, Usb, Wifi, FileText, Circle, Car, Save, Settings2, Database } from 'lucide-react';
import { LogFileManagerModal, DbcFileManagerModal } from './FileManagerModals';

const INPUT_MODES = [
  { value: 'serial_canadapter', label: 'Adapter' },
  { value: 'serial_uart', label: 'UART' },
  { value: 'tcp', label: 'TCP' },
  { value: 'file', label: 'File' },
];

function api(path, options = {}) {
  return fetch(path, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  }).then(async (res) => {
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.detail || data.message || res.statusText);
    return data;
  });
}

const CONFIG_KEYS = ['INPUT_MODE', 'DBC_VEHICLE', 'DBC_FILES', 'SERIAL_PORT', 'SERIAL_BAUDRATE', 'CAN_BITRATE', 'TCP_IP', 'TCP_PORT', 'REPLAY_FILE_PATH', 'INFLUX_WRITE_ENABLED'];

function configEquals(a, b) {
  if (!a || !b) return !a && !b;
  for (const k of CONFIG_KEYS) {
    const va = a[k];
    const vb = b[k];
    if (Array.isArray(va) && Array.isArray(vb)) {
      if (va.length !== vb.length) return false;
      const sa = [...va].sort();
      const sb = [...vb].sort();
      if (sa.some((v, i) => v !== sb[i])) return false;
    } else if (va !== vb) return false;
  }
  return true;
}

export function TelemetryDashboard() {
  const [config, setConfig] = useState(null);
  const [savedConfig, setSavedConfig] = useState(null);
  const [serialPorts, setSerialPorts] = useState([]);
  const [logFiles, setLogFiles] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [dbcFilesForVehicle, setDbcFilesForVehicle] = useState([]);
  const hasDefaultedDbcRef = React.useRef(false);
  const [backendConnected, setBackendConnected] = useState(socket.connected);
  const [status, setStatus] = useState({
    service_running: false,
    influx_connected: false,
    grafana_active: false,
    parser_status: 'idle',
    parser_connection_state: null,
    error_message: null,
  });
  const [loading, setLoading] = useState({ start: false, stop: false, restart: false, save: false });
  const [logModalOpen, setLogModalOpen] = useState(false);
  const [dbcModalOpen, setDbcModalOpen] = useState(false);

  const inputMode = config?.INPUT_MODE === 'serial' ? 'serial_canadapter' : (config?.INPUT_MODE || 'tcp');

  const loadConfig = useCallback(() => {
    api('/api/config')
      .then((data) => {
        setConfig(data);
        setSavedConfig(data);
      })
      .catch((e) => notifications.show({ title: 'Config', message: e.message, color: 'red' }));
  }, []);

  const loadSerialPorts = useCallback(() => {
    api('/api/serial-ports')
      .then((ports) => setSerialPorts(ports.map((p) => ({ value: p.device, label: `${p.device} — ${p.description}` }))))
      .catch((e) => notifications.show({ title: 'Serial ports', message: e.message, color: 'red' }));
  }, []);

  const loadLogFiles = useCallback(() => {
    api('/api/files/log')
      .then((files) => setLogFiles((files || []).map((f) => ({ value: f, label: f }))))
      .catch((e) => notifications.show({ title: 'Log files', message: e.message, color: 'red' }));
  }, []);

  const loadVehicles = useCallback(() => {
    api('/api/dbc/vehicles')
      .then(setVehicles)
      .catch((e) => notifications.show({ title: 'DBC vehicles', message: e.message, color: 'red' }));
  }, []);

  const loadDbcFilesForVehicle = useCallback((vehicle) => {
    if (!vehicle) return setDbcFilesForVehicle([]);
    api(`/api/dbc/vehicles/${encodeURIComponent(vehicle)}/files`)
      .then(setDbcFilesForVehicle)
      .catch((e) => {
        setDbcFilesForVehicle([]);
        notifications.show({ title: 'DBC files', message: e.message, color: 'red' });
      });
  }, []);

  useEffect(() => {
    loadConfig();
    loadSerialPorts();
    loadLogFiles();
    loadVehicles();
  }, [loadConfig, loadSerialPorts, loadLogFiles, loadVehicles]);

  useEffect(() => {
    const v = config?.DBC_VEHICLE;
    if (v) loadDbcFilesForVehicle(v);
  }, [config?.DBC_VEHICLE, loadDbcFilesForVehicle]);

  useEffect(() => {
    if (hasDefaultedDbcRef.current || !config || status.service_running) return;
    const files = config.DBC_FILES;
    const hasNoSelection = !files || (Array.isArray(files) && files.length === 0);
    if (hasNoSelection && dbcFilesForVehicle.length > 0) {
      hasDefaultedDbcRef.current = true;
      setConfig((prev) => (prev ? { ...prev, DBC_FILES: dbcFilesForVehicle } : null));
    }
  }, [dbcFilesForVehicle, config?.DBC_FILES, config?.DBC_VEHICLE, status.service_running]);

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

  const lastDbcErrorsRef = React.useRef([]);
  useEffect(() => {
    const onStatus = (data) => {
      setStatus(data);
      if (data.error_message && data.parser_status === 'error') {
        notifications.show({
          title: 'Parser error',
          message: data.error_message,
          color: 'red',
          autoClose: 3000,
        });
      }
      const errs = data.dbc_errors || [];
      if (errs.length && JSON.stringify(errs) !== JSON.stringify(lastDbcErrorsRef.current)) {
        lastDbcErrorsRef.current = errs;
        errs.forEach((msg) =>
          notifications.show({ title: 'DBC error', message: msg, color: 'red', autoClose: 3000 })
        );
      } else if (!errs.length) lastDbcErrorsRef.current = [];
    };
    socket.on('status', onStatus);
    return () => socket.off('status', onStatus);
  }, []);

  const setLocalConfig = (key, value) => {
    if (status.service_running) return;
    setConfig((prev) => (prev ? { ...prev, [key]: value } : null));
  };

  const setVehicle = (vehicle) => {
    if (status.service_running) return;
    setConfig((prev) => (prev ? { ...prev, DBC_VEHICLE: vehicle } : null));
    if (vehicle) {
      api(`/api/dbc/vehicles/${encodeURIComponent(vehicle)}/files`)
        .then((files) => {
          const list = Array.isArray(files) ? files : [];
          setDbcFilesForVehicle(list);
          setConfig((prev) => (prev ? { ...prev, DBC_FILES: list } : null));
        })
        .catch(() => setDbcFilesForVehicle([]));
    } else {
      setDbcFilesForVehicle([]);
    }
  };

  const toggleDbcFile = (filename, selected) => {
    const current = Array.isArray(config.DBC_FILES) ? config.DBC_FILES : [];
    const next = selected ? [...current, filename].filter(Boolean).sort() : current.filter((f) => f !== filename);
    setLocalConfig('DBC_FILES', next);
  };

  const handleSave = () => {
    if (status.service_running || !config || !hasValidDbc) return;
    setLoading((l) => ({ ...l, save: true }));
    const keysToSave = CONFIG_KEYS.filter((k) => config[k] !== undefined);
    const saveAll = keysToSave.reduce((acc, key) => acc.then(() =>
      api('/api/config', { method: 'POST', body: JSON.stringify({ key, value: config[key] }) })
    ), Promise.resolve());
    saveAll
      .then(() => {
        setSavedConfig(config);
        notifications.show({ title: 'Config', message: 'Saved', color: 'green' });
      })
      .catch((e) => notifications.show({ title: 'Save failed', message: e.message, color: 'red' }))
      .finally(() => setLoading((l) => ({ ...l, save: false })));
  };

  const handleStart = () => {
    setLoading((l) => ({ ...l, start: true }));
    api('/api/start', { method: 'POST' })
      .then(() => notifications.show({ title: 'Service', message: 'Started', color: 'green' }))
      .catch((e) => notifications.show({ title: 'Start failed', message: e.message, color: 'red' }))
      .finally(() => setLoading((l) => ({ ...l, start: false })));
  };

  const handleStop = () => {
    setLoading((l) => ({ ...l, stop: true }));
    api('/api/stop', { method: 'POST' })
      .then(() => notifications.show({ title: 'Service', message: 'Stopped', color: 'green' }))
      .catch((e) => notifications.show({ title: 'Stop failed', message: e.message, color: 'red' }))
      .finally(() => setLoading((l) => ({ ...l, stop: false })));
  };

  const handleRestart = () => {
    setLoading((l) => ({ ...l, restart: true }));
    api('/api/restart', { method: 'POST' })
      .then(() => notifications.show({ title: 'Service', message: 'Restarted', color: 'green' }))
      .catch((e) => notifications.show({ title: 'Restart failed', message: e.message, color: 'red' }))
      .finally(() => setLoading((l) => ({ ...l, restart: false })));
  };

  if (!config) {
    return (
      <Box p="xl" style={{ color: 'var(--text-muted)' }}>
        Loading…
      </Box>
    );
  }

  const renderModeFields = () => {
    const disabled = status.service_running;
    switch (inputMode) {
      case 'serial_canadapter':
        return (
          <>
            <Group gap="sm" align="flex-end">
              <Select
                label="Port"
                data={serialPorts}
                value={config.SERIAL_PORT}
                onChange={(v) => setLocalConfig('SERIAL_PORT', v)}
                searchable
                disabled={disabled}
                size="sm"
                style={{ flex: 1 }}
              />
              <Button variant="subtle" size="sm" onClick={loadSerialPorts} disabled={disabled} style={{ color: 'var(--text-muted)' }}>
                <RefreshCw size={14} />
              </Button>
            </Group>
            <Select
              label="Baud"
              data={['9600', '115200']}
              value={String(config.SERIAL_BAUDRATE)}
              onChange={(v) => setLocalConfig('SERIAL_BAUDRATE', parseInt(v, 10))}
              disabled={disabled}
              size="sm"
            />
            <Select
              label="CAN bitrate"
              data={['125000', '250000', '500000', '1000000']}
              value={String(config.CAN_BITRATE)}
              onChange={(v) => setLocalConfig('CAN_BITRATE', parseInt(v, 10))}
              disabled={disabled}
              size="sm"
            />
          </>
        );
      case 'serial_uart':
        return (
          <>
            <Group gap="sm" align="flex-end">
              <Select
                label="Port"
                data={serialPorts}
                value={config.SERIAL_PORT}
                onChange={(v) => setLocalConfig('SERIAL_PORT', v)}
                searchable
                disabled={disabled}
                size="sm"
                style={{ flex: 1 }}
              />
              <Button variant="subtle" size="sm" onClick={loadSerialPorts} disabled={disabled} style={{ color: 'var(--text-muted)' }}>
                <RefreshCw size={14} />
              </Button>
            </Group>
            <Select
              label="Baud"
              data={['9600', '115200', '230400', '460800', '921600']}
              value={String(config.SERIAL_BAUDRATE)}
              onChange={(v) => setLocalConfig('SERIAL_BAUDRATE', parseInt(v, 10))}
              disabled={disabled}
              size="sm"
            />
          </>
        );
      case 'tcp':
        return (
          <>
            <TextInput
              label="IP"
              value={config.TCP_IP || ''}
              onChange={(e) => setLocalConfig('TCP_IP', e.target.value)}
              disabled={disabled}
              size="sm"
            />
            <TextInput
              label="Port"
              type="number"
              value={String(config.TCP_PORT || '')}
              onChange={(e) => setLocalConfig('TCP_PORT', parseInt(e.target.value, 10) || 0)}
              disabled={disabled}
              size="sm"
            />
          </>
        );
      case 'file':
        return (
          <>
            <Group gap="sm" align="flex-end">
              <Select
                label="Log file"
                data={logFiles}
                value={config.REPLAY_FILE_PATH ? config.REPLAY_FILE_PATH.replace(/^.*[/\\]/, '') : null}
                onChange={(v) => setLocalConfig('REPLAY_FILE_PATH', v)}
                searchable
                disabled={disabled}
                size="sm"
                style={{ flex: 1 }}
              />
              <Button variant="subtle" size="sm" onClick={loadLogFiles} disabled={disabled} style={{ color: 'var(--text-muted)' }}>
                <RefreshCw size={14} />
              </Button>
            </Group>
            <Button
              variant="subtle"
              size="compact-xs"
              onClick={() => setLogModalOpen(true)}
              style={{ color: 'var(--text-muted)', alignSelf: 'flex-start' }}
              leftSection={<Settings2 size={12} />}
            >
              Edit log files
            </Button>
          </>
        );
      default:
        return null;
    }
  };

  const parserLabel = status.parser_status === 'running' ? 'Active' : status.parser_status === 'error' ? 'Error' : status.parser_status === 'finished' ? 'Done' : 'Idle';
  const parserColor = status.parser_status === 'running' ? '#22c55e' : status.parser_status === 'error' ? '#ef4444' : '#71717a';

  const STATUS_GREEN = '#22c55e';
  const STATUS_GRAY = '#71717a';
  const BLUE_ACTIVE = '#3b82f6';
  const STOP_RED = '#ef4444';

  const hasUnsavedChanges = config && savedConfig && !configEquals(config, savedConfig);
  const hasDbcFiles = dbcFilesForVehicle.length > 0;
  const hasDbcSelection = Array.isArray(config?.DBC_FILES) && config.DBC_FILES.length > 0;
  const hasValidDbc = hasDbcFiles && hasDbcSelection;
  const saveEnabled = hasUnsavedChanges && !status.service_running && backendConnected && hasValidDbc;
  const startEnabled = !status.service_running && hasValidDbc;

  return (
    <Stack gap={0} style={{ maxWidth: 420, margin: '0 auto' }} p="xl">
      <Text size="xs" c="dimmed" tt="uppercase" mb="md">
        Telemetry
      </Text>

      <Stack gap={4} mb="xl">
        <Group gap={6}>
          <Circle size={8} fill={backendConnected ? STATUS_GREEN : STATUS_GRAY} />
          <Text size="sm" c="dimmed">{backendConnected ? 'Backend' : 'Backend (disconnected)'}</Text>
        </Group>
        <Group gap={6}>
          <Circle size={8} fill={status.service_running ? STATUS_GREEN : STATUS_GRAY} />
          <Text size="sm" c="dimmed">
            {status.service_running ? 'Service running' : 'Service stopped'}
          </Text>
        </Group>
        <Group gap={6}>
          <Circle size={8} fill={status.parser_status === 'running' ? STATUS_GREEN : status.parser_status === 'error' ? '#ef4444' : STATUS_GRAY} />
          <Text size="sm" style={{ color: parserColor }}>
            Parser: {parserLabel === 'Active' ? 'receiving data' : parserLabel === 'Idle' ? 'waiting' : parserLabel === 'Done' ? 'finished' : parserLabel.toLowerCase()}
          </Text>
        </Group>
        <Group gap={6}>
          <Circle size={8} fill={status.influx_connected ? STATUS_GREEN : STATUS_GRAY} />
          <Text size="sm" c="dimmed">
            {status.influx_connected ? 'InfluxDB' : 'InfluxDB (disconnected)'}
            {status.influx_bucket && <Text span size="sm" c="dimmed"> · {status.influx_bucket}</Text>}
          </Text>
        </Group>
        <Group gap={6}>
          <Circle size={8} fill={status.grafana_active ? STATUS_GREEN : STATUS_GRAY} />
          <Text size="sm" c="dimmed">{status.grafana_active ? 'Grafana' : 'Grafana (inactive)'}</Text>
        </Group>
      </Stack>

      <Group gap="sm" mb="xl">
        <Button
          variant="filled"
          size="sm"
          leftSection={<Power size={14} />}
          onClick={handleStart}
          loading={loading.start}
          disabled={!startEnabled}
          bg={startEnabled ? BLUE_ACTIVE : STATUS_GRAY}
          c={startEnabled ? 'white' : '#a1a1aa'}
          style={!startEnabled ? { opacity: 0.8 } : {}}
        >
          Start
        </Button>
        <Button
          variant="filled"
          size="sm"
          leftSection={<Power size={14} />}
          onClick={handleStop}
          loading={loading.stop}
          disabled={!status.service_running}
          bg={status.service_running ? STOP_RED : STATUS_GRAY}
          c={status.service_running ? 'white' : '#a1a1aa'}
          style={!status.service_running ? { opacity: 0.8 } : {}}
        >
          Stop
        </Button>
        <Button
          variant="filled"
          size="sm"
          leftSection={<RefreshCw size={14} />}
          onClick={handleRestart}
          loading={loading.restart}
          disabled={!backendConnected}
          bg={backendConnected ? BLUE_ACTIVE : STATUS_GRAY}
          c={backendConnected ? 'white' : '#a1a1aa'}
          style={!backendConnected ? { opacity: 0.8 } : {}}
        >
          Restart
        </Button>
      </Group>

      <Divider color="var(--border)" mb="md" />

      <Text size="xs" c="dimmed" mb="xs">
        Vehicle
      </Text>
      <Select
        data={vehicles.map((v) => ({ value: v, label: v }))}
        value={config.DBC_VEHICLE || null}
        onChange={setVehicle}
        disabled={status.service_running}
        size="sm"
        mb="md"
        leftSection={<Car size={14} style={{ color: 'var(--text-muted)' }} />}
      />
      {config.DBC_VEHICLE && (
        dbcFilesForVehicle.length > 0 ? (
          <>
            <Group gap="xs" mb="xs" justify="space-between">
              <Text size="xs" c="dimmed">DBC files</Text>
              <Button
                variant="subtle"
                size="compact-xs"
                onClick={() => setDbcModalOpen(true)}
                style={{ color: 'var(--text-muted)' }}
                leftSection={<Settings2 size={12} />}
              >
                Edit
              </Button>
            </Group>
            <Stack gap="xs" mb={hasDbcSelection ? 'md' : 0}>
              {dbcFilesForVehicle.map((filename) => {
                const selected = Array.isArray(config.DBC_FILES) && config.DBC_FILES.includes(filename);
                return (
                  <Checkbox
                    key={filename}
                    label={filename}
                    size="xs"
                    checked={selected}
                    onChange={(e) => toggleDbcFile(filename, e.currentTarget.checked)}
                    disabled={status.service_running}
                    styles={{ label: { color: 'var(--text)' } }}
                  />
                );
              })}
            </Stack>
            {!hasDbcSelection && (
              <Text size="xs" c="orange" mb="md">
                Select at least one DBC file to save or start.
              </Text>
            )}
          </>
        ) : (
          <Text size="xs" c="dimmed" mb="md">
            No DBC files found in this vehicle folder.
          </Text>
        )
      )}

      <Text size="xs" c="dimmed" mb="xs">
        Source
      </Text>
      <Group gap={8} mb="md">
        {INPUT_MODES.map((m) => (
          <Button
            key={m.value}
            variant={inputMode === m.value ? 'filled' : 'subtle'}
            size="xs"
            color="dark"
            onClick={() => setLocalConfig('INPUT_MODE', m.value)}
            disabled={status.service_running}
            style={
              inputMode === m.value
                ? { backgroundColor: '#27272a', color: 'var(--text)' }
                : { color: 'var(--text-muted)' }
            }
          >
            {m.value === 'serial_canadapter' && <Usb size={12} style={{ marginRight: 4 }} />}
            {m.value === 'serial_uart' && <Usb size={12} style={{ marginRight: 4 }} />}
            {m.value === 'tcp' && <Wifi size={12} style={{ marginRight: 4 }} />}
            {m.value === 'file' && <FileText size={12} style={{ marginRight: 4 }} />}
            {m.label}
          </Button>
        ))}
      </Group>

      <Stack gap="sm">
        {renderModeFields()}
      </Stack>

      <Divider color="var(--border)" mt="md" mb="md" />

      <Group gap="xs" mb="xs" align="center" justify="space-between">
        <Group gap={6}>
          <Database size={14} style={{ color: 'var(--text-muted)' }} />
          <Text size="xs" c="dimmed">Database</Text>
        </Group>
        <Switch
          size="xs"
          checked={config.INFLUX_WRITE_ENABLED !== false}
          onChange={(e) => setLocalConfig('INFLUX_WRITE_ENABLED', e.currentTarget.checked)}
          disabled={status.service_running}
          label={config.INFLUX_WRITE_ENABLED !== false ? 'Write enabled' : 'Write disabled'}
          color={config.INFLUX_WRITE_ENABLED !== false ? 'green' : 'red'}
          styles={{
            label: { color: 'var(--text-muted)', fontSize: 12 },
            track: {
              backgroundColor: config.INFLUX_WRITE_ENABLED !== false ? '#22c55e' : '#ef4444',
              borderColor: config.INFLUX_WRITE_ENABLED !== false ? '#22c55e' : '#ef4444',
            },
          }}
        />
      </Group>
      <Button
        variant="filled"
        size="sm"
        leftSection={<Save size={14} />}
        onClick={handleSave}
        loading={loading.save}
        disabled={!saveEnabled}
        mt="xs"
        bg={saveEnabled ? BLUE_ACTIVE : STATUS_GRAY}
        c={saveEnabled ? 'white' : '#a1a1aa'}
        style={!saveEnabled ? { opacity: 0.8 } : {}}
      >
        Save
      </Button>

      <LogFileManagerModal
        opened={logModalOpen}
        onClose={() => setLogModalOpen(false)}
        onFilesChanged={loadLogFiles}
      />
      <DbcFileManagerModal
        opened={dbcModalOpen}
        onClose={() => setDbcModalOpen(false)}
        vehicles={vehicles}
        currentVehicle={config.DBC_VEHICLE}
        onFilesChanged={() => loadDbcFilesForVehicle(config.DBC_VEHICLE)}
        onVehiclesChanged={loadVehicles}
      />
    </Stack>
  );
}
