import React, { useState, useEffect, useCallback, useMemo, useRef, useDeferredValue } from 'react';
import { Box, Text, Stack, Group, TextInput, ActionIcon, Button, Checkbox, Divider, ScrollArea } from '@mantine/core';
import { Search, RotateCcw, Pause, Play } from 'lucide-react';
import { socket } from '../socket';

const UI_FLUSH_INTERVAL_MS = 80;
const LS_CAN_KEYS = 'electrol_signal_dashboard_v1_can_keys';
const LS_ECUS = 'electrol_signal_dashboard_v1_ecus';
const LS_SEARCH = 'electrol_signal_dashboard_v1_search';

function loadJsonKey(key, fallbackUndefined) {
  try {
    const s = localStorage.getItem(key);
    if (s === null) return fallbackUndefined;
    return JSON.parse(s);
  } catch {
    return fallbackUndefined;
  }
}

function loadStringKey(key, fallback) {
  try {
    const s = localStorage.getItem(key);
    if (s === null) return fallback;
    return s;
  } catch {
    return fallback;
  }
}

/** Checkbox styles for dark sidebar: visible border + light check icon. */
const filterCheckboxStyles = {
  input: {
    backgroundColor: 'var(--bg-hover)',
    borderColor: '#52525b',
    cursor: 'pointer',
  },
  icon: {
    color: '#fafafa',
  },
};

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
  const [search, setSearch] = useState(() => loadStringKey(LS_SEARCH, ''));
  const [paused, setPaused] = useState(false);
  /** `undefined` = first visit, not hydrated yet; then array (possibly empty). */
  const [selectedIdKeys, setSelectedIdKeys] = useState(() => loadJsonKey(LS_CAN_KEYS, undefined));
  const [selectedEcus, setSelectedEcus] = useState(() => loadJsonKey(LS_ECUS, undefined));
  const pausedRef = useRef(false);
  const pendingBatchesRef = useRef([]);

  useEffect(() => {
    try {
      localStorage.setItem(LS_SEARCH, search);
    } catch {
      /* ignore */
    }
  }, [search]);

  useEffect(() => {
    if (selectedIdKeys === undefined) return;
    try {
      localStorage.setItem(LS_CAN_KEYS, JSON.stringify(selectedIdKeys));
    } catch {
      /* ignore */
    }
  }, [selectedIdKeys]);

  useEffect(() => {
    if (selectedEcus === undefined) return;
    try {
      localStorage.setItem(LS_ECUS, JSON.stringify(selectedEcus));
    } catch {
      /* ignore */
    }
  }, [selectedEcus]);

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
      pendingBatchesRef.current.push(batch);
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
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      if (pausedRef.current) return;
      const queued = pendingBatchesRef.current;
      if (queued.length === 0) return;
      pendingBatchesRef.current = [];
      const merged = queued.flat();
      if (merged.length > 0) {
        mergeIntoCache(merged);
      }
    }, UI_FLUSH_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [mergeIntoCache]);

  const deferredSearch = useDeferredValue(search);
  const searchLower = deferredSearch.trim().toLowerCase();
  const cacheKeys = useMemo(() => Object.keys(cache).sort(), [cache]);
  const allEntries = useMemo(() => {
    const entries = [];
    for (const cacheKey of cacheKeys) {
      const { vehicle, sender } = parseCacheKey(cacheKey);
      const messages = cache[cacheKey] || {};
      const canIds = Object.keys(messages).sort();
      for (const canId of canIds) {
        entries.push({
          cacheKey,
          vehicle,
          sender,
          canId,
          msg: messages[canId],
          idKey: `${cacheKey}::${canId}`,
        });
      }
    }
    return entries;
  }, [cache, cacheKeys]);

  const idOptions = useMemo(() => {
    const list = allEntries.map((e) => ({
      key: e.idKey,
      canId: e.canId,
      ecu: e.sender,
    }));
    list.sort((a, b) => (a.canId === b.canId ? a.ecu.localeCompare(b.ecu) : a.canId.localeCompare(b.canId)));
    return list;
  }, [allEntries]);

  const ecuOptions = useMemo(
    () => Array.from(new Set(allEntries.map((e) => e.sender))).sort((a, b) => a.localeCompare(b)),
    [allEntries]
  );

  useEffect(() => {
    const allIds = idOptions.map((o) => o.key);
    // While cache is still empty after remount (e.g. tab switch), do not prune — would wipe localStorage keys.
    if (allIds.length === 0) {
      return;
    }
    const allowed = new Set(allIds);
    setSelectedIdKeys((prev) => {
      if (prev === undefined) {
        return allIds;
      }
      const next = prev.filter((k) => allowed.has(k));
      if (next.length === prev.length && next.every((k, i) => k === prev[i])) {
        return prev;
      }
      return next;
    });
  }, [idOptions]);

  useEffect(() => {
    if (ecuOptions.length === 0) {
      return;
    }
    const allowed = new Set(ecuOptions);
    setSelectedEcus((prev) => {
      if (prev === undefined) {
        return [...ecuOptions];
      }
      const next = prev.filter((e) => allowed.has(e));
      if (next.length === prev.length && next.every((e, i) => e === prev[i])) {
        return prev;
      }
      return next;
    });
  }, [ecuOptions]);

  const selectedIdsSet = useMemo(() => {
    if (selectedIdKeys === undefined) {
      return new Set(idOptions.map((o) => o.key));
    }
    return new Set(selectedIdKeys);
  }, [selectedIdKeys, idOptions]);

  const selectedEcusSet = useMemo(() => {
    if (selectedEcus === undefined) {
      return new Set(ecuOptions);
    }
    return new Set(selectedEcus);
  }, [selectedEcus, ecuOptions]);

  const filteredEntries = useMemo(
    () =>
      allEntries.filter((e) => {
        if (!selectedIdsSet.has(e.idKey)) return false;
        if (!selectedEcusSet.has(e.sender)) return false;
        if (!searchLower) return true;
        return (
          e.sender.toLowerCase().includes(searchLower) ||
          e.vehicle.toLowerCase().includes(searchLower) ||
          e.canId.toLowerCase().includes(searchLower) ||
          (e.msg.message_name || '').toLowerCase().includes(searchLower)
        );
      }),
    [allEntries, selectedIdsSet, selectedEcusSet, searchLower]
  );

  const visibleByCacheKey = useMemo(() => {
    const grouped = {};
    for (const e of filteredEntries) {
      if (!grouped[e.cacheKey]) {
        grouped[e.cacheKey] = { sender: e.sender, vehicle: e.vehicle, items: [] };
      }
      grouped[e.cacheKey].items.push({ canId: e.canId, msg: e.msg });
    }
    return grouped;
  }, [filteredEntries]);
  const visibleCacheKeys = useMemo(() => Object.keys(visibleByCacheKey).sort(), [visibleByCacheKey]);

  return (
    <Box
      style={{
        flex: 1,
        height: '100%',
        backgroundColor: 'var(--bg)',
        padding: 24,
        minHeight: 0,
      }}
    >
      <Group gap="md" mb="lg" align="center">
        <Text size="md" fw={600} style={{ color: '#e4e4e7' }}>Signal Dashboard</Text>
        <ActionIcon
          variant="subtle"
          color={paused ? 'yellow' : 'gray'}
          size="sm"
          title={paused ? 'Resume live updates' : 'Pause live updates'}
          onClick={() => {
            const next = !paused;
            setPaused(next);
            pausedRef.current = next;
            if (!next) {
              // Avoid large burst merge after resume.
              pendingBatchesRef.current = [];
            }
          }}
        >
          {paused ? <Play size={14} /> : <Pause size={14} />}
        </ActionIcon>
        <ActionIcon
          variant="subtle"
          color="gray"
          size="sm"
          title="Reset dashboard"
          onClick={() => {
            pendingBatchesRef.current = [];
            setCache({});
            socket.emit('reset_cache');
          }}
        >
          <RotateCcw size={14} />
        </ActionIcon>
      </Group>

      {cacheKeys.length === 0 && (
        <Text c="dimmed" size="sm" ta="center" mt="xl">
          No messages received yet. Start the telemetry service to see signals.
        </Text>
      )}

      {cacheKeys.length > 0 && (
        <div style={{ display: 'flex', gap: 16, minHeight: 0, height: 'calc(100% - 44px)' }}>
          <Box
            style={{
              width: 300,
              minWidth: 300,
              border: '1px solid var(--border)',
              borderRadius: 8,
              backgroundColor: 'var(--bg-elevated)',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
            }}
          >
            <Box p="sm" style={{ borderBottom: '1px solid var(--border)' }}>
              <TextInput
                placeholder="Filter by ECU, vehicle, ID, or name..."
                size="xs"
                value={search}
                onChange={(e) => setSearch(e.currentTarget.value)}
                leftSection={<Search size={12} />}
                styles={{ input: { backgroundColor: 'var(--bg-hover)' } }}
              />
            </Box>
            <ScrollArea style={{ flex: 1 }} type="auto" scrollbarSize={8}>
              <Box p="sm">
                <Group justify="space-between" mb={6}>
                  <Text size="xs" fw={600} c="dimmed">CAN IDs</Text>
                  <Group gap={4}>
                    <Button
                      variant="subtle"
                      size="compact-xs"
                      onClick={() => setSelectedIdKeys(idOptions.map((o) => o.key))}
                    >
                      Select all
                    </Button>
                    <Button
                      variant="subtle"
                      size="compact-xs"
                      color="gray"
                      onClick={() => setSelectedIdKeys([])}
                    >
                      Deselect all
                    </Button>
                  </Group>
                </Group>
                <Stack gap={4} mb="sm">
                  {idOptions.map((o) => (
                    <Checkbox
                      key={o.key}
                      size="xs"
                      color="teal"
                      styles={filterCheckboxStyles}
                      checked={selectedIdsSet.has(o.key)}
                      onChange={(e) => {
                        const checked = e.currentTarget.checked;
                        setSelectedIdKeys((prev) => {
                          const base = prev === undefined ? idOptions.map((x) => x.key) : [...prev];
                          if (checked) {
                            return base.includes(o.key) ? base : [...base, o.key];
                          }
                          return base.filter((k) => k !== o.key);
                        });
                      }}
                      label={
                        <Text size="xs" style={{ color: '#d4d4d8' }}>
                          {o.canId} <span style={{ color: '#71717a' }}>({o.ecu})</span>
                        </Text>
                      }
                    />
                  ))}
                </Stack>

                <Divider my="xs" />

                <Group justify="space-between" mb={6}>
                  <Text size="xs" fw={600} c="dimmed">ECUs</Text>
                  <Group gap={4}>
                    <Button
                      variant="subtle"
                      size="compact-xs"
                      onClick={() => setSelectedEcus(ecuOptions)}
                    >
                      Select all
                    </Button>
                    <Button
                      variant="subtle"
                      size="compact-xs"
                      color="gray"
                      onClick={() => setSelectedEcus([])}
                    >
                      Deselect all
                    </Button>
                  </Group>
                </Group>
                <Stack gap={4}>
                  {ecuOptions.map((ecu) => (
                    <Checkbox
                      key={ecu}
                      size="xs"
                      color="teal"
                      styles={filterCheckboxStyles}
                      checked={selectedEcusSet.has(ecu)}
                      onChange={(e) => {
                        const checked = e.currentTarget.checked;
                        setSelectedEcus((prev) => {
                          const base = prev === undefined ? [...ecuOptions] : [...prev];
                          if (checked) {
                            return base.includes(ecu) ? base : [...base, ecu];
                          }
                          return base.filter((x) => x !== ecu);
                        });
                      }}
                      label={<Text size="xs" style={{ color: '#d4d4d8' }}>{ecu}</Text>}
                    />
                  ))}
                </Stack>
              </Box>
            </ScrollArea>
          </Box>

          <Box style={{ flex: 1, minWidth: 0, overflow: 'auto' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: 16 }}>
              {visibleCacheKeys.map((cacheKey) => {
                const group = visibleByCacheKey[cacheKey];
                const { vehicle, sender, items } = group;
                return (
                  <Box
                    key={cacheKey}
                    style={{
                      border: '1px solid var(--border)',
                      borderRadius: 8,
                      backgroundColor: 'var(--bg-elevated)',
                      padding: 16,
                      minWidth: 360,
                    }}
                  >
                    <Group gap={6} mb="sm">
                      <Text size="sm" fw={600} style={{ color: '#e4e4e7' }}>{sender}</Text>
                      {vehicle && <Text size="xs" c="dimmed" style={{ opacity: 0.5 }}>· {vehicle}</Text>}
                    </Group>
                    <Stack gap={6}>
                      {items.map(({ canId, msg }) => {
                  const hasSignals = msg.signals && Object.keys(msg.signals).length > 0;
                  const notFound = msg.message_name == null;

                  return (
                    <Box
                      key={canId}
                      style={{
                        border: '1px solid var(--border)',
                        borderRadius: 4,
                        padding: '6px 8px',
                        backgroundColor: 'var(--bg-hover)',
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
            {visibleCacheKeys.length === 0 && (
              <Text c="dimmed" size="sm" ta="center" mt="xl">
                No signals match current filters.
              </Text>
            )}
          </Box>
        </div>
      )}
    </Box>
  );
}
