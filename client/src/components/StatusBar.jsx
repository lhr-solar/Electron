import { useCallback, useEffect, useRef, useState } from 'react';
import { useReducedMotion } from 'motion/react';
import { Info } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { BorderBeam } from '@/components/ui/border-beam';
import { cn } from '@/lib/utils';
import { socket } from '../socket';

const DATA_IDLE_MS = 500;

const SIGNAL_HEX = {
  green: '#22e39b',
  red: '#ff4d5e',
  amber: '#ffb020',
  blue: '#4d9dff',
  gray: '#565b66',
};

const DEFAULT_STATUS = {
  service_running: false,
  influx_connected: false,
  grafana_active: false,
  parser_status: 'idle',
  parser_connection_state: null,
  data_active: false,
  vehicle: '',
  adapter: null,
};

function adapterEquals(a, b) {
  if (a === b) return true;
  if (!a || !b) return false;
  return a.mode === b.mode && a.label === b.label && a.detail === b.detail;
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
    a.vehicle === b.vehicle &&
    adapterEquals(a.adapter, b.adapter)
  );
}

function adapterState(status, backendConnected) {
  if (!backendConnected || !status.service_running) {
    return { label: 'offline', tone: 'gray' };
  }
  if (status.parser_status === 'error') {
    return { label: 'error', tone: 'red' };
  }
  // Network modes keep service running while retrying — show disconnected until linked.
  if (status.parser_connection_state === true) {
    return { label: 'connected', tone: 'green' };
  }
  if (status.parser_connection_state === false) {
    return { label: 'disconnected', tone: 'amber' };
  }
  if (status.parser_status === 'running') {
    return { label: 'disconnected', tone: 'amber' };
  }
  return { label: 'disconnected', tone: 'amber' };
}

function dataState(status, localDataActive) {
  if (!status.service_running) {
    return { label: 'idle', tone: 'gray' };
  }
  const active = localDataActive || status.data_active === true;
  return {
    label: active ? 'incoming' : 'idle',
    tone: active ? 'green' : 'gray',
  };
}

export function useTelemetryStatus() {
  const [backendConnected, setBackendConnected] = useState(socket.connected);
  const [status, setStatus] = useState(DEFAULT_STATUS);
  const [localDataActive, setLocalDataActive] = useState(false);
  const lastDataAtRef = useRef(0);

  const touchData = useCallback(() => {
    lastDataAtRef.current = Date.now();
    setLocalDataActive(true);
  }, []);

  useEffect(() => {
    const tick = setInterval(() => {
      const active = lastDataAtRef.current > 0 && Date.now() - lastDataAtRef.current < DATA_IDLE_MS;
      setLocalDataActive(active);
    }, 100);
    return () => clearInterval(tick);
  }, []);

  useEffect(() => {
    if (!status.service_running) {
      lastDataAtRef.current = 0;
      setLocalDataActive(false);
    }
  }, [status.service_running]);

  useEffect(() => {
    // Engine open ≈ transport up. Socket.IO `connect` waits for the server
    // connect handler to finish — use engine open so Server reads as instant.
    const syncConnected = () => {
      const engineOpen = Boolean(socket.io?.engine && socket.io.engine.readyState === 'open');
      setBackendConnected(socket.connected || engineOpen);
    };
    const onConnect = () => setBackendConnected(true);
    const onDisconnect = () => setBackendConnected(false);
    const onStatus = (data) => {
      setStatus((prev) => (statusEquals(prev, data) ? prev : { ...DEFAULT_STATUS, ...data }));
      if (data?.data_active) touchData();
    };
    const onLiveBatch = (batch) => {
      if (Array.isArray(batch) && batch.length > 0) touchData();
    };

    syncConnected();
    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.io?.on?.('open', syncConnected);
    socket.on('status', onStatus);
    socket.on('live_message_batch', onLiveBatch);

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.io?.off?.('open', syncConnected);
      socket.off('status', onStatus);
      socket.off('live_message_batch', onLiveBatch);
    };
  }, [touchData]);

  return {
    backendConnected,
    status,
    adapter: adapterState(status, backendConnected),
    data: dataState(status, localDataActive),
  };
}

function StatusSegment({ label, value, tone, title, pulse = false }) {
  const hex = SIGNAL_HEX[tone] ?? SIGNAL_HEX.gray;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          className="flex h-full items-center gap-1.5 whitespace-nowrap px-2.5 outline-none focus-visible:ring-2 focus-visible:ring-ring/50 rounded-sm"
        >
          <span className="relative flex size-1.5 items-center justify-center">
            {pulse && (
              <span
                aria-hidden
                className="absolute inline-flex size-full rounded-full opacity-60 motion-safe:animate-ping"
                style={{ background: hex }}
              />
            )}
            <span
              aria-hidden
              className="relative inline-flex size-1.5 rounded-full"
              style={{ background: hex, boxShadow: tone !== 'gray' ? `0 0 7px ${hex}` : 'none' }}
            />
          </span>
          <span className="text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
            {label}
          </span>
          <span className="tabular text-[11px] font-semibold leading-none" style={{ color: hex }}>
            {value}
          </span>
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom">{title || `${label}: ${value}`}</TooltipContent>
    </Tooltip>
  );
}

function InfoRow({ label, value }) {
  return (
    <div className="grid grid-cols-[72px_1fr] items-baseline gap-2">
      <span className="text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
        {label}
      </span>
      <span className="truncate text-[12px] font-medium text-foreground" title={value || undefined}>
        {value || '—'}
      </span>
    </div>
  );
}

function adapterDetailLabel(mode) {
  switch (mode) {
    case 'serial_canadapter':
    case 'serial_uart':
      return 'Port';
    case 'pcan':
      return 'PCAN';
    case 'tcp':
      return 'TCP';
    case 'canp_tcp':
      return 'CANP';
    case 'file':
      return 'File';
    default:
      return 'Detail';
  }
}

function SessionInfoButton({ active, vehicle, adapterInfo }) {
  const [open, setOpen] = useState(false);

  if (!active) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            disabled
            aria-label="Session info unavailable"
            className="flex h-full items-center px-2 text-muted-foreground/40 outline-none"
          >
            <Info size={14} strokeWidth={1.75} />
          </button>
        </TooltipTrigger>
        <TooltipContent side="bottom">Start the service to view session info</TooltipContent>
      </Tooltip>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Session info"
          className={cn(
            'flex h-full items-center px-2 text-muted-foreground outline-none transition-colors',
            'hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50',
            open && 'text-foreground'
          )}
        >
          <Info size={14} strokeWidth={1.75} />
        </button>
      </PopoverTrigger>
      <PopoverContent side="bottom" align="end" className="w-64 space-y-2.5">
        <div className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
          Session
        </div>
        <InfoRow label="Vehicle" value={vehicle} />
        <InfoRow label="Adapter" value={adapterInfo?.label} />
        <InfoRow
          label={adapterDetailLabel(adapterInfo?.mode)}
          value={adapterInfo?.detail}
        />
      </PopoverContent>
    </Popover>
  );
}

export function StatusBar() {
  const { backendConnected, status, adapter, data } = useTelemetryStatus();
  const reduceMotion = useReducedMotion();

  const serverTone = backendConnected ? 'green' : 'red';
  const runningTone = !backendConnected ? 'gray' : status.service_running ? 'green' : 'gray';
  const dataIncoming = data.tone === 'green' && data.label === 'incoming';
  const infoActive = backendConnected && status.service_running;

  const segments = [
    {
      label: 'Server',
      value: backendConnected ? 'connected' : 'disconnected',
      tone: serverTone,
      title: 'Socket connection to Electron backend',
    },
    {
      label: 'Service',
      value: status.service_running ? 'running' : 'stopped',
      tone: runningTone,
      title: 'Telemetry ingest service',
    },
    {
      label: 'Adapter',
      value: adapter.label,
      tone: adapter.tone,
      title: 'Input adapter (TCP / serial / PCAN)',
    },
    {
      label: 'Vehicle',
      value: data.label,
      tone: data.tone,
      title: 'Vehicle data stream',
      pulse: dataIncoming,
    },
  ];

  return (
    <div
      className={cn(
        'relative flex h-8 max-w-full items-center rounded-lg border border-border bg-card/70 backdrop-blur-sm',
        backendConnected ? 'border-border' : 'border-signal-red/40'
      )}
    >
      <div className="flex h-full min-w-0 items-center divide-x divide-border overflow-x-auto overflow-y-visible">
        {segments.map((seg) => (
          <StatusSegment key={seg.label} {...seg} />
        ))}
        <SessionInfoButton
          active={infoActive}
          vehicle={status.vehicle}
          adapterInfo={status.adapter}
        />
      </div>
      {dataIncoming && !reduceMotion && (
        <BorderBeam size={70} duration={5} colorFrom="#22e39b" colorTo="#22d3ee" borderWidth={1.5} />
      )}
    </div>
  );
}
