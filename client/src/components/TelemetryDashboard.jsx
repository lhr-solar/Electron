import React, { useState, useEffect, useCallback, useRef } from 'react';
import { notifications } from '@/lib/notify';
import { socket } from '../socket';
import { Power, RefreshCw, Usb, Wifi, FileText, Car, Save, Settings2, Database, Square, Cpu, Network, Loader2 } from 'lucide-react';
import { LogFileManagerModal, DbcFileManagerModal } from './FileManagerModals';
import { CanpConfigModal } from './CanpConfigModal';
import { DatabaseManagementModal } from './DatabaseManagementModal';
import { apiJson, backendDownloadUrl } from '../lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { cn } from '@/lib/utils';

const INPUT_MODES = [
  { value: 'serial_canadapter', label: 'Adapter' },
  { value: 'serial_uart', label: 'UART' },
  { value: 'pcan', label: 'PCAN' },
  { value: 'tcp', label: 'TCP SLCAN' },
  { value: 'canp_tcp', label: 'CANP (Photon)' },
  { value: 'file', label: 'File' },
];

const SERVER_INPUT_MODES = INPUT_MODES.filter((m) => m.value === 'canp_tcp');
const SERVER_MODE_VALUES = new Set(SERVER_INPUT_MODES.map((m) => m.value));

const SOURCE_MODE_ICON_SIZE = 14;
const SOURCE_MODE_ICONS = {
  serial_canadapter: Usb,
  serial_uart: Usb,
  pcan: Cpu,
  tcp: Wifi,
  canp_tcp: Network,
  file: FileText,
};

const CONFIG_KEYS = ['INPUT_MODE', 'DBC_VEHICLE', 'DBC_FILES', 'SERIAL_PORT', 'SERIAL_BAUDRATE', 'CAN_BITRATE', 'TCP_IP', 'TCP_PORT', 'CANP_TCP_IP', 'CANP_TCP_PORT', 'REPLAY_FILE_PATH', 'INFLUX_WRITE_ENABLED', 'INFLUX_TELEMETRY_BUCKET', 'PCAN_CHANNEL', 'PCAN_BITRATE', 'PCAN_DEVICE_ID'];

const CAN_BITRATE_OPTIONS = [
  { value: '125000', label: '125 kbps' },
  { value: '250000', label: '250 kbps' },
  { value: '500000', label: '500 kbps' },
  { value: '1000000', label: '1 Mbps' },
];

const CUSTOM_PRESET = '__custom__';

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
    a.data_active === b.data_active &&
    a.error_message === b.error_message &&
    arrayShallowEqual(a.dbc_errors || [], b.dbc_errors || [])
  );
}

function FieldLabel({ children, className }) {
  return <Label className={cn('text-xs font-medium text-muted-foreground', className)}>{children}</Label>;
}

function ConfigSelect({ label, value, onValueChange, options, disabled, className, triggerClassName }) {
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      {label && <FieldLabel>{label}</FieldLabel>}
      <Select value={value} onValueChange={onValueChange} disabled={disabled}>
        <SelectTrigger size="sm" className={cn('w-full', triggerClassName)}>
          <SelectValue placeholder="Select…" />
        </SelectTrigger>
        <SelectContent>
          {options.map((opt) => (
            <SelectItem key={opt.value} value={String(opt.value)}>
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function ConfigInput({ label, className, inputClassName, ...props }) {
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      {label && <FieldLabel>{label}</FieldLabel>}
      <Input className={cn('h-8 text-sm', inputClassName)} {...props} />
    </div>
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
    data_active: false,
    error_message: null,
  });
  const [loading, setLoading] = useState({ start: false, stop: false, save: false, tcpTest: false });
  const [logModalOpen, setLogModalOpen] = useState(false);
  const [dbcModalOpen, setDbcModalOpen] = useState(false);
  const [canpModalOpen, setCanpModalOpen] = useState(false);
  const [dbModalOpen, setDbModalOpen] = useState(false);
  const [canpConfigs, setCanpConfigs] = useState([]);
  const [appMode, setAppMode] = useState(null);
  const canDownloadBackend = !backendConnected && !!backendDownloadUrl;
  const selectAllDbcOnLoadRef = useRef(false);

  const isServerMode = appMode === 'server';
  const availableModes = isServerMode ? SERVER_INPUT_MODES : INPUT_MODES;
  const inputMode = config?.INPUT_MODE || 'tcp';

  const loadConfig = useCallback(() => {
    apiJson('/api/config')
      .then((data) => {
        setConfig(data);
        setSavedConfig(data);
      })
      .catch((e) => notifications.show({ title: 'Config', message: e.message, color: 'red' }));
  }, []);

  const loadAppMode = useCallback(() => {
    apiJson('/api/runtime-info')
      .then((info) => setAppMode(info.mode === 'server' ? 'server' : 'client'))
      .catch(() => setAppMode('client'));
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

  const loadCanpConfigs = useCallback(() => {
    apiJson('/api/canp/configs')
      .then(setCanpConfigs)
      .catch(() => setCanpConfigs([]));
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
    loadCanpConfigs();
    loadAppMode();
  }, [loadConfig, loadSerialPorts, loadLogFiles, loadVehicles, loadCanpConfigs, loadAppMode]);

  useEffect(() => {
    if (!isServerMode || !config || status.service_running) return;
    if (SERVER_MODE_VALUES.has(config.INPUT_MODE)) return;
    setConfig((prev) => (prev ? { ...prev, INPUT_MODE: 'canp_tcp' } : null));
  }, [isServerMode, config, status.service_running]);

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
    const defaultName = (config.default_dbc_vehicle || 'HighNoon').trim();
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
    const names = dbcFilesForVehicle.map((f) => (typeof f === 'string' ? f : f.name));
    if (selectAllDbcOnLoadRef.current) {
      selectAllDbcOnLoadRef.current = false;
      setConfig((prev) => (prev ? { ...prev, DBC_FILES: names } : null));
      return;
    }
    const current = Array.isArray(config.DBC_FILES) ? config.DBC_FILES : [];
    const hasInvalidRefs = current.some((name) => !names.includes(name));
    if (!hasInvalidRefs) return;
    const savedVehicle = savedConfig?.DBC_VEHICLE;
    const savedFiles = Array.isArray(savedConfig?.DBC_FILES) ? savedConfig.DBC_FILES : [];
    const next =
      config.DBC_VEHICLE === savedVehicle
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

  useEffect(() => {
    if (!status.influx_connected && config && config.INFLUX_WRITE_ENABLED !== false) {
      setConfig((c) => (c ? { ...c, INFLUX_WRITE_ENABLED: false } : c));
      setSavedConfig((c) => (c ? { ...c, INFLUX_WRITE_ENABLED: false } : c));
    }
  }, [status.influx_connected, config?.INFLUX_WRITE_ENABLED]);

  const setLocalConfig = (key, value) => {
    if (status.service_running) return;
    setConfig((prev) => (prev ? { ...prev, [key]: value } : null));
  };

  const setVehicle = (vehicle) => {
    if (status.service_running) return;
    selectAllDbcOnLoadRef.current = true;
    setConfig((prev) => (prev ? { ...prev, DBC_VEHICLE: vehicle, DBC_FILES: [] } : null));
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

  const influxWriteOn = config?.INFLUX_WRITE_ENABLED !== false && status.influx_connected;

  if (!config) {
    return (
      <div className="mx-auto flex w-full max-w-[920px] flex-1 flex-col gap-4 overflow-hidden p-4">
        <Card className="flex flex-1 flex-col gap-0 rounded-lg py-0">
          <CardContent className="flex flex-1 items-center justify-center px-6 py-12 text-center">
            <p className="text-sm text-muted-foreground">
              {backendConnected ? 'Loading configuration…' : 'Backend not connected'}
            </p>
          </CardContent>
        </Card>
        {canDownloadBackend && (
          <Alert className="rounded-lg border-border bg-muted/50">
            <AlertDescription className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm text-muted-foreground">
                Backend is offline. Download the desktop backend executable.
              </span>
              <Button asChild variant="outline" size="xs">
                <a href={backendDownloadUrl} target="_blank" rel="noreferrer">
                  Download backend
                </a>
              </Button>
            </AlertDescription>
          </Alert>
        )}
      </div>
    );
  }

  const renderModeFields = () => {
    const disabled = status.service_running;
    switch (inputMode) {
      case 'serial_canadapter':
        return (
          <>
            <div className="flex items-end gap-2">
              <ConfigSelect
                label="Port"
                className="min-w-0 flex-1"
                value={config.SERIAL_PORT || undefined}
                onValueChange={(v) => setLocalConfig('SERIAL_PORT', v)}
                options={serialPorts}
                disabled={disabled}
              />
              <Button variant="ghost" size="icon-sm" onClick={loadSerialPorts} disabled={disabled} title="Refresh ports">
                <RefreshCw className="size-3.5 text-muted-foreground" />
              </Button>
            </div>
            <ConfigSelect
              label="Baud"
              value={String(config.SERIAL_BAUDRATE)}
              onValueChange={(v) => setLocalConfig('SERIAL_BAUDRATE', parseInt(v, 10))}
              options={['9600', '115200'].map((b) => ({ value: b, label: b }))}
              disabled={disabled}
            />
            <ConfigSelect
              label="CAN bitrate"
              value={String(config.CAN_BITRATE)}
              onValueChange={(v) => setLocalConfig('CAN_BITRATE', parseInt(v, 10))}
              options={CAN_BITRATE_OPTIONS}
              disabled={disabled}
            />
          </>
        );
      case 'serial_uart':
        return (
          <>
            <div className="flex items-end gap-2">
              <ConfigSelect
                label="Port"
                className="min-w-0 flex-1"
                value={config.SERIAL_PORT || undefined}
                onValueChange={(v) => setLocalConfig('SERIAL_PORT', v)}
                options={serialPorts}
                disabled={disabled}
              />
              <Button variant="ghost" size="icon-sm" onClick={loadSerialPorts} disabled={disabled} title="Refresh ports">
                <RefreshCw className="size-3.5 text-muted-foreground" />
              </Button>
            </div>
            <ConfigSelect
              label="Baud"
              value={String(config.SERIAL_BAUDRATE)}
              onValueChange={(v) => setLocalConfig('SERIAL_BAUDRATE', parseInt(v, 10))}
              options={['9600', '115200', '230400', '460800', '921600'].map((b) => ({ value: b, label: b }))}
              disabled={disabled}
            />
          </>
        );
      case 'pcan': {
        const channelOptions = pcanChannels.length > 0
          ? pcanChannels.map((c) => ({ value: c.channel, label: c.channel }))
          : [{ value: 'PCAN_USBBUS1', label: 'PCAN_USBBUS1' }, { value: 'PCAN_USBBUS2', label: 'PCAN_USBBUS2' }];
        return (
          <>
            {pcanPrereq && !pcanPrereq.ok && (
              <Alert className="rounded-md border-signal-red/30 bg-signal-red/10">
                <AlertDescription>
                  <p className="text-xs text-signal-red">{pcanPrereq.message}</p>
                  {pcanPrereq.hint && <p className="mt-1 text-xs text-muted-foreground">{pcanPrereq.hint}</p>}
                </AlertDescription>
              </Alert>
            )}
            <div className="flex items-end gap-2">
              <ConfigSelect
                label="Channel"
                className="min-w-0 flex-1"
                value={config.PCAN_CHANNEL || 'PCAN_USBBUS1'}
                onValueChange={(v) => setLocalConfig('PCAN_CHANNEL', v)}
                options={channelOptions}
                disabled={disabled}
              />
              <Button variant="ghost" size="icon-sm" onClick={loadPcanChannels} disabled={disabled} title="Detect PCAN devices">
                <RefreshCw className="size-3.5" />
              </Button>
            </div>
            <ConfigSelect
              label="CAN bitrate"
              value={String(config.PCAN_BITRATE ?? 500000)}
              onValueChange={(v) => setLocalConfig('PCAN_BITRATE', parseInt(v, 10))}
              options={CAN_BITRATE_OPTIONS}
              disabled={disabled}
            />
            <ConfigInput
              label="Device ID (optional)"
              placeholder="Optional"
              value={config.PCAN_DEVICE_ID != null && config.PCAN_DEVICE_ID !== '' ? String(config.PCAN_DEVICE_ID) : ''}
              onChange={(e) => {
                const v = e.currentTarget.value.trim();
                setLocalConfig('PCAN_DEVICE_ID', v === '' ? null : parseInt(v, 10) || null);
              }}
              disabled={disabled}
            />
          </>
        );
      }
      case 'tcp': {
        return (
          <>
            <div className="grid grid-cols-2 gap-2">
              <ConfigInput
                label="IP"
                inputClassName="tabular"
                value={config.TCP_IP || ''}
                onChange={(e) => setLocalConfig('TCP_IP', e.target.value)}
                disabled={disabled}
              />
              <ConfigInput
                label="Port"
                type="number"
                inputClassName="tabular"
                value={String(config.TCP_PORT || '')}
                onChange={(e) => setLocalConfig('TCP_PORT', parseInt(e.target.value, 10) || 0)}
                disabled={disabled}
              />
            </div>
            <Button
              variant="outline"
              size="sm"
              className="self-start"
              onClick={() => {
                setLoading((l) => ({ ...l, tcpTest: true }));
                apiJson('/api/tcp/test', { method: 'POST', body: JSON.stringify({ ip: config.TCP_IP || '', port: config.TCP_PORT || 8187 }) })
                  .then((res) => {
                    if (res.ok) notifications.show({ title: 'Connection test', message: res.message, color: 'green' });
                    else notifications.show({ title: 'Connection failed', message: res.message, color: 'red', autoClose: 5000 });
                  })
                  .catch((e) => notifications.show({ title: 'Test failed', message: e.message, color: 'red' }))
                  .finally(() => setLoading((l) => ({ ...l, tcpTest: false })));
              }}
              disabled={disabled || !config.TCP_IP || loading.tcpTest}
            >
              {loading.tcpTest ? <Loader2 className="size-3.5 animate-spin" /> : <Wifi className="size-3.5" />}
              Test connection
            </Button>
          </>
        );
      }
      case 'canp_tcp': {
        const canpPresetOptions = [
          { value: CUSTOM_PRESET, label: 'Custom' },
          ...canpConfigs.map((c) => ({ value: c.id, label: `${c.name} (${c.ip}:${c.port})` })),
        ];
        const selectedPreset = canpConfigs.find((c) => c.ip === config.CANP_TCP_IP && c.port === config.CANP_TCP_PORT)?.id || CUSTOM_PRESET;
        return (
          <>
            <p className="text-xs text-muted-foreground">Photon CANP batched frames over TCP (magic CAN1, v3).</p>
            <div className="flex items-end gap-2">
              <ConfigSelect
                label="Preset"
                className="min-w-0 flex-1"
                value={selectedPreset}
                onValueChange={(v) => {
                  const c = canpConfigs.find((x) => x.id === v);
                  if (c) {
                    setLocalConfig('CANP_TCP_IP', c.ip);
                    setLocalConfig('CANP_TCP_PORT', c.port);
                  }
                }}
                options={canpPresetOptions}
                disabled={disabled}
              />
              <Button variant="ghost" size="icon-sm" onClick={() => setCanpModalOpen(true)} disabled={disabled} title="Manage CANP configs">
                <Settings2 className="size-3.5" />
              </Button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <ConfigInput
                label="IP"
                inputClassName="tabular"
                value={config.CANP_TCP_IP || ''}
                onChange={(e) => setLocalConfig('CANP_TCP_IP', e.target.value)}
                disabled={disabled}
              />
              <ConfigInput
                label="Port"
                type="number"
                inputClassName="tabular"
                value={String(config.CANP_TCP_PORT ?? '')}
                onChange={(e) => setLocalConfig('CANP_TCP_PORT', parseInt(e.target.value, 10) || 0)}
                disabled={disabled}
              />
            </div>
            <Button
              variant="outline"
              size="sm"
              className="self-start"
              onClick={() => {
                setLoading((l) => ({ ...l, tcpTest: true }));
                apiJson('/api/tcp/test', { method: 'POST', body: JSON.stringify({ ip: config.CANP_TCP_IP || '', port: config.CANP_TCP_PORT || 6500 }) })
                  .then((res) => {
                    if (res.ok) notifications.show({ title: 'Connection test', message: res.message, color: 'green' });
                    else notifications.show({ title: 'Connection failed', message: res.message, color: 'red', autoClose: 5000 });
                  })
                  .catch((e) => notifications.show({ title: 'Test failed', message: e.message, color: 'red' }))
                  .finally(() => setLoading((l) => ({ ...l, tcpTest: false })));
              }}
              disabled={disabled || !config.CANP_TCP_IP || loading.tcpTest}
            >
              {loading.tcpTest ? <Loader2 className="size-3.5 animate-spin" /> : <Wifi className="size-3.5" />}
              Test connection
            </Button>
          </>
        );
      }
      case 'file':
        return (
          <>
            <div className="flex items-end gap-2">
              <ConfigSelect
                label="Log file"
                className="min-w-0 flex-1"
                value={config.REPLAY_FILE_PATH ? config.REPLAY_FILE_PATH.replace(/^.*[/\\]/, '') : undefined}
                onValueChange={(v) => setLocalConfig('REPLAY_FILE_PATH', v)}
                options={logFiles}
                disabled={disabled}
              />
              <Button variant="ghost" size="icon-sm" onClick={loadLogFiles} disabled={disabled} title="Refresh log files">
                <RefreshCw className="size-3.5 text-muted-foreground" />
              </Button>
            </div>
            <Button variant="ghost" size="xs" className="self-start text-muted-foreground" onClick={() => setLogModalOpen(true)}>
              <Settings2 className="size-3" />
              Edit log files
            </Button>
          </>
        );
      default:
        return null;
    }
  };

  const hasUnsavedChanges = config && savedConfig && !configEquals(config, savedConfig);
  const hasDbcFiles = dbcFilesForVehicle.length > 0;
  const hasDbcSelection = Array.isArray(config?.DBC_FILES) && config.DBC_FILES.length > 0;
  const allDbcSelected =
    hasDbcFiles &&
    dbcFilesForVehicle.every((e) => Array.isArray(config?.DBC_FILES) && config.DBC_FILES.includes(e.name));
  const someDbcSelected = hasDbcSelection && !allDbcSelected;
  const hasValidDbc = hasDbcFiles && hasDbcSelection;
  const saveEnabled = hasUnsavedChanges && !status.service_running && backendConnected && hasValidDbc;
  const startEnabled = backendConnected && !status.service_running && hasValidDbc;

  return (
    <div className="mx-auto flex min-h-0 w-full max-w-[920px] flex-1 flex-col gap-4 overflow-hidden p-4">
      <Card className="gap-0 rounded-lg py-4">
        <CardHeader className="px-4 pb-3">
          <CardTitle className="font-display text-sm">Service</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center justify-end gap-2 px-4">
          <Button size="sm" onClick={handleStart} disabled={!startEnabled || loading.start}>
            {loading.start ? <Loader2 className="size-3.5 animate-spin" /> : <Power className="size-3.5" />}
            Start
          </Button>
          <Button variant="destructive" size="sm" onClick={handleStop} disabled={!status.service_running || loading.stop}>
            {loading.stop ? <Loader2 className="size-3.5 animate-spin" /> : <Square className="size-3 fill-current" />}
            Stop
          </Button>
        </CardContent>
      </Card>

      {canDownloadBackend && (
        <Alert className="rounded-lg border-border bg-muted/50">
          <AlertDescription className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm text-muted-foreground">
              Backend is offline. Download the desktop backend executable.
            </span>
            <Button asChild variant="outline" size="xs">
              <a href={backendDownloadUrl} target="_blank" rel="noreferrer">
                Download backend
              </a>
            </Button>
          </AlertDescription>
        </Alert>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Card className="gap-0 rounded-lg py-4">
            <CardHeader className="px-4 pb-3">
              <CardTitle className="font-display text-sm">Files</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3 px-4">
              <div className="flex flex-col gap-1.5">
                <FieldLabel>Vehicle</FieldLabel>
                <Select value={config.DBC_VEHICLE || undefined} onValueChange={setVehicle} disabled={status.service_running}>
                  <SelectTrigger size="sm" className="w-full">
                    <Car className="size-3.5 shrink-0 text-muted-foreground" />
                    <SelectValue placeholder="Select vehicle…" />
                  </SelectTrigger>
                  <SelectContent>
                    {vehicles.map((v) => (
                      <SelectItem key={v} value={v}>
                        {v}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {config.DBC_VEHICLE && (
                dbcFilesForVehicle.length > 0 ? (
                  <>
                    <div className="flex items-center justify-between gap-2">
                      <FieldLabel className="mb-0">DBC files</FieldLabel>
                      <Button variant="ghost" size="xs" className="h-6 text-muted-foreground" onClick={() => setDbcModalOpen(true)}>
                        <Settings2 className="size-3" />
                        Edit
                      </Button>
                    </div>
                    <div className="flex items-center gap-2">
                      <Checkbox
                        id="dbc-select-all"
                        checked={allDbcSelected ? true : (someDbcSelected ? 'indeterminate' : false)}
                        onCheckedChange={(v) => {
                          if (v === true) setLocalConfig('DBC_FILES', dbcFilesForVehicle.map((f) => f.name));
                          else setLocalConfig('DBC_FILES', []);
                        }}
                        disabled={status.service_running}
                      />
                      <label htmlFor="dbc-select-all" className="cursor-pointer text-sm text-muted-foreground">
                        Select all
                      </label>
                    </div>
                    <ScrollArea className="h-[140px] rounded-md border border-border">
                      <div className="flex flex-col gap-1 p-2">
                        {dbcFilesForVehicle.map((entry) => {
                          const filename = entry.name;
                          const selected = Array.isArray(config.DBC_FILES) && config.DBC_FILES.includes(filename);
                          const isEmbedded = entry.source === 'embedded';
                          const id = `dbc-${filename}`;
                          return (
                            <div key={filename} className="flex items-center gap-2">
                              <Checkbox
                                id={id}
                                checked={selected}
                                onCheckedChange={(v) => toggleDbcFile(filename, v === true)}
                                disabled={status.service_running}
                              />
                              <label htmlFor={id} className="flex-1 cursor-pointer truncate text-sm">
                                {isEmbedded ? `${filename} *` : filename}
                              </label>
                            </div>
                          );
                        })}
                      </div>
                    </ScrollArea>
                    <p className="text-xs text-muted-foreground">* = Embedded Sharepoint</p>
                    {!hasDbcSelection && (
                      <p className="text-sm text-signal-amber">Select at least one DBC file.</p>
                    )}
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">No DBC files in this vehicle.</p>
                )
              )}
            </CardContent>
          </Card>

          <Card className="gap-0 rounded-lg py-4">
            <CardHeader className="px-4 pb-3">
              <CardTitle className="font-display text-sm">Input Source</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3 px-4">
              <div className="flex flex-wrap gap-1.5">
                {availableModes.map((m) => {
                  const Icon = SOURCE_MODE_ICONS[m.value];
                  const active = inputMode === m.value;
                  return (
                    <Button
                      key={m.value}
                      variant={active ? 'secondary' : 'ghost'}
                      size="xs"
                      className={cn(
                        'h-auto min-h-9 whitespace-normal px-2.5 py-1.5 text-left',
                        !active && 'text-muted-foreground'
                      )}
                      onClick={() => setLocalConfig('INPUT_MODE', m.value)}
                      disabled={status.service_running}
                    >
                      {Icon && <Icon size={SOURCE_MODE_ICON_SIZE} strokeWidth={2} className="shrink-0" />}
                      {m.label}
                    </Button>
                  );
                })}
              </div>
              <div className="flex flex-col gap-2">
                {renderModeFields()}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <Card className="gap-0 rounded-lg py-4">
        <CardHeader className="px-4 pb-3">
          <CardTitle className="font-display text-sm">Options</CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-between gap-4 px-4">
          <div className="flex min-w-0 items-center gap-3">
            <Database className="size-3.5 shrink-0 text-muted-foreground" />
            <div className="flex items-center gap-2">
              <Switch
                size="sm"
                checked={influxWriteOn}
                onCheckedChange={(v) => setLocalConfig('INFLUX_WRITE_ENABLED', v === true)}
                disabled={status.service_running || !status.influx_connected}
              />
              <span
                className={cn(
                  'text-sm',
                  influxWriteOn ? 'text-signal-green' : 'text-signal-red'
                )}
              >
                {influxWriteOn ? 'Write on' : 'Write off'}
              </span>
            </div>
            <Button variant="ghost" size="xs" onClick={() => setDbModalOpen(true)} disabled={!status.influx_connected}>
              Manage
            </Button>
          </div>
          <Button size="sm" onClick={handleSave} disabled={!saveEnabled || loading.save}>
            {loading.save ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />}
            Save
          </Button>
        </CardContent>
      </Card>

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
      <CanpConfigModal
        opened={canpModalOpen}
        onClose={() => setCanpModalOpen(false)}
        onRefresh={loadCanpConfigs}
        currentIp={config.CANP_TCP_IP}
        currentPort={config.CANP_TCP_PORT}
        isServerMode={isServerMode}
      />
      <DatabaseManagementModal
        opened={dbModalOpen}
        onClose={() => setDbModalOpen(false)}
        influxConnected={status.influx_connected}
        telemetryBucket={config.INFLUX_TELEMETRY_BUCKET || config.INFLUX_BUCKET}
        onBucketChange={(v) => setLocalConfig('INFLUX_TELEMETRY_BUCKET', v)}
        vehicle={config.DBC_VEHICLE}
        dbcFiles={config.DBC_FILES || []}
        canDeleteRuns
      />
    </div>
  );
}
