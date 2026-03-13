import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Box, Text, Stack, Group, TextInput, ActionIcon } from '@mantine/core';
import { Search, RotateCcw, Pause, Play } from 'lucide-react';
import { socket } from '../socket';

function formatTime(timestampNs) {
  const ms = Number(timestampNs) / 1e6;
  const d = new Date(ms);
  return d.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit', fractionalSecondDigits: 3 });
}

function parseCacheKey(key) {
  const idx = key.indexOf('::');
  if (idx === -1) return { vehicle: '', sender: key };
  return { vehicle: key.slice(0, idx), sender: key.slice(idx + 2) };
}

function isIndexSignalName(name) {
  const n = String(name || '').toLowerCase();
  return n.includes('idx') || n.includes('index');
}

function formatValue3(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    const s = value.toFixed(3);
    return s.replace(/\.?0+$/, '');
  }
  const num = Number(value);
  if (Number.isFinite(num)) {
    const s = num.toFixed(3);
    return s.replace(/\.?0+$/, '');
  }
  return String(value);
}

export function SignalDashboard() {
  const [cache, setCache] = useState({});
  const [search, setSearch] = useState('');
  const [paused, setPaused] = useState(false);
  const pausedRef = useRef(false);

  const mergeIntoCache = useCallback((msgs) => {
    if (pausedRef.current) return;
    setCache((prev) => {
      const next = { ...prev };
      for (const msg of msgs) {
        const sender = msg.sender || 'Unknown';
        const vehicle = msg.vehicle || 'unknown';
        const cacheKey = `${vehicle}::${sender}`;
        const canId = msg.can_id_hex;
        if (!canId) continue;
        if (!next[cacheKey]) next[cacheKey] = {};
        next[cacheKey] = { ...next[cacheKey] };

        const arrayIndex = msg.array_index;
        if (arrayIndex != null) {
          const existing = next[cacheKey][canId];
          const mergedSignals = (existing && existing.is_array) ? { ...existing.signals } : {};
          const incoming = msg.signals || {};
          const indexSet = new Set(
            existing && existing.indices
              ? existing.indices
              : []
          );
          indexSet.add(arrayIndex);
          const indices = Array.from(indexSet).sort((a, b) => a - b);
          for (const [sigName, sigVal] of Object.entries(incoming)) {
            const map =
              mergedSignals[sigName] && typeof mergedSignals[sigName] === 'object' && !Array.isArray(mergedSignals[sigName])
                ? { ...mergedSignals[sigName] }
                : {};
            map[arrayIndex] = sigVal;
            mergedSignals[sigName] = map;
          }
          next[cacheKey][canId] = {
            message_name: msg.message_name,
            network: msg.network || 'not_found',
            signals: mergedSignals,
            units: msg.units || (existing && existing.units) || {},
            is_array: true,
            indices,
            raw_packet: msg.raw_packet || '',
            timestamp_ns: msg.timestamp_ns || 0,
          };
        } else {
          next[cacheKey][canId] = {
            message_name: msg.message_name,
            network: msg.network || 'not_found',
            signals: msg.signals || {},
            units: msg.units || {},
            raw_packet: msg.raw_packet || '',
            timestamp_ns: msg.timestamp_ns || 0,
          };
        }
      }
      return next;
    });
  }, []);

  useEffect(() => {
    const onSignalCache = (fullCache) => {
      if (pausedRef.current) return;
      setCache(fullCache);
    };
    const onBatch = (batch) => {
      if (!Array.isArray(batch) || batch.length === 0) return;
      if (pausedRef.current) return;
      mergeIntoCache(batch);
    };
    socket.on('signal_cache', onSignalCache);
    socket.on('live_message_batch', onBatch);

    if (socket.connected) {
      socket.emit('request_cache');
    }

    return () => {
      socket.off('signal_cache', onSignalCache);
      socket.off('live_message_batch', onBatch);
    };
  }, [mergeIntoCache]);

  const searchLower = search.trim().toLowerCase();
  const cacheKeys = useMemo(() => Object.keys(cache).sort(), [cache]);

  return (
    <Box
      style={{
        flex: 1,
        height: '100%',
        overflow: 'auto',
        padding: 24,
        backgroundColor: '#0a0a0b',
      }}
    >
      <Group gap="md" mb="lg" align="center">
        <Text size="md" fw={600} style={{ color: '#e4e4e7' }}>Signal Dashboard</Text>
        <TextInput
          placeholder="Filter by ECU, vehicle, ID, or name..."
          size="xs"
          value={search}
          onChange={(e) => setSearch(e.currentTarget.value)}
          leftSection={<Search size={12} />}
          style={{ width: 300 }}
          styles={{ input: { backgroundColor: '#0f0f11' } }}
        />
        <ActionIcon
          variant="subtle"
          color={paused ? 'yellow' : 'gray'}
          size="sm"
          title={paused ? 'Resume live updates' : 'Pause live updates'}
          onClick={() => {
            const next = !paused;
            setPaused(next);
            pausedRef.current = next;
          }}
        >
          {paused ? <Play size={14} /> : <Pause size={14} />}
        </ActionIcon>
        <ActionIcon
          variant="subtle"
          color="gray"
          size="sm"
          title="Reset dashboard"
          onClick={() => { setCache({}); socket.emit('reset_cache'); }}
        >
          <RotateCcw size={14} />
        </ActionIcon>
      </Group>

      {cacheKeys.length === 0 && (
        <Text c="dimmed" size="sm" ta="center" mt="xl">
          No messages received yet. Start the telemetry service to see signals.
        </Text>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: 16 }}>
        {cacheKeys.map((cacheKey) => {
          const { vehicle, sender } = parseCacheKey(cacheKey);
          const messages = cache[cacheKey];
          const canIds = Object.keys(messages).sort();

          const filteredIds = searchLower
            ? canIds.filter((id) => {
                const m = messages[id];
                return (
                  sender.toLowerCase().includes(searchLower) ||
                  vehicle.toLowerCase().includes(searchLower) ||
                  id.toLowerCase().includes(searchLower) ||
                  (m.message_name || '').toLowerCase().includes(searchLower)
                );
              })
            : canIds;

          if (filteredIds.length === 0) return null;

          return (
            <Box
              key={cacheKey}
              style={{
                border: '1px solid var(--border)',
                borderRadius: 8,
                backgroundColor: '#0f0f11',
                padding: 16,
                minWidth: 360,
              }}
            >
              <Group gap={6} mb="sm">
                <Text size="sm" fw={600} style={{ color: '#e4e4e7' }}>{sender}</Text>
                {vehicle && <Text size="xs" c="dimmed" style={{ opacity: 0.5 }}>· {vehicle}</Text>}
              </Group>
              <Stack gap={6}>
                {filteredIds.map((canId) => {
                  const msg = messages[canId];
                  const hasSignals = msg.signals && Object.keys(msg.signals).length > 0;
                  const notFound = msg.message_name == null;

                  return (
                    <Box
                      key={canId}
                      style={{
                        border: '1px solid var(--border)',
                        borderRadius: 4,
                        padding: '6px 8px',
                        backgroundColor: '#18181b',
                      }}
                    >
                      <Group gap="xs" justify="space-between" wrap="nowrap">
                        <Text
                          size="sm"
                          style={{ color: notFound ? '#ef4444' : '#e4e4e7' }}
                        >
                          {canId}
                          {notFound ? ' · Not Found' : ` · ${msg.message_name}`}
                        </Text>
                        <Text size="xs" c="dimmed" style={{ flexShrink: 0 }}>
                          {msg.network}
                        </Text>
                      </Group>
                      <Stack gap={4} mt="xs" pl="xs" style={{ borderLeft: '2px solid var(--border)' }}>
                        {hasSignals && Object.entries(msg.signals).map(([name, value]) => {
                          const unit = msg.units && msg.units[name];
                          const unitStr = unit ? ` ${unit}` : '';
                          // In the Signal Dashboard, hide explicit index signals for array messages.
                          if (msg.is_array && isIndexSignalName(name)) {
                            return null;
                          }
                          if (msg.is_array && value && typeof value === 'object' && !Array.isArray(value)) {
                            const indices = Array.isArray(msg.indices) ? msg.indices : Object.keys(value).map((k) => Number(k)).sort((a, b) => a - b);
                            return (
                              <div key={name}>
                                <Text size="xs" fw={500} style={{ color: 'var(--text-muted)' }}>{name}{unit ? ` (${unit})` : ''}:</Text>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2px 8px', paddingLeft: 8, marginTop: 2 }}>
                                  {indices.map((idx) => {
                                    const v = value[idx];
                                    if (v === null || v === undefined) return null;
                                    return (
                                      <Text key={idx} size="xs" style={{ color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                                        [{idx}] {formatValue3(v)}
                                      </Text>
                                    );
                                  })}
                                </div>
                              </div>
                            );
                          }
                          return (
                            <Text key={name} size="xs" style={{ color: 'var(--text-muted)' }}>
                              {name}: {formatValue3(value)}{unitStr}
                            </Text>
                          );
                        })}
                        {msg.raw_packet && (
                          <Text size="xs" c="dimmed" style={{ fontFamily: 'monospace', opacity: 0.6 }}>
                            {msg.raw_packet}
                          </Text>
                        )}
                        {msg.timestamp_ns > 0 && (
                          <Text size="xs" c="dimmed" style={{ opacity: 0.5 }}>
                            Last update: {formatTime(msg.timestamp_ns)}
                          </Text>
                        )}
                      </Stack>
                    </Box>
                  );
                })}
              </Stack>
            </Box>
          );
        })}
      </div>
    </Box>
  );
}
