import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActionIcon,
  Box,
  Button,
  Group,
  Modal,
  NumberInput,
  Paper,
  ScrollArea,
  Select,
  SimpleGrid,
  Stack,
  Table,
  Text,
} from '@mantine/core';
import { useDisclosure, useLocalStorage } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import { ChevronDown, ChevronUp, Pencil, Plus, Trash2, Upload, Download } from 'lucide-react';
import { mergePivotByFrameSignal } from '../analytics/mergeByFrame';
import { SimpleLineChart } from './SimpleLineChart';
import { socket } from '../socket';
import { apiJson } from '../lib/api';

const LS_KEY = 'electrol_analytics_views_v1';
/** Ring-buffer window for analytics APIs (not shown in UI). */
const ANALYTICS_TIME_RANGE = '-1h';

function uid() {
  return globalThis.crypto?.randomUUID?.() ?? `v-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/** DBC layout order: ascending start bit, then name. */
function sortSignalsByStartBit(signals) {
  if (!signals?.length) return [];
  return [...signals].sort((a, b) => {
    const sa =
      a.start_bit != null && !Number.isNaN(Number(a.start_bit)) ? Number(a.start_bit) : 1e9;
    const sb =
      b.start_bit != null && !Number.isNaN(Number(b.start_bit)) ? Number(b.start_bit) : 1e9;
    if (sa !== sb) return sa - sb;
    return String(a.name || '').localeCompare(String(b.name || ''));
  });
}

function signalSelectLabel(s) {
  if (s.start_bit != null && !Number.isNaN(Number(s.start_bit))) {
    return `${s.name}  @${s.start_bit}`;
  }
  return s.name;
}

function formatValueCompact(v) {
  if (typeof v === 'number' && Number.isFinite(v)) {
    const s = v.toFixed(3);
    return s.replace(/\.?0+$/, '');
  }
  if (v == null) return '—';
  return String(v);
}

/** Readout: show DBC value-table labels (strings) or formatted numbers. */
function formatReadoutValue(v) {
  if (v == null) return '—';
  if (typeof v === 'string') return v;
  if (typeof v === 'number' && Number.isFinite(v)) return formatValueCompact(v);
  const n = Number(v);
  if (Number.isFinite(n)) return formatValueCompact(n);
  return String(v);
}

/** ISO / epoch timestamps from analytics APIs → locale date + time (e.g. Mar 27, 2026, 3:45:30 PM). */
function formatAnalyticsTime(isoOrString) {
  if (isoOrString == null || isoOrString === '') return '';
  const s = String(isoOrString);
  const ms = Date.parse(s);
  if (!Number.isFinite(ms)) return s;
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: 'medium',
      timeStyle: 'medium',
    }).format(new Date(ms));
  } catch {
    return s;
  }
}

const ANALYTICS_READOUT_VALUE_SX = {
  fontSize: 'clamp(2.5rem, 8vw, 4rem)',
  fontWeight: 700,
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
  lineHeight: 1.15,
  color: '#e8e8ed',
  letterSpacing: '-0.02em',
  wordBreak: 'break-all',
};

const ANALYTICS_READOUT_UNIT_SX = {
  color: '#c8c8d0',
  fontSize: 'clamp(1rem, 2.8vw, 1.4rem)',
  fontWeight: 500,
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
};

/** Large min / max / readout value block with optional unit, index line, and time. */
function AnalyticsBigReadout({ valueDisplay, unit, indexLine, timeLine, footerHint }) {
  const missing = valueDisplay === '—';
  return (
    <Box mt="md" py="xl" px="md" style={{ textAlign: 'center' }}>
      <Group justify="center" align="baseline" gap="sm" wrap="wrap">
        <Text style={ANALYTICS_READOUT_VALUE_SX}>{valueDisplay}</Text>
        {unit ? (
          <Text component="span" style={ANALYTICS_READOUT_UNIT_SX}>
            {unit}
          </Text>
        ) : null}
      </Group>
      {indexLine != null && indexLine !== '' ? (
        <Text size="xs" mt="sm" style={{ color: '#b0b0b8' }}>
          {indexLine}
        </Text>
      ) : null}
      {timeLine ? (
        <Text size="xs" mt={indexLine ? 'xs' : 'md'} style={{ color: '#9898a3' }}>
          {formatAnalyticsTime(timeLine)}
        </Text>
      ) : null}
      {footerHint && missing ? (
        <Text size="xs" mt="md" style={{ color: '#9898a3' }}>
          {footerHint}
        </Text>
      ) : null}
    </Box>
  );
}

function formatPivotRowSignalsCell(row, frameSignalName) {
  if (!row || typeof row !== 'object') return '—';
  const parts = [];
  for (const k of Object.keys(row)) {
    if (k === 't' || k === frameSignalName) continue;
    parts.push(`${k}: ${formatValueCompact(row[k])}`);
  }
  return parts.length ? parts.join(' · ') : '—';
}

function canIdHex(id) {
  if (id == null) return '—';
  return `0x${Number(id).toString(16).toUpperCase()}`;
}

function defaultView(vehicleHint = '') {
  return {
    id: uid(),
    vehicle: vehicleHint,
    dbcFilename: '',
    messageId: null,
    messageName: '',
    signalName: '',
    viewType: 'graph',
    arrayMode: null,
    arrayIndex: 0,
    graphArrayIndex: 0,
    isArrayMessage: false,
    syncFrameSignalName: '',
    syncMessageIds: [],
    syncGraphArrayIndex: 0,
    signalUnit: '',
  };
}

export function Analytics() {
  const [views, setViews] = useLocalStorage({ key: LS_KEY, defaultValue: [] });
  const [vehicleHint, setVehicleHint] = useState('');
  const [opened, { open, close }] = useDisclosure(false);
  const [editing, setEditing] = useState(null);
  const [vehicles, setVehicles] = useState([]);
  const [dbcFiles, setDbcFiles] = useState([]);
  const [schema, setSchema] = useState(null);
  const [loadingSchema, setLoadingSchema] = useState(false);
  const [uploadErrors, setUploadErrors] = useState([]);
  const [pendingValid, setPendingValid] = useState([]);
  const [liveTick, setLiveTick] = useState(0);
  const liveThrottleUntilRef = useRef(0);

  useEffect(() => {
    const THROTTLE_MS = 280;
    const onBatch = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      const now = Date.now();
      if (now < liveThrottleUntilRef.current) return;
      liveThrottleUntilRef.current = now + THROTTLE_MS;
      setLiveTick((t) => t + 1);
    };
    socket.on('live_message_batch', onBatch);
    return () => socket.off('live_message_batch', onBatch);
  }, []);

  useEffect(() => {
    const onStatus = (s) => {
      if (s?.vehicle) setVehicleHint(s.vehicle);
    };
    socket.on('status', onStatus);
    apiJson('/api/dbc/vehicles')
      .then(setVehicles)
      .catch(() => setVehicles([]));
    return () => socket.off('status', onStatus);
  }, []);

  const loadDbcFiles = useCallback((v) => {
    if (!v) {
      setDbcFiles([]);
      return;
    }
    apiJson(`/api/dbc/vehicles/${encodeURIComponent(v)}/files`)
      .then((files) => {
        const list = (files || []).map((e) => (typeof e === 'string' ? { name: e, source: 'local' } : e));
        setDbcFiles(list);
      })
      .catch(() => setDbcFiles([]));
  }, []);

  const loadSchema = useCallback((v, fn) => {
    if (!v || !fn) {
      setSchema(null);
      return;
    }
    setLoadingSchema(true);
    apiJson(`/api/dbc/vehicles/${encodeURIComponent(v)}/files/${encodeURIComponent(fn)}/schema`)
      .then(setSchema)
      .catch(() => setSchema(null))
      .finally(() => setLoadingSchema(false));
  }, []);

  const openNew = () => {
    setEditing(defaultView(vehicleHint || ''));
    loadDbcFiles(vehicleHint || '');
    open();
  };

  const openEdit = (v) => {
    let merged = { ...v };
    if (v.viewType === 'sync') {
      if (!v.syncFrameSignalName && v.syncIdentifier) {
        merged = { ...merged, syncFrameSignalName: `FrameID_${v.syncIdentifier}` };
      }
      if (!merged.syncMessageIds?.length && merged.syncGroupFrameId != null) {
        merged = { ...merged, syncMessageIds: [merged.syncGroupFrameId] };
      }
    }
    setEditing({ ...merged });
    loadDbcFiles(v.vehicle);
    loadSchema(v.vehicle, v.dbcFilename);
    open();
  };

  useEffect(() => {
    if (!opened || !editing?.vehicle) return;
    loadDbcFiles(editing.vehicle);
  }, [opened, editing?.vehicle, loadDbcFiles]);

  useEffect(() => {
    if (!opened || !editing?.vehicle || !editing?.dbcFilename) return;
    loadSchema(editing.vehicle, editing.dbcFilename);
  }, [opened, editing?.vehicle, editing?.dbcFilename, loadSchema]);

  const messages = useMemo(() => {
    const list = schema?.messages ? [...schema.messages] : [];
    list.sort((a, b) => (Number(a.id) || 0) - (Number(b.id) || 0));
    return list;
  }, [schema]);

  const currentMessageSignals = useMemo(() => {
    const msg = messages.find((m) => m.id === editing?.messageId);
    return sortSignalsByStartBit(msg?.signals);
  }, [messages, editing?.messageId]);

  const syncSelectedMessages = useMemo(() => {
    const ids = editing?.syncMessageIds || [];
    const seen = new Set();
    const out = [];
    for (const id of ids) {
      if (id == null || seen.has(id)) continue;
      seen.add(id);
      const m = messages.find((x) => x.id === id);
      if (m) out.push(m);
    }
    return out;
  }, [messages, editing?.syncMessageIds]);

  const syncFrameSignalOptions = useMemo(() => {
    const msgs = syncSelectedMessages;
    if (msgs.length === 0) return [];
    let inter = new Set(msgs[0].signals.map((s) => s.name));
    for (let i = 1; i < msgs.length; i++) {
      const n = new Set(msgs[i].signals.map((s) => s.name));
      inter = new Set([...inter].filter((x) => n.has(x)));
    }
    const list = [...inter].sort((a, b) => a.localeCompare(b));
    const prefer = list.filter((name) => /^FrameID_/i.test(name));
    return (prefer.length ? prefer : list).map((name) => ({ value: name, label: name }));
  }, [syncSelectedMessages]);

  const syncNeedsArrayIndex = useMemo(() => {
    const ids = editing?.syncMessageIds || [];
    if (!ids.length) return false;
    let anyArr = false;
    let anyNon = false;
    for (const id of ids) {
      const m = messages.find((x) => x.id === id);
      if (!m) continue;
      if (m.array_index_signal) anyArr = true;
      else anyNon = true;
    }
    return anyArr && !anyNon;
  }, [messages, editing?.syncMessageIds]);

  const saveEditor = () => {
    if (!editing?.vehicle || !editing?.dbcFilename) {
      notifications.show({ color: 'red', message: 'Select vehicle and DBC file.' });
      return;
    }
    if (editing.viewType === 'sync') {
      const rawIds = (editing.syncMessageIds || []).map(Number).filter((n) => !Number.isNaN(n));
      const frameSig = (editing.syncFrameSignalName || '').trim();
      if (rawIds.length === 0 || !frameSig) {
        notifications.show({
          color: 'red',
          message: 'Add at least one CAN message and select the frame sync signal (exact DBC name).',
        });
        return;
      }
      const uniqueInOrder = [];
      const seen = new Set();
      for (const id of rawIds) {
        if (!seen.has(id)) {
          seen.add(id);
          uniqueInOrder.push(id);
        }
      }
      for (const mid of uniqueInOrder) {
        const m = messages.find((x) => x.id === mid);
        if (!m || !sortSignalsByStartBit(m.signals || []).some((s) => s.name === frameSig)) {
          notifications.show({
            color: 'red',
            message: `Signal "${frameSig}" must exist on every selected message (0x${Number(mid).toString(16)}).`,
          });
          return;
        }
      }
      let anyArr = false;
      let anyNon = false;
      for (const mid of uniqueInOrder) {
        const m = messages.find((x) => x.id === mid);
        if (m?.array_index_signal) anyArr = true;
        else if (m) anyNon = true;
      }
      if (anyArr && anyNon) {
        notifications.show({
          color: 'red',
          message: 'Sync cannot mix array and non-array messages; choose only one kind.',
        });
        return;
      }
      if (anyArr && editing.syncGraphArrayIndex == null) {
        notifications.show({ color: 'red', message: 'Array messages require an array index.' });
        return;
      }
      const syncFieldsByMessage = uniqueInOrder.map((mid) => {
        const m = messages.find((x) => x.id === mid);
        return {
          messageId: mid,
          messageName: m?.name || '',
          fields: sortSignalsByStartBit(m?.signals || []).map((s) => s.name),
        };
      });
      const first = messages.find((x) => x.id === uniqueInOrder[0]);
      const next = {
        ...editing,
        viewType: 'sync',
        syncFrameSignalName: frameSig,
        syncMessageIds: uniqueInOrder,
        syncFieldsByMessage,
        messageId: uniqueInOrder[0],
        messageName: first?.name || '',
        signalName: '',
        isArrayMessage: anyArr,
        syncGraphArrayIndex: anyArr ? editing.syncGraphArrayIndex ?? 0 : null,
      };
      setViews((prev) => {
        const i = prev.findIndex((x) => x.id === next.id);
        if (i >= 0) {
          const c = [...prev];
          c[i] = next;
          return c;
        }
        return [...prev, next];
      });
      close();
      setEditing(null);
      return;
    }

    if (editing?.messageId == null || !editing?.signalName) {
      notifications.show({ color: 'red', message: 'Fill message and signal.' });
      return;
    }
    const msg = messages.find((m) => m.id === editing.messageId);
    const sigs = sortSignalsByStartBit(msg?.signals || []);
    const sigMeta = sigs.find((s) => s.name === editing.signalName);
    const next = {
      ...editing,
      messageName: msg?.name || editing.messageName || '',
      isArrayMessage: !!msg?.array_index_signal,
      signalUnit: sigMeta?.unit ? String(sigMeta.unit) : '',
    };
    setViews((prev) => {
      const i = prev.findIndex((x) => x.id === next.id);
      if (i >= 0) {
        const c = [...prev];
        c[i] = next;
        return c;
      }
      return [...prev, next];
    });
    close();
    setEditing(null);
  };

  const removeView = (id) => setViews((prev) => prev.filter((x) => x.id !== id));

  const moveView = (index, delta) => {
    setViews((prev) => {
      const list = prev || [];
      const j = index + delta;
      if (j < 0 || j >= list.length) return list;
      const next = [...list];
      [next[index], next[j]] = [next[j], next[index]];
      return next;
    });
  };

  const downloadJson = () => {
    const blob = new Blob([JSON.stringify({ version: 1, views }, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'analytics-views.json';
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const onUploadFile = async (file) => {
    setUploadErrors([]);
    setPendingValid([]);
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      const list = Array.isArray(data.views) ? data.views : [];
      const res = await apiJson('/api/analytics/validate', {
        method: 'POST',
        body: JSON.stringify({ version: data.version || 1, views: list }),
      });
      if (res.ok) {
        setViews(list);
        notifications.show({ message: `Imported ${list.length} view(s).` });
      } else {
        setUploadErrors(res.errors || []);
        setPendingValid(res.validViews || []);
        notifications.show({
          color: 'yellow',
          message: `Validation failed (${(res.errors || []).length} issue(s)). Fix JSON or import valid only.`,
        });
      }
    } catch (e) {
      notifications.show({ color: 'red', message: String(e.message || e) });
    }
  };

  const mergeValidImports = () => {
    if (!pendingValid?.length) return;
    setViews((prev) => {
      const ids = new Set(prev.map((x) => x.id));
      const add = pendingValid.filter((v) => v.id && !ids.has(v.id));
      return [...prev, ...add];
    });
    setPendingValid([]);
    setUploadErrors([]);
    notifications.show({ message: 'Merged valid views from last upload.' });
  };

  return (
    <Box
      style={{
        height: '100%',
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        backgroundColor: '#0a0a0b',
      }}
    >
      <Box px="md" pt="md" style={{ flexShrink: 0 }}>
        <Group justify="space-between" mb="md" wrap="wrap">
          <Text fw={600} size="lg" style={{ color: '#e4e4e7' }}>
            Analytics
          </Text>
          <Group gap="xs">
            <Button leftSection={<Plus size={16} />} size="sm" variant="light" onClick={openNew}>
              Add view
            </Button>
            <Button leftSection={<Download size={16} />} size="sm" variant="default" onClick={downloadJson}>
              Download JSON
            </Button>
            <label style={{ cursor: 'pointer' }}>
              <input
                type="file"
                accept="application/json,.json"
                style={{ display: 'none' }}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = '';
                  if (f) onUploadFile(f);
                }}
              />
              <Button component="span" leftSection={<Upload size={16} />} size="sm" variant="default">
                Upload JSON
              </Button>
            </label>
          </Group>
        </Group>
      </Box>

      {uploadErrors.length > 0 && (
        <Box px="md" style={{ flexShrink: 0 }}>
        <Paper withBorder p="sm" mb="md" style={{ borderColor: '#b45309', background: '#1a1206' }}>
          <Text size="sm" fw={600} mb="xs" c="orange">
            Validation errors
          </Text>
          <Table striped highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>View</Table.Th>
                <Table.Th>Path</Table.Th>
                <Table.Th>Detail</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {uploadErrors.map((e, i) => (
                <Table.Tr key={i}>
                  <Table.Td style={{ fontFamily: 'monospace', fontSize: 12 }}>{String(e.viewId ?? '—')}</Table.Td>
                  <Table.Td style={{ fontFamily: 'monospace', fontSize: 12 }}>{e.path}</Table.Td>
                  <Table.Td style={{ fontSize: 12 }}>{e.detail}</Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
          {pendingValid.length > 0 && (
            <Button mt="sm" size="xs" onClick={mergeValidImports}>
              Import {pendingValid.length} valid view(s) anyway
            </Button>
          )}
        </Paper>
        </Box>
      )}

      <Box
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: 'auto',
          overflowX: 'hidden',
          WebkitOverflowScrolling: 'touch',
          paddingLeft: 16,
          paddingRight: 16,
          paddingBottom: 16,
        }}
      >
        {(views || []).length === 0 ? (
          <Text c="dimmed" size="sm">
            No views yet. Add a view for live min / max / graph, large readout, or FrameID sync.
          </Text>
        ) : (
          <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="md" verticalSpacing="md" style={{ minWidth: 0 }}>
            {(views || []).map((v, index) => (
              <AnalyticsViewCard
                key={v.id}
                view={v}
                liveTick={liveTick}
                viewIndex={index}
                viewCount={(views || []).length}
                onMoveUp={() => moveView(index, -1)}
                onMoveDown={() => moveView(index, 1)}
                onEdit={() => openEdit(v)}
                onDelete={() => removeView(v.id)}
              />
            ))}
          </SimpleGrid>
        )}
      </Box>

      <Modal opened={opened} onClose={close} title={editing?.id && views?.some((x) => x.id === editing.id) ? 'Edit view' : 'New view'} size="lg">
        {editing && (
          <Stack gap="sm">
            <Select
              label="Vehicle"
              data={vehicles}
              value={editing.vehicle || null}
              onChange={(x) =>
                setEditing((e) => ({
                  ...e,
                  vehicle: x || '',
                  dbcFilename: '',
                  messageId: null,
                  syncMessageIds: [],
                  syncFrameSignalName: '',
                }))
              }
              searchable
            />
            <Select
              label="DBC file"
              data={dbcFiles.map((f) => ({ value: f.name, label: f.source === 'embedded' ? `${f.name} *` : f.name }))}
              value={editing.dbcFilename || null}
              onChange={(x) =>
                setEditing((e) => ({
                  ...e,
                  dbcFilename: x || '',
                  messageId: null,
                  syncMessageIds: [],
                  syncFrameSignalName: '',
                }))
              }
              disabled={!editing.vehicle}
              searchable
            />
            <Select
              label="View type"
              data={[
                { value: 'min', label: 'Min' },
                { value: 'max', label: 'Max' },
                { value: 'graph', label: 'Graph (time series)' },
                { value: 'readout', label: 'Large readout (current value)' },
                { value: 'sync', label: 'FrameID sync (combined signals)' },
              ]}
              value={editing.viewType}
              onChange={(x) => {
                const vt = x || 'graph';
                setEditing((e) => ({
                  ...e,
                  viewType: vt,
                  ...(vt === 'sync'
                    ? {
                        messageId: null,
                        signalName: '',
                        syncMessageIds: e.syncMessageIds || [],
                        syncFrameSignalName: e.syncFrameSignalName || '',
                      }
                    : {
                        syncFrameSignalName: '',
                        syncMessageIds: [],
                        syncGraphArrayIndex: 0,
                        syncFieldsByMessage: undefined,
                      }),
                }));
              }}
            />

            {editing.viewType === 'sync' ? (
              <>
                <Text size="xs" c="dimmed">
                  Add one or more CAN messages (different arbitration ids allowed). Pick the exact DBC signal used as the
                  rolling frame counter; rows are aligned by matching that value and closest timestamp.
                </Text>
                <Paper withBorder p="sm" radius="sm" style={{ background: '#0f0f11', borderColor: 'var(--border)' }}>
                  <Group justify="space-between" mb="xs">
                    <Text size="sm" fw={600}>
                      Messages
                    </Text>
                    <Button
                      size="xs"
                      variant="light"
                      disabled={!messages.length}
                      onClick={() =>
                        setEditing((e) => ({
                          ...e,
                          syncMessageIds: [...(e.syncMessageIds || []), messages[0].id],
                        }))
                      }
                    >
                      Add message
                    </Button>
                  </Group>
                  {(editing.syncMessageIds || []).length === 0 ? (
                    <Text size="xs" c="dimmed">
                      Add at least one CAN message.
                    </Text>
                  ) : (
                    <Stack gap={6}>
                      {(editing.syncMessageIds || []).map((mid, idx) => (
                        <Group key={idx} justify="space-between" wrap="nowrap" gap="xs" align="flex-start">
                          <Select
                            style={{ flex: 1, minWidth: 0 }}
                            placeholder="Select CAN message"
                            data={messages.map((m) => ({
                              value: String(m.id),
                              label: `${m.name} (${m.id_hex})`,
                            }))}
                            value={mid != null ? String(mid) : null}
                            onChange={(x) => {
                              const v = x != null ? parseInt(x, 10) : null;
                              setEditing((e) => {
                                const next = [...(e.syncMessageIds || [])];
                                next[idx] = v;
                                return { ...e, syncMessageIds: next };
                              });
                            }}
                            disabled={!schema}
                            searchable
                          />
                          <ActionIcon
                            size="sm"
                            variant="default"
                            color="red"
                            mt={4}
                            onClick={() =>
                              setEditing((e) => ({
                                ...e,
                                syncMessageIds: (e.syncMessageIds || []).filter((_, i) => i !== idx),
                              }))
                            }
                          >
                            <Trash2 size={14} />
                          </ActionIcon>
                        </Group>
                      ))}
                    </Stack>
                  )}
                </Paper>
                <Select
                  label="Frame sync signal"
                  description="Exact name from DBC (shared by all messages above), e.g. FrameID_…"
                  data={syncFrameSignalOptions}
                  value={editing.syncFrameSignalName || null}
                  onChange={(x) => setEditing((e) => ({ ...e, syncFrameSignalName: x || '' }))}
                  disabled={syncFrameSignalOptions.length === 0}
                  placeholder={syncSelectedMessages.length ? 'Select signal' : 'Add messages first'}
                  searchable
                />
                {syncNeedsArrayIndex ? (
                  <NumberInput
                    label="Array index"
                    description="Array-indexed messages only (same index for all)."
                    min={0}
                    value={editing.syncGraphArrayIndex ?? 0}
                    onChange={(x) => setEditing((e) => ({ ...e, syncGraphArrayIndex: x ?? 0 }))}
                  />
                ) : null}
              </>
            ) : (
              <>
                <Select
                  label="Message"
                  data={messages.map((m) => ({
                    value: String(m.id),
                    label: `${m.name} (${m.id_hex})`,
                  }))}
                  value={editing.messageId != null ? String(editing.messageId) : null}
                  onChange={(x) => {
                    const mid = x != null ? parseInt(x, 10) : null;
                    const msg = messages.find((m) => m.id === mid);
                    const isArr = !!(msg?.array_index_signal);
                    setEditing((e) => ({
                      ...e,
                      messageId: mid,
                      messageName: msg?.name || '',
                      arrayMode: isArr ? e.arrayMode || 'single_index' : null,
                    }));
                  }}
                  disabled={!schema}
                  placeholder={loadingSchema ? 'Loading schema…' : 'Select message'}
                  searchable
                />
                <Select
                  label="Signal"
                  data={currentMessageSignals.map((s) => ({ value: s.name, label: signalSelectLabel(s) }))}
                  value={editing.signalName || null}
                  onChange={(x) => setEditing((e) => ({ ...e, signalName: x || '' }))}
                  disabled={editing.messageId == null}
                  searchable
                />
                {messages.find((m) => m.id === editing.messageId)?.array_index_signal ? (
                  <>
                    {(editing.viewType === 'min' || editing.viewType === 'max') && (
                      <>
                        <Select
                          label="Array: min/max scope"
                          data={[
                            { value: 'all_indices', label: 'All indexes (report index of extremum)' },
                            { value: 'single_index', label: 'Single index only' },
                          ]}
                          value={editing.arrayMode || 'single_index'}
                          onChange={(x) => setEditing((e) => ({ ...e, arrayMode: x }))}
                        />
                        {editing.arrayMode === 'single_index' && (
                          <NumberInput
                            label="Array index"
                            min={0}
                            value={editing.arrayIndex}
                            onChange={(x) => setEditing((e) => ({ ...e, arrayIndex: x ?? 0 }))}
                          />
                        )}
                      </>
                    )}
                    {(editing.viewType === 'graph' || editing.viewType === 'readout') && (
                      <NumberInput
                        label={editing.viewType === 'readout' ? 'Array index (readout)' : 'Graph array index'}
                        min={0}
                        value={editing.graphArrayIndex}
                        onChange={(x) => setEditing((e) => ({ ...e, graphArrayIndex: x ?? 0 }))}
                      />
                    )}
                  </>
                ) : null}
              </>
            )}
            <Group justify="flex-end" mt="md">
              <Button variant="default" onClick={close}>
                Cancel
              </Button>
              <Button onClick={saveEditor}>Save</Button>
            </Group>
          </Stack>
        )}
      </Modal>
    </Box>
  );
}

function AnalyticsViewCard(props) {
  if (props.view?.viewType === 'sync') {
    return <SyncAnalyticsViewCard {...props} />;
  }
  return <StandardAnalyticsViewCard {...props} />;
}

function StandardAnalyticsViewCard({
  view,
  liveTick,
  onEdit,
  onDelete,
  viewIndex,
  viewCount,
  onMoveUp,
  onMoveDown,
}) {
  const [stat, setStat] = useState(null);
  const [series, setSeries] = useState([]);
  const [err, setErr] = useState(null);
  const [unitLabel, setUnitLabel] = useState(() => view.signalUnit || '');

  useEffect(() => {
    setUnitLabel(view.signalUnit || '');
  }, [view.signalUnit]);

  useEffect(() => {
    if (view.signalUnit) return;
    if (!view.vehicle || !view.dbcFilename || view.messageId == null || !view.signalName) return;
    let cancelled = false;
    apiJson(
      `/api/dbc/vehicles/${encodeURIComponent(view.vehicle)}/files/${encodeURIComponent(view.dbcFilename)}/schema`
    )
      .then((schema) => {
        if (cancelled) return;
        const msg = schema?.messages?.find((m) => m.id === view.messageId);
        const sig = msg?.signals?.find((s) => s.name === view.signalName);
        setUnitLabel(sig?.unit ? String(sig.unit) : '');
      })
      .catch(() => {
        if (!cancelled) setUnitLabel('');
      });
    return () => {
      cancelled = true;
    };
  }, [view.vehicle, view.dbcFilename, view.messageId, view.signalName, view.signalUnit]);

  const run = useCallback(
    async (opts = { silent: false }) => {
      const silent = opts.silent === true;
      if (!silent) {
        setErr(null);
      }
      try {
        const bodyBase = {
          time_range: ANALYTICS_TIME_RANGE,
          vehicle: view.vehicle,
          message_id: view.messageId,
          field: view.signalName,
        };
        const arrIdx =
          (view.viewType === 'graph' || view.viewType === 'readout') && view.isArrayMessage
            ? view.graphArrayIndex
            : null;
        if (view.viewType === 'min' || view.viewType === 'max') {
          const r = await apiJson('/api/analytics/stat', {
            method: 'POST',
            body: JSON.stringify({
              ...bodyBase,
              stat: view.viewType,
              array_mode: view.isArrayMessage ? view.arrayMode : null,
              array_index: view.arrayMode === 'single_index' ? view.arrayIndex : null,
            }),
          });
          setStat(r);
          setSeries([]);
        } else if (view.viewType === 'readout') {
          const r = await apiJson('/api/analytics/series', {
            method: 'POST',
            body: JSON.stringify({
              ...bodyBase,
              array_index: arrIdx,
              limit: 1,
            }),
          });
          setStat(null);
          const pts = r.points || [];
          setSeries(pts.length ? [pts[pts.length - 1]] : []);
        } else {
          const r = await apiJson('/api/analytics/series', {
            method: 'POST',
            body: JSON.stringify({
              ...bodyBase,
              array_index: arrIdx,
              limit: 5000,
            }),
          });
          setStat(null);
          setSeries(r.points || []);
        }
      } catch (e) {
        if (silent) {
          return;
        }
        setErr(String(e.message || e));
        setStat(null);
        setSeries([]);
      }
    },
    [view]
  );

  useEffect(() => {
    run({ silent: false });
  }, [run]);

  useEffect(() => {
    if (liveTick <= 0) return;
    run({ silent: true });
  }, [liveTick, run]);

  return (
    <Paper
      withBorder
      p="md"
      radius="md"
      style={{ background: '#0f0f11', borderColor: 'var(--border)', minWidth: 0, maxWidth: '100%' }}
    >
      <Group justify="space-between" align="flex-start" wrap="nowrap" mb="xs">
        <Box style={{ minWidth: 0 }}>
          <Text fw={600} size="sm" truncate style={{ color: '#e4e4e7' }}>
            {view.viewType === 'readout' ? 'Readout' : view.viewType.toUpperCase()} · {view.signalName}
          </Text>
          <Text size="xs" truncate style={{ color: '#a1a1aa' }}>
            {view.vehicle} / {view.dbcFilename} / {view.messageName || view.messageId}
          </Text>
        </Box>
        <Group gap={4} wrap="nowrap">
          {viewCount > 1 && (
            <>
              <ActionIcon
                variant="default"
                size="sm"
                disabled={viewIndex <= 0}
                onClick={onMoveUp}
                title="Move up"
              >
                <ChevronUp size={14} />
              </ActionIcon>
              <ActionIcon
                variant="default"
                size="sm"
                disabled={viewIndex >= viewCount - 1}
                onClick={onMoveDown}
                title="Move down"
              >
                <ChevronDown size={14} />
              </ActionIcon>
            </>
          )}
          <ActionIcon variant="default" size="sm" onClick={onEdit} title="Edit">
            <Pencil size={14} />
          </ActionIcon>
          <ActionIcon variant="default" size="sm" color="red" onClick={onDelete} title="Delete">
            <Trash2 size={14} />
          </ActionIcon>
        </Group>
      </Group>
      {err && (
        <Text size="xs" c="red" mb="xs">
          {err}
        </Text>
      )}
      {(view.viewType === 'min' || view.viewType === 'max') && stat && (
        <AnalyticsBigReadout
          valueDisplay={stat.value == null ? '—' : formatReadoutValue(stat.value)}
          unit={unitLabel}
          indexLine={stat.atIndex != null ? `Index ${stat.atIndex}` : null}
          timeLine={stat.atTime ? String(stat.atTime) : null}
        />
      )}
      {view.viewType === 'readout' && (
        <AnalyticsBigReadout
          valueDisplay={formatReadoutValue(series[0]?.v)}
          unit={unitLabel}
          indexLine={null}
          timeLine={series[0]?.t ? String(series[0].t) : null}
          footerHint={!series.length ? 'No samples in buffer yet for this signal.' : null}
        />
      )}
      {view.viewType === 'graph' && series.length > 0 && (
        <Box mt="sm" style={{ overflowX: 'auto' }}>
          <SimpleLineChart points={series} width={640} height={220} />
        </Box>
      )}
    </Paper>
  );
}

function SyncAnalyticsViewCard({
  view,
  liveTick,
  onEdit,
  onDelete,
  viewIndex,
  viewCount,
  onMoveUp,
  onMoveDown,
}) {
  const [mergedRows, setMergedRows] = useState([]);
  const [pivotTruncated, setPivotTruncated] = useState(false);
  const [err, setErr] = useState(null);

  const blocks = view.syncFieldsByMessage || [];
  const frameSig = (view.syncFrameSignalName || '').trim();
  const arrIdx = view.isArrayMessage ? (view.syncGraphArrayIndex ?? 0) : null;

  const run = useCallback(
    async (opts = { silent: false }) => {
      const silent = opts.silent === true;
      if (!silent) setErr(null);
      if (!blocks.length || !frameSig) {
        if (!silent) setMergedRows([]);
        return;
      }
      try {
        let anyTrunc = false;
        const streams = await Promise.all(
          blocks.map(async (block) => {
            const fields = block.fields || [];
            const r = await apiJson('/api/analytics/pivot', {
              method: 'POST',
              body: JSON.stringify({
                time_range: ANALYTICS_TIME_RANGE,
                vehicle: view.vehicle,
                message_id: block.messageId,
                fields,
                array_index: arrIdx,
                limit: 2500,
              }),
            });
            if (r.truncated) anyTrunc = true;
            return {
              messageId: block.messageId,
              messageName: block.messageName,
              rows: r.rows || [],
            };
          })
        );
        const merged = mergePivotByFrameSignal(streams, frameSig, 150);
        setMergedRows(merged.slice(-100));
        setPivotTruncated(anyTrunc);
      } catch (e) {
        if (silent) return;
        setErr(String(e.message || e));
        setMergedRows([]);
      }
    },
    [view]
  );

  useEffect(() => {
    run({ silent: false });
  }, [run]);

  useEffect(() => {
    if (liveTick <= 0) return;
    run({ silent: true });
  }, [liveTick, run]);

  const title = frameSig ? `${frameSig} Sync` : 'Sync';
  const idsLabel = (view.syncMessageIds || []).map((id) => canIdHex(id)).join(', ');

  return (
    <Paper
      withBorder
      p="md"
      radius="md"
      style={{ background: '#0f0f11', borderColor: 'var(--border)', minWidth: 0, maxWidth: '100%' }}
    >
      <Group justify="space-between" align="flex-start" wrap="nowrap" mb="xs">
        <Box style={{ minWidth: 0 }}>
          <Text fw={600} size="sm" truncate>
            {title}
          </Text>
          <Text size="xs" c="dimmed" truncate>
            {view.vehicle} / {view.dbcFilename}
            {idsLabel ? ` · ${idsLabel}` : ''}
          </Text>
        </Box>
        <Group gap={4} wrap="nowrap">
          {viewCount > 1 && (
            <>
              <ActionIcon
                variant="default"
                size="sm"
                disabled={viewIndex <= 0}
                onClick={onMoveUp}
                title="Move up"
              >
                <ChevronUp size={14} />
              </ActionIcon>
              <ActionIcon
                variant="default"
                size="sm"
                disabled={viewIndex >= viewCount - 1}
                onClick={onMoveDown}
                title="Move down"
              >
                <ChevronDown size={14} />
              </ActionIcon>
            </>
          )}
          <ActionIcon variant="default" size="sm" onClick={onEdit} title="Edit">
            <Pencil size={14} />
          </ActionIcon>
          <ActionIcon variant="default" size="sm" color="red" onClick={onDelete} title="Delete">
            <Trash2 size={14} />
          </ActionIcon>
        </Group>
      </Group>
      {err && (
        <Text size="xs" c="red" mb="xs">
          {err}
        </Text>
      )}
      {!blocks.length ? (
        <Text size="xs" c="dimmed">
          Open edit and save once to attach DBC field lists (or re-import validated JSON).
        </Text>
      ) : (
        <>
          {pivotTruncated && (
            <Text size="xs" c="dimmed" mb="xs">
              Buffer window truncated rows (per message); increase ring buffer or narrow time if needed.
            </Text>
          )}
          <ScrollArea h={360} type="auto" scrollbarSize={6}>
            <Table fontSize="xs" striped highlightOnHover withTableBorder>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th style={{ whiteSpace: 'nowrap' }}>Time</Table.Th>
                  <Table.Th style={{ whiteSpace: 'nowrap' }}>{frameSig}</Table.Th>
                  {blocks.map((b) => (
                    <Table.Th key={b.messageId} style={{ minWidth: 140 }}>
                      <Text size="xs" fw={600} lineClamp={2}>
                        {b.messageName || 'Message'}
                      </Text>
                      <Text size="10px" c="dimmed">
                        {canIdHex(b.messageId)}
                      </Text>
                    </Table.Th>
                  ))}
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {mergedRows.length === 0 ? (
                  <Table.Tr>
                    <Table.Td colSpan={2 + blocks.length}>
                      <Text size="xs" c="dimmed">
                        No aligned rows yet (need matching {frameSig} across messages in the buffer).
                      </Text>
                    </Table.Td>
                  </Table.Tr>
                ) : (
                  mergedRows.map((row, i) => (
                    <Table.Tr key={i}>
                      <Table.Td style={{ fontFamily: 'monospace', whiteSpace: 'nowrap' }}>
                        {String(row.t ?? '').slice(0, 28)}
                      </Table.Td>
                      <Table.Td style={{ fontFamily: 'monospace' }}>
                        {row.frameId != null && Number.isFinite(Number(row.frameId))
                          ? formatValueCompact(Number(row.frameId))
                          : '—'}
                      </Table.Td>
                      {row.byMessage?.map((bm, j) => (
                        <Table.Td key={j} style={{ fontSize: 11, lineHeight: 1.35, maxWidth: 320 }}>
                          {formatPivotRowSignalsCell(bm.row, frameSig)}
                        </Table.Td>
                      ))}
                    </Table.Tr>
                  ))
                )}
              </Table.Tbody>
            </Table>
          </ScrollArea>
        </>
      )}
    </Paper>
  );
}
