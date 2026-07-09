import { useCallback, useEffect, useRef, useState } from 'react';
import { Group, Text } from '@mantine/core';
import { Circle } from 'lucide-react';
import { socket } from '../socket';

const STATUS_GREEN = '#22c55e';
const STATUS_GRAY = '#71717a';
const STATUS_YELLOW = '#eab308';
const STATUS_RED = '#ef4444';
const DATA_IDLE_MS = 500;

const DEFAULT_STATUS = {
  service_running: false,
  influx_connected: false,
  grafana_active: false,
  parser_status: 'idle',
  parser_connection_state: null,
  data_active: false,
};

function statusEquals(a, b) {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    a.service_running === b.service_running &&
    a.influx_connected === b.influx_connected &&
    a.grafana_active === b.grafana_active &&
    a.parser_status === b.parser_status &&
    a.parser_connection_state === b.parser_connection_state &&
    a.data_active === b.data_active
  );
}

function connectionState(status, backendConnected) {
  if (!backendConnected) return { label: 'off', color: STATUS_GRAY };
  if (!status.service_running) return { label: 'stopped', color: STATUS_GRAY };
  if (status.parser_status === 'error') return { label: 'error', color: STATUS_RED };
  if (status.parser_connection_state === true) return { label: 'active', color: STATUS_GREEN };
  if (status.parser_connection_state === false) return { label: 'connecting', color: STATUS_YELLOW };
  if (status.parser_status === 'running') return { label: 'active', color: STATUS_GREEN };
  return { label: 'connecting', color: STATUS_YELLOW };
}

function dataIdleState(status, localDataActive) {
  if (!status.service_running) {
    return { label: 'idle', active: false, color: STATUS_GRAY };
  }
  const active = localDataActive || status.data_active === true;
  return {
    label: active ? 'live' : 'idle',
    active,
    color: active ? STATUS_GREEN : STATUS_GRAY,
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
    const onConnect = () => setBackendConnected(true);
    const onDisconnect = () => setBackendConnected(false);
    const onStatus = (data) => {
      setStatus((prev) => (statusEquals(prev, data) ? prev : { ...DEFAULT_STATUS, ...data }));
      if (data?.data_active) touchData();
    };
    const onLiveBatch = (batch) => {
      if (Array.isArray(batch) && batch.length > 0) touchData();
    };

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('status', onStatus);
    socket.on('live_message_batch', onLiveBatch);

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('status', onStatus);
      socket.off('live_message_batch', onLiveBatch);
    };
  }, [touchData]);

  return { backendConnected, status, connectionState: connectionState(status, backendConnected), dataIdle: dataIdleState(status, localDataActive) };
}

function StatusDot({ color }) {
  return <Circle size={7} fill={color} />;
}

export function StatusBar() {
  const { backendConnected, status, connectionState: conn, dataIdle } = useTelemetryStatus();

  return (
    <Group
      gap="xs"
      wrap="nowrap"
      style={{
        backgroundColor: 'var(--bg-elevated)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius)',
        padding: '6px 12px',
        justifySelf: 'center',
      }}
    >
      <StatusDot color={backendConnected ? STATUS_GREEN : STATUS_GRAY} />
      <Text size="sm" c="dimmed">Backend</Text>
      <StatusDot color={conn.color} />
      <Text size="sm" style={{ color: conn.color }}>{conn.label}</Text>
      <StatusDot color={dataIdle.color} />
      <Text size="sm" style={{ color: dataIdle.color }}>{dataIdle.label}</Text>
      <StatusDot color={status.influx_connected ? STATUS_GREEN : STATUS_GRAY} />
      <Text size="sm" c="dimmed">Influx</Text>
      <StatusDot color={status.grafana_active ? STATUS_GREEN : STATUS_GRAY} />
      <Text size="sm" c="dimmed">Grafana</Text>
    </Group>
  );
}
