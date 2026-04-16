import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Stack, Group, Text, Select, TextInput, Button, Box, Divider, Checkbox, Switch, Grid, ScrollArea } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { socket } from '../socket';
import { Power, RefreshCw, Usb, Wifi, FileText, Circle, Car, Save, Settings2, Database, Square, Cpu, Network } from 'lucide-react';
import { LogFileManagerModal, DbcFileManagerModal } from './FileManagerModals';
import { TcpConfigModal } from './TcpConfigModal';
import { apiJson, backendDownloadUrl } from '../lib/api';

const INPUT_MODES = [
  { value: 'serial_canadapter', label: 'Adapter' },
  { value: 'serial_uart', label: 'UART' },
  { value: 'pcan', label: 'PCAN' },
  { value: 'tcp', label: 'TCP SLCAN' },
  { value: 'capnp_tcp', label: 'Cap\'n Proto' },
  { value: 'file', label: 'File' },
];

const SOURCE_MODE_ICON_SIZE = 14;
const SOURCE_MODE_ICONS = {
  serial_canadapter: Usb,
  serial_uart: Usb,
  pcan: Cpu,
  tcp: Wifi,
  capnp_tcp: Network,
  file: FileText,
};

const CONFIG_KEYS = ['INPUT_MODE', 'DBC_VEHICLE', 'DBC_FILES', 'SERIAL_PORT', 'SERIAL_BAUDRATE', 'CAN_BITRATE', 'TCP_IP', 'TCP_PORT', 'CAPNP_TCP_IP', 'CAPNP_TCP_PORT', 'REPLAY_FILE_PATH', 'INFLUX_WRITE_ENABLED', 'PCAN_CHANNEL', 'PCAN_BITRATE', 'PCAN_DEVICE_ID'];

const CAN_BITRATE_OPTIONS = [
  { value: '125000', label: '125 kbps' },
  { value: '250000', label: '250 kbps' },
  { value: '500000', label: '500 kbps' },
  { value: '1000000', label: '1 Mbps' },
];

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

function arrayShallowEqual(a, b) {
  if (a === b) return true;
  if (!Array.isArray(a) || !Array.isArray(b)) return false;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function statusEquals(a, b) {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    a.service_running === b.service_running &&
    a.influx_connected === b.influx_connected &&
    a.grafana_active === b.grafana_active &&
    a.parser_status === b.parser_status &&
    a.parser_connection_state === b.parser_connection_state &&
    a.error_message === b.error_message &&
    arrayShallowEqual(a.dbc_errors || [], b.dbc_errors || [])
  );
}

export function TelemetryDashboard() {
  const [config, setConfig] = useState(null);
  const [savedConfig, setSavedConfig] = useState(null);
  const [serialPorts, setSerialPorts] = useState([]);
  const [logFiles, setLogFiles] = useState([]);
  const [pcanChannels, setPcanChannels] = useState([]);
  const [pcanPrereq, setPcanPrereq] = useState(null);
  const [vehicles, setVehicles] = useState([]);
  const [dbcFilesForVehicle, setDbcFilesForVehicle] = useState([]);
  const [backendConnected, setBackendConnected] = useState(socket.connected);
  const [status, setStatus] = useState({
    service_running: false,
    influx_connected: false,
    grafana_active: false,
    parser_status: 'idle',
    parser_connection_state: null,
    error_message: null,
  });
  const [loading, setLoading] = useState({ start: false, stop: false, restart: false, save: false, tcpTest: false });
  const [logModalOpen, setLogModalOpen] = useState(false);
  const [dbcModalOpen, setDbcModalOpen] = useState(false);
  const [tcpModalOpen, setTcpModalOpen] = useState(false);
  const [tcpConfigs, setTcpConfigs] = useState([]);

  const inputMode = config?.INPUT_MODE || 'tcp';

  const loadConfig = useCallback(() => {
    apiJson('/api/config')
      .then((data) => {
        setConfig(data);
        setSavedConfig(data);
      })
      .catch((e) => notifications.show({ title: 'Config', message: e.message, color: 'red' }));
  }, []);

  const loadSerialPorts = useCallback(() => {
    apiJson('/api/serial-ports')
      .then((ports) => setSerialPorts(ports.map((p) => ({ value: p.device, label: `${p.device} — ${p.description}` }))))
      .catch((e) => notifications.show({ title: 'Serial ports', message: e.message, color: 'red' }));
  }, []);

  const loadLogFiles = useCallback(() => {
    apiJson('/api/files/log')
      .then((files) => setLogFiles((files || []).map((f) => ({ value: f, label: f }))))
      .catch((e) => notifications.show({ title: 'Log files', message: e.message, color: 'red' }));
  }, []);

  const loadPcanChannels = useCallback(() => {
    apiJson('/api/pcan/channels')
      .then((channels) => setPcanChannels(channels || []))
      .catch((e) => notifications.show({ title: 'PCAN channels', message: e.message, color: 'red' }));
  }, []);

  const loadPcanPrereq = useCallback(() => {
    apiJson('/api/pcan/prerequisites')
      .then(setPcanPrereq)
      .catch(() => setPcanPrereq({ ok: false, message: 'Failed to check', platform: 'unknown', hint: null }));
  }, []);

  const loadTcpConfigs = useCallback(() => {
    apiJson('/api/tcp/configs')
      .then(setTcpConfigs)
      .catch(() => setTcpConfigs([]));
  }, []);

  const loadVehicles = useCallback(() => {
    apiJson('/api/dbc/vehicles')
      .then(setVehicles)
      .catch((e) => notifications.show({ title: 'DBC vehicles', message: e.message, color: 'red' }));
  }, []);

  const loadDbcFilesForVehicle = useCallback((vehicle) => {
    if (!vehicle) return setDbcFilesForVehicle([]);
    apiJson(`/api/dbc/vehicles/${encodeURIComponent(vehicle)}/files`)
      .then((list) => {
        const normalized = (list || []).map((entry) =>
          typeof entry === 'string' ? { name: entry, source: 'local' } : entry
        );
        setDbcFilesForVehicle(normalized);
      })
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
    loadTcpConfigs();
  }, [loadConfig, loadSerialPorts, loadLogFiles, loadVehicles, loadTcpConfigs]);

  useEffect(() => {
    if (inputMode === 'pcan') {
      loadPcanPrereq();
      loadPcanChannels();
    }
  }, [inputMode, loadPcanPrereq, loadPcanChannels]);

  useEffect(() => {
    if (!config || status.service_running || vehicles.length === 0) return;
    const current = config.DBC_VEHICLE?.trim() || '';
    const inList = vehicles.includes(current);
    if (inList) return;
    const defaultName = (config.default_dbc_vehicle || 'Mcqueen').trim();
    const next = vehicles.includes(defaultName) ? defaultName : vehicles[0];
    if (next && next !== current) {
      setConfig((prev) => (prev ? { ...prev, DBC_VEHICLE: next } : null));
    }
  }, [config, vehicles, status.service_running]);

  useEffect(() => {
    const v = config?.DBC_VEHICLE;
    if (v) loadDbcFilesForVehicle(v);
  }, [config?.DBC_VEHICLE, loadDbcFilesForVehicle]);

  useEffect(() => {
    if (!config || status.service_running || dbcFilesForVehicle.length === 0) return;
    const currentVehicle = config.DBC_VEHICLE;
    const names = dbcFilesForVehicle.map((f) => (typeof f === 'string' ? f : f.name));
    const current = Array.isArray(config.DBC_FILES) ? config.DBC_FILES : [];
    const hasInvalidRefs = current.some((name) => !names.includes(name));
    if (!hasInvalidRefs) return;
    const savedVehicle = savedConfig?.DBC_VEHICLE;
    const savedFiles = Array.isArray(savedConfig?.DBC_FILES) ? savedConfig.DBC_FILES : [];
    const next =
      currentVehicle === savedVehicle
        ? savedFiles.filter((name) => names.includes(name))
        : names;
    setConfig((prev) => (prev ? { ...prev, DBC_FILES: next.length ? next : names } : null));
  }, [dbcFilesForVehicle, config?.DBC_FILES, config?.DBC_VEHICLE, savedConfig?.DBC_VEHICLE, savedConfig?.DBC_FILES, status.service_running]);

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
  const lastParserErrorRef = React.useRef(null);
  useEffect(() => {
    const onStatus = (data) => {
      setStatus((prev) => (statusEquals(prev, data) ? prev : data));
      if (data.error_message && data.parser_status === 'error') {
        if (data.error_message !== lastParserErrorRef.current) {
          lastParserErrorRef.current = data.error_message;
          notifications.show({
            title: 'Parser error',
            message: data.error_message,
            color: 'red',
            autoClose: 5000,
          });
        }
      } else {
        lastParserErrorRef.current = null;
      }
      const errs = data.dbc_errors || [];
      if (errs.length && !arrayShallowEqual(errs, lastDbcErrorsRef.current)) {
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
  };

  const toggleDbcFile = (filename, selected) => {
    const current = Array.isArray(config.DBC_FILES) ? config.DBC_FILES : [];
    const set = new Set(current);
    if (selected) {
      set.add(filename);
    } else {
      set.delete(filename);
    }
    const next = Array.from(set).sort();
    setLocalConfig('DBC_FILES', next);
  };

  const handleSave = () => {
    if (status.service_running || !config || !hasValidDbc) return;
    setLoading((l) => ({ ...l, save: true }));
    const keysToSave = CONFIG_KEYS.filter((k) => config[k] !== undefined);
    const saveAll = keysToSave.reduce((acc, key) => acc.then(() =>
      apiJson('/api/config', { method: 'POST', body: JSON.stringify({ key, value: config[key] }) })
    ), Promise.resolve());
    saveAll
      .then(() => {
        setSavedConfig(config);
        notifications.show({ title: 'Config', message: 'Saved', color: 'green' });
      })
      .catch((e) => notifications.show({ title: 'Save failed', message: e.message, color: 'red' }))
      .finally(() => setLoading((l) => ({ ...l, save: false })));
  };

  const showApiError = (e, action) => {
    const msg = e?.message || 'Unknown error';
    const colon = msg.indexOf(': ');
    const title = colon >= 0 ? `${action} — ${msg.slice(0, colon)}` : action;
    const detail = colon >= 0 ? msg.slice(colon + 2) : msg;
    notifications.show({ title, message: detail, color: 'red', autoClose: 5000 });
  };

  const handleStart = () => {
    setLoading((l) => ({ ...l, start: true }));
    setStatus((prev) => ({ ...prev, service_running: true }));
    apiJson('/api/start', { method: 'POST' })
      .then(() => notifications.show({ title: 'Service', message: 'Started', color: 'green' }))
      .catch((e) => {
        setStatus((prev) => ({ ...prev, service_running: false }));
        showApiError(e, 'Start failed');
      })
      .finally(() => setLoading((l) => ({ ...l, start: false })));
  };

  const handleStop = () => {
    setLoading((l) => ({ ...l, stop: true }));
    setStatus((prev) => ({ ...prev, service_running: false }));
    apiJson('/api/stop', { method: 'POST' })
      .then(() => notifications.show({ title: 'Service', message: 'Stopped', color: 'green' }))
      .catch((e) => {
        setStatus((prev) => ({ ...prev, service_running: true }));
        showApiError(e, 'Stop failed');
      })
      .finally(() => setLoading((l) => ({ ...l, stop: false })));
  };

  const handleRestart = () => {
    setLoading((l) => ({ ...l, restart: true }));
    apiJson('/api/restart', { method: 'POST' })
      .then(() => notifications.show({ title: 'Service', message: 'Restarted', color: 'green' }))
      .catch((e) => showApiError(e, 'Restart failed'))
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
            <Group gap="xs" align="flex-end">
              <Select label="Port" data={serialPorts} value={config.SERIAL_PORT} onChange={(v) => setLocalConfig('SERIAL_PORT', v)} searchable disabled={disabled} size="sm" style={{ flex: 1 }} />
              <Button variant="subtle" size="sm" onClick={loadSerialPorts} disabled={disabled} style={{ color: 'var(--text-muted)' }}><RefreshCw size={14} /></Button>
            </Group>
            <Select label="Baud" data={['9600', '115200']} value={String(config.SERIAL_BAUDRATE)} onChange={(v) => setLocalConfig('SERIAL_BAUDRATE', parseInt(v, 10))} disabled={disabled} size="sm" />
            <Select label="CAN bitrate" data={CAN_BITRATE_OPTIONS} value={String(config.CAN_BITRATE)} onChange={(v) => setLocalConfig('CAN_BITRATE', parseInt(v, 10))} disabled={disabled} size="sm" />
          </>
        );
      case 'serial_uart':
        return (
          <>
            <Group gap="xs" align="flex-end">
              <Select label="Port" data={serialPorts} value={config.SERIAL_PORT} onChange={(v) => setLocalConfig('SERIAL_PORT', v)} searchable disabled={disabled} size="sm" style={{ flex: 1 }} />
              <Button variant="subtle" size="sm" onClick={loadSerialPorts} disabled={disabled} style={{ color: 'var(--text-muted)' }}><RefreshCw size={14} /></Button>
            </Group>
            <Select label="Baud" data={['9600', '115200', '230400', '460800', '921600']} value={String(config.SERIAL_BAUDRATE)} onChange={(v) => setLocalConfig('SERIAL_BAUDRATE', parseInt(v, 10))} disabled={disabled} size="sm" />
          </>
        );
      case 'pcan': {
        const channelOptions = pcanChannels.length > 0 ? pcanChannels.map((c) => ({ value: c.channel, label: c.channel })) : [{ value: 'PCAN_USBBUS1', label: 'PCAN_USBBUS1' }, { value: 'PCAN_USBBUS2', label: 'PCAN_USBBUS2' }];
        return (
          <>
            {pcanPrereq && !pcanPrereq.ok && (
              <Box p="xs" mb="xs" style={{ backgroundColor: 'rgba(239,68,68,0.1)', border: '1px solid #ef4444', borderRadius: 4 }}>
                <Text size="xs" c="red">{pcanPrereq.message}</Text>
                {pcanPrereq.hint && <Text size="xs" c="dimmed" mt={4}>{pcanPrereq.hint}</Text>}
              </Box>
            )}
            <Group gap="xs" align="flex-end">
              <Select label="Channel" data={channelOptions} value={config.PCAN_CHANNEL || 'PCAN_USBBUS1'} onChange={(v) => setLocalConfig('PCAN_CHANNEL', v)} searchable disabled={disabled} size="sm" style={{ flex: 1 }} />
              <Button variant="subtle" size="sm" onClick={loadPcanChannels} disabled={disabled} title="Detect PCAN devices"><RefreshCw size={14} /></Button>
            </Group>
            <Select label="CAN bitrate" data={CAN_BITRATE_OPTIONS} value={String(config.PCAN_BITRATE ?? 500000)} onChange={(v) => setLocalConfig('PCAN_BITRATE', parseInt(v, 10))} disabled={disabled} size="sm" />
            <TextInput label="Device ID (optional)" placeholder="Optional" value={config.PCAN_DEVICE_ID != null && config.PCAN_DEVICE_ID !== '' ? String(config.PCAN_DEVICE_ID) : ''} onChange={(e) => { const v = e.currentTarget.value.trim(); setLocalConfig('PCAN_DEVICE_ID', v === '' ? null : parseInt(v, 10) || null); }} disabled={disabled} size="sm" />
          </>
        );
      }
      case 'tcp': {
        const tcpPresetOptions = [{ value: '', label: 'Custom' }, ...tcpConfigs.map((c) => ({ value: c.id, label: `${c.name} (${c.ip}:${c.port})` }))];
        const selectedPreset = tcpConfigs.find((c) => c.ip === config.TCP_IP && c.port === config.TCP_PORT)?.id || '';
        return (
          <>
            <Group gap="xs" align="flex-end">
              <Select label="Preset" data={tcpPresetOptions} value={selectedPreset || ''} onChange={(v) => { const c = tcpConfigs.find((x) => x.id === v); if (c) { setLocalConfig('TCP_IP', c.ip); setLocalConfig('TCP_PORT', c.port); } }} searchable disabled={disabled} size="sm" style={{ flex: 1 }} />
              <Button variant="subtle" size="sm" onClick={() => setTcpModalOpen(true)} disabled={disabled} title="Manage TCP configs"><Settings2 size={14} /></Button>
            </Group>
            <Group grow>
              <TextInput label="IP" value={config.TCP_IP || ''} onChange={(e) => setLocalConfig('TCP_IP', e.target.value)} disabled={disabled} size="sm" />
              <TextInput label="Port" type="number" value={String(config.TCP_PORT || '')} onChange={(e) => setLocalConfig('TCP_PORT', parseInt(e.target.value, 10) || 0)} disabled={disabled} size="sm" />
            </Group>
            <Button variant="subtle" size="compact-sm" onClick={() => { setLoading((l) => ({ ...l, tcpTest: true })); apiJson('/api/tcp/test', { method: 'POST', body: JSON.stringify({ ip: config.TCP_IP || '', port: config.TCP_PORT || 8187 }) }).then((res) => { if (res.ok) notifications.show({ title: 'Connection test', message: res.message, color: 'green' }); else notifications.show({ title: 'Connection failed', message: res.message, color: 'red', autoClose: 5000 }); }).catch((e) => notifications.show({ title: 'Test failed', message: e.message, color: 'red' })).finally(() => setLoading((l) => ({ ...l, tcpTest: false }))); }} loading={loading.tcpTest} disabled={disabled || !config.TCP_IP} leftSection={<Wifi size={12} />}>Test connection</Button>
          </>
        );
      }
      case 'capnp_tcp': {
        const tcpPresetOptions = [{ value: '', label: 'Custom' }, ...tcpConfigs.map((c) => ({ value: c.id, label: `${c.name} (${c.ip}:${c.port})` }))];
        const selectedPreset = tcpConfigs.find((c) => c.ip === config.CAPNP_TCP_IP && c.port === config.CAPNP_TCP_PORT)?.id || '';
        return (
          <>
            <Text size="xs" c="dimmed" mb={4}>Length-prefixed Cap&apos;n Proto frames (see server/util/capnp_schemas/can_frame.capnp).</Text>
            <Group gap="xs" align="flex-end">
              <Select label="Preset" data={tcpPresetOptions} value={selectedPreset || ''} onChange={(v) => { const c = tcpConfigs.find((x) => x.id === v); if (c) { setLocalConfig('CAPNP_TCP_IP', c.ip); setLocalConfig('CAPNP_TCP_PORT', c.port); } }} searchable disabled={disabled} size="sm" style={{ flex: 1 }} />
              <Button variant="subtle" size="sm" onClick={() => setTcpModalOpen(true)} disabled={disabled} title="Manage TCP configs"><Settings2 size={14} /></Button>
            </Group>
            <Group grow>
              <TextInput label="IP" value={config.CAPNP_TCP_IP || ''} onChange={(e) => setLocalConfig('CAPNP_TCP_IP', e.target.value)} disabled={disabled} size="sm" />
              <TextInput label="Port" type="number" value={String(config.CAPNP_TCP_PORT ?? '')} onChange={(e) => setLocalConfig('CAPNP_TCP_PORT', parseInt(e.target.value, 10) || 0)} disabled={disabled} size="sm" />
            </Group>
            <Button variant="subtle" size="compact-sm" onClick={() => { setLoading((l) => ({ ...l, tcpTest: true })); apiJson('/api/tcp/test', { method: 'POST', body: JSON.stringify({ ip: config.CAPNP_TCP_IP || '', port: config.CAPNP_TCP_PORT || 8190 }) }).then((res) => { if (res.ok) notifications.show({ title: 'Connection test', message: res.message, color: 'green' }); else notifications.show({ title: 'Connection failed', message: res.message, color: 'red', autoClose: 5000 }); }).catch((e) => notifications.show({ title: 'Test failed', message: e.message, color: 'red' })).finally(() => setLoading((l) => ({ ...l, tcpTest: false }))); }} loading={loading.tcpTest} disabled={disabled || !config.CAPNP_TCP_IP} leftSection={<Wifi size={12} />}>Test connection</Button>
          </>
        );
      }
      case 'file':
        return (
          <>
            <Group gap="xs" align="flex-end">
              <Select label="Log file" data={logFiles} value={config.REPLAY_FILE_PATH ? config.REPLAY_FILE_PATH.replace(/^.*[/\\]/, '') : null} onChange={(v) => setLocalConfig('REPLAY_FILE_PATH', v)} searchable disabled={disabled} size="sm" style={{ flex: 1 }} />
              <Button variant="subtle" size="sm" onClick={loadLogFiles} disabled={disabled} style={{ color: 'var(--text-muted)' }}><RefreshCw size={14} /></Button>
            </Group>
            <Button variant="subtle" size="compact-sm" onClick={() => setLogModalOpen(true)} style={{ color: 'var(--text-muted)', alignSelf: 'flex-start' }} leftSection={<Settings2 size={12} />}>Edit log files</Button>
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
  const allDbcSelected =
    hasDbcFiles &&
    dbcFilesForVehicle.every((e) => Array.isArray(config?.DBC_FILES) && config.DBC_FILES.includes(e.name));
  const hasValidDbc = hasDbcFiles && hasDbcSelection;
  const saveEnabled = hasUnsavedChanges && !status.service_running && backendConnected && hasValidDbc;
  const startEnabled = !status.service_running && hasValidDbc;
  const canDownloadBackend = !backendConnected && !!backendDownloadUrl;

  const dashboardLayout = {
    display: 'flex',
    flexDirection: 'column',
    flex: 1,
    minHeight: 0,
    overflow: 'hidden',
    maxWidth: 920,
    margin: '0 auto',
    width: '100%',
    padding: 'var(--mantine-spacing-md)',
  };

  return (
    <Box style={dashboardLayout}>
      {/* Top: status + Start/Stop */}
      <Group gap="sm" mb="sm" wrap="wrap" justify="space-between" align="center">
        <Group gap="xs" style={{ backgroundColor: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '8px 12px' }}>
          <Circle size={7} fill={backendConnected ? STATUS_GREEN : STATUS_GRAY} />
          <Text size="sm" c="dimmed">{backendConnected ? 'Backend' : 'Off'}</Text>
          <Circle size={7} fill={status.service_running ? STATUS_GREEN : STATUS_GRAY} />
          <Text size="sm" c="dimmed">{status.service_running ? 'Running' : 'Stopped'}</Text>
          <Circle size={7} fill={status.parser_status === 'running' ? STATUS_GREEN : status.parser_status === 'error' ? '#ef4444' : STATUS_GRAY} />
          <Text size="sm" style={{ color: parserColor }}>{parserLabel === 'Active' ? 'active' : parserLabel === 'Idle' ? 'idle' : parserLabel === 'Done' ? 'done' : parserLabel.toLowerCase()}</Text>
          <Circle size={7} fill={status.influx_connected ? STATUS_GREEN : STATUS_GRAY} />
          <Text size="sm" c="dimmed">Influx</Text>
          <Circle size={7} fill={status.grafana_active ? STATUS_GREEN : STATUS_GRAY} />
          <Text size="sm" c="dimmed">Grafana</Text>
        </Group>
        <Group gap="xs">
          <Button variant="filled" size="sm" leftSection={<Power size={14} />} onClick={handleStart} loading={loading.start} disabled={!startEnabled} bg={startEnabled ? BLUE_ACTIVE : STATUS_GRAY} c={startEnabled ? 'white' : '#a1a1aa'}>Start</Button>
          <Button variant="filled" size="sm" leftSection={<Square size={12} fill="currentColor" />} onClick={handleStop} loading={loading.stop} disabled={!status.service_running} bg={status.service_running ? STOP_RED : STATUS_GRAY} c={status.service_running ? 'white' : '#a1a1aa'}>Stop</Button>
        </Group>
      </Group>
      {canDownloadBackend && (
        <Box
          mb="sm"
          p="xs"
          style={{
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius)',
            backgroundColor: '#111114',
          }}
        >
          <Group justify="space-between" wrap="wrap" gap="xs">
            <Text size="sm" c="dimmed">Backend is offline. Download the desktop backend executable.</Text>
            <Button
              component="a"
              href={backendDownloadUrl}
              target="_blank"
              rel="noreferrer"
              size="xs"
              variant="light"
            >
              Download backend
            </Button>
          </Group>
        </Box>
      )}

      {/* Main: 2 columns — scroll this area only if needed; footer stays visible */}
      <Grid gutter="md" style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
        <Grid.Col span={{ base: 12, sm: 6 }} style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <Text size="sm" c="dimmed" mb={4}>Vehicle</Text>
          <Select data={vehicles.map((v) => ({ value: v, label: v }))} value={config.DBC_VEHICLE || null} onChange={setVehicle} disabled={status.service_running} size="sm" mb="xs" leftSection={<Car size={14} style={{ color: 'var(--text-muted)' }} />} />
          {config.DBC_VEHICLE && (
            dbcFilesForVehicle.length > 0 ? (
              <>
                <Group gap="xs" mb={4} justify="space-between">
                  <Text size="sm" c="dimmed">DBC files</Text>
                  <Button variant="subtle" size="compact-sm" onClick={() => setDbcModalOpen(true)} style={{ color: 'var(--text-muted)' }} leftSection={<Settings2 size={12} />}>Edit</Button>
                </Group>
                <Checkbox label={<Text size="sm" c="dimmed">Select all</Text>} size="sm" checked={allDbcSelected} onChange={(e) => { if (e.currentTarget.checked) setLocalConfig('DBC_FILES', dbcFilesForVehicle.map((f) => f.name)); else setLocalConfig('DBC_FILES', []); }} disabled={status.service_running} mb={4} />
                <ScrollArea h={140} type="auto" scrollbarSize={6} style={{ flex: '0 1 auto' }}>
                  <Stack gap={2}>
                    {dbcFilesForVehicle.map((entry) => {
                      const filename = entry.name;
                      const selected = Array.isArray(config.DBC_FILES) && config.DBC_FILES.includes(filename);
                      const isEmbedded = entry.source === 'embedded';
                      return (
                        <Checkbox key={filename} size="sm" checked={selected} onChange={(e) => toggleDbcFile(filename, e.currentTarget.checked)} disabled={status.service_running} label={isEmbedded ? `${filename} *` : filename} styles={{ label: { width: '100%' } }} />
                      );
                    })}
                  </Stack>
                </ScrollArea>
                <Text size="sm" c="dimmed" mt={4}>* = Embedded Sharepoint</Text>
                {!hasDbcSelection && <Text size="sm" c="orange" mt={4}>Select at least one DBC file.</Text>}
              </>
            ) : (
              <Text size="sm" c="dimmed">No DBC files in this vehicle.</Text>
            )
          )}
        </Grid.Col>
        <Grid.Col span={{ base: 12, sm: 6 }} style={{ display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'auto' }}>
          <Text size="sm" c="dimmed" mb={4}>Source</Text>
          <Group gap="xs" mb="xs" wrap="wrap" align="stretch">
            {INPUT_MODES.map((m) => {
              const Icon = SOURCE_MODE_ICONS[m.value];
              return (
                <Button
                  key={m.value}
                  variant={inputMode === m.value ? 'filled' : 'subtle'}
                  size="xs"
                  color="dark"
                  onClick={() => setLocalConfig('INPUT_MODE', m.value)}
                  disabled={status.service_running}
                  leftSection={Icon ? <Icon size={SOURCE_MODE_ICON_SIZE} strokeWidth={2} style={{ flexShrink: 0 }} /> : undefined}
                  styles={{
                    root: {
                      whiteSpace: 'normal',
                      height: 'auto',
                      minHeight: 36,
                      alignItems: 'center',
                      ...(inputMode === m.value
                        ? { backgroundColor: 'var(--bg-hover)', color: 'var(--text)' }
                        : { color: 'var(--text-muted)' }),
                    },
                    label: { whiteSpace: 'normal', lineHeight: 1.35, textAlign: 'left' },
                    section: { flexShrink: 0 },
                  }}
                >
                  {m.label}
                </Button>
              );
            })}
          </Group>
          <Stack gap="xs" style={{ flex: 1, minHeight: 0 }}>
            {renderModeFields()}
          </Stack>
        </Grid.Col>
      </Grid>

      {/* Footer: Database + Save — always visible */}
      <Divider color="var(--border)" my="sm" />
      <Group gap="sm" justify="space-between" align="center" wrap="nowrap">
        <Group gap="xs">
          <Database size={14} style={{ color: 'var(--text-muted)' }} />
          <Switch size="sm" checked={config.INFLUX_WRITE_ENABLED !== false} onChange={(e) => setLocalConfig('INFLUX_WRITE_ENABLED', e.currentTarget.checked)} disabled={status.service_running} label={config.INFLUX_WRITE_ENABLED !== false ? 'Write on' : 'Write off'} color={config.INFLUX_WRITE_ENABLED !== false ? 'green' : 'red'} styles={{ label: { color: 'var(--text-muted)', fontSize: 13 } }} />
        </Group>
        <Button variant="filled" size="sm" leftSection={<Save size={14} />} onClick={handleSave} loading={loading.save} disabled={!saveEnabled} bg={saveEnabled ? BLUE_ACTIVE : STATUS_GRAY} c={saveEnabled ? 'white' : '#a1a1aa'} style={!saveEnabled ? { opacity: 0.8 } : {}}>Save</Button>
      </Group>

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
      <TcpConfigModal
        opened={tcpModalOpen}
        onClose={() => setTcpModalOpen(false)}
        onRefresh={loadTcpConfigs}
        currentIp={config.TCP_IP}
        currentPort={config.TCP_PORT}
      />
    </Box>
  );
}
