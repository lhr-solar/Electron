import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActionIcon,
  Badge,
  Box,
  Button,
  Divider,
  Grid,
  Group,
  NumberInput,
  ScrollArea,
  Select,
  Stack,
  Switch,
  Table,
  Text,
  TextInput,
  Textarea,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Copy, Plus, Trash2 } from 'lucide-react';
import { apiJson } from '../lib/api';

const EMPTY_MODEL = { version: 1, networks: [] };

const BYTE_ORDER_OPTIONS = [
  { value: 'little_endian', label: 'Intel (little endian)' },
  { value: 'big_endian', label: 'Motorola (big endian)' },
];

const PROTOCOL_OPTIONS = [
  { value: '', label: 'None' },
  { value: 'can', label: 'CAN' },
  { value: 'canfd', label: 'CAN FD' },
  { value: 'j1939', label: 'J1939' },
];

function colorFromName(name) {
  let hash = 0;
  for (let i = 0; i < name.length; i += 1) hash = ((hash << 5) - hash) + name.charCodeAt(i);
  const hue = Math.abs(hash) % 360;
  return `hsla(${hue}, 70%, 55%, 0.55)`;
}

function parseCsv(value) {
  return String(value || '')
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);
}

function signalBitPositions(sig, totalBits) {
  const start = Number(sig?.start);
  const len = Number(sig?.length);
  if (!Number.isFinite(start) || !Number.isFinite(len) || len <= 0) return [];

  const out = [];
  if (sig?.byte_order === 'big_endian') {
    let bit = start;
    for (let i = 0; i < len; i += 1) {
      if (bit >= 0 && bit < totalBits) out.push(bit);
      bit = (bit % 8 === 0) ? bit + 15 : bit - 1;
    }
    return out;
  }

  for (let i = 0; i < len; i += 1) {
    const bit = start + i;
    if (bit >= 0 && bit < totalBits) out.push(bit);
  }
  return out;
}

function MessageBitGrid({ message, selectedSignalName, onSelectSignal }) {
  const bytes = Math.min(Math.max(Number(message?.length || 8), 1), 64);
  const totalBits = bytes * 8;
  const cells = new Array(totalBits).fill(null);

  (message?.signals || []).forEach((sig) => {
    signalBitPositions(sig, totalBits).forEach((bit) => {
      cells[bit] = sig.name;
    });
  });

  const rows = [];
  for (let b = bytes - 1; b >= 0; b -= 1) {
    const bits = [];
    for (let i = 0; i < 8; i += 1) {
      const globalBit = b * 8 + (7 - i);
      bits.push({ globalBit, name: cells[globalBit] });
    }
    rows.push({ byte: b, bits });
  }

  return (
    <Box>
      <Text size="xs" c="dimmed" mb={6}>
        Graphical layout (MSB → LSB). Click a colored bit to select a signal.
      </Text>
      <Box style={{ border: '1px solid var(--border)', borderRadius: 6, overflow: 'hidden' }}>
        {rows.map((row) => (
          <Group key={row.byte} gap={0} wrap="nowrap" style={{ borderTop: '1px solid var(--border)' }}>
            <Box w={72} px={8} py={6} style={{ borderRight: '1px solid var(--border)', background: '#111114' }}>
              <Text size="xs" c="dimmed">Byte {row.byte}</Text>
            </Box>
            {row.bits.map((cell) => (
              <Box
                key={cell.globalBit}
                style={{
                  width: 36,
                  height: 28,
                  borderRight: '1px solid var(--border)',
                  borderTop: cell.name && selectedSignalName === cell.name ? '2px solid #60a5fa' : undefined,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: cell.name ? colorFromName(cell.name) : 'transparent',
                  cursor: cell.name ? 'pointer' : 'default',
                }}
                title={cell.name ? `${cell.name} (bit ${cell.globalBit})` : `bit ${cell.globalBit}`}
                onClick={() => {
                  if (cell.name) onSelectSignal?.(cell.name);
                }}
              >
                <Text size={10} c={cell.name ? '#fff' : 'dimmed'}>{cell.globalBit}</Text>
              </Box>
            ))}
          </Group>
        ))}
      </Box>
    </Box>
  );
}

export function DbcEditor() {
  const [vehicles, setVehicles] = useState([]);
  const [importVehicle, setImportVehicle] = useState('');
  const [importDbcFiles, setImportDbcFiles] = useState([]);
  const [importFilename, setImportFilename] = useState('');
  /** Used for MDC metadata and DBC export folder resolution */
  const [workspaceVehicle, setWorkspaceVehicle] = useState('');
  /** Hint for default .mdc filename when saving */
  const [mdcFilenameHint, setMdcFilenameHint] = useState('');
  const [model, setModel] = useState(EMPTY_MODEL);
  const [selectedNetwork, setSelectedNetwork] = useState(0);
  const [selectedMessage, setSelectedMessage] = useState(0);
  const [selectedSignal, setSelectedSignal] = useState(0);
  const [importLoading, setImportLoading] = useState(false);
  const [mdcOpenLoading, setMdcOpenLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [mdcFiles, setMdcFiles] = useState([]);
  const [selectedMdc, setSelectedMdc] = useState('');

  const loadVehicles = useCallback(async () => {
    try {
      const list = await apiJson('/api/dbc/vehicles');
      setVehicles(list || []);
    } catch (e) {
      notifications.show({ title: 'DBC Editor', message: e.message, color: 'red' });
    }
  }, []);

  useEffect(() => {
    loadVehicles();
  }, [loadVehicles]);

  const loadMdcFiles = useCallback(async () => {
    try {
      const files = await apiJson('/api/mdc/files');
      setMdcFiles(files || []);
    } catch (e) {
      notifications.show({ title: 'MDC files', message: e.message, color: 'red' });
    }
  }, []);

  useEffect(() => {
    loadMdcFiles();
  }, [loadMdcFiles]);

  useEffect(() => {
    if (!importVehicle) {
      setImportDbcFiles([]);
      setImportFilename('');
      return;
    }
    apiJson(`/api/dbc/vehicles/${encodeURIComponent(importVehicle)}/files`)
      .then((list) => {
        const normalized = (list || []).map((entry) => (typeof entry === 'string' ? { name: entry, source: 'local' } : entry));
        setImportDbcFiles(normalized);
        setImportFilename('');
      })
      .catch((e) => notifications.show({ title: 'DBC files', message: e.message, color: 'red' }));
  }, [importVehicle]);

  const newProject = useCallback(() => {
    setModel(EMPTY_MODEL);
    setWorkspaceVehicle('');
    setMdcFilenameHint('');
    setSelectedNetwork(0);
    setSelectedMessage(0);
    setSelectedSignal(0);
  }, []);

  const importFromDbc = useCallback(async () => {
    if (!importVehicle || !importFilename) {
      notifications.show({ title: 'Import', message: 'Choose a vehicle and DBC file.', color: 'orange' });
      return;
    }
    setImportLoading(true);
    try {
      const data = await apiJson(`/api/dbc/vehicles/${encodeURIComponent(importVehicle)}/files/${encodeURIComponent(importFilename)}/editor-model`);
      setModel({ version: data.version || 1, networks: data.networks || [] });
      setWorkspaceVehicle(importVehicle);
      setMdcFilenameHint('');
      setSelectedNetwork(0);
      setSelectedMessage(0);
      setSelectedSignal(0);
      notifications.show({
        title: 'Imported',
        message: 'CAN model loaded. Save as an MDC file to persist edits.',
        color: 'green',
      });
    } catch (e) {
      notifications.show({ title: 'Import failed', message: e.message, color: 'red', autoClose: 6000 });
    } finally {
      setImportLoading(false);
    }
  }, [importVehicle, importFilename]);

  const network = model.networks[selectedNetwork];
  const messages = network?.messages || [];
  const message = messages[selectedMessage];
  const signals = message?.signals || [];
  const signal = signals[selectedSignal];

  const cloneModel = useCallback((prev) => ({
    ...prev,
    networks: (prev.networks || []).map((n) => ({
      ...n,
      nodes: [...(n.nodes || [])],
      messages: (n.messages || []).map((m) => ({
        ...m,
        senders: [...(m.senders || [])],
        signal_groups: [...(m.signal_groups || [])],
        signals: [...(m.signals || [])],
      })),
    })),
  }), []);

  const updateModel = useCallback((updater) => {
    setModel((prev) => updater(cloneModel(prev)));
  }, [cloneModel]);

  const updateMessage = (patch) => {
    updateModel((next) => {
      const net = next.networks[selectedNetwork];
      if (!net) return next;
      net.messages[selectedMessage] = { ...net.messages[selectedMessage], ...patch };
      return next;
    });
  };

  const updateSignal = (idx, patch) => {
    updateModel((next) => {
      const net = next.networks[selectedNetwork];
      const msg = net?.messages?.[selectedMessage];
      if (!msg) return next;
      msg.signals[idx] = { ...msg.signals[idx], ...patch };
      return next;
    });
  };

  const selectSignalByName = (name) => {
    const idx = signals.findIndex((s) => s.name === name);
    if (idx >= 0) setSelectedSignal(idx);
  };

  const addNetwork = () => {
    updateModel((next) => {
      next.networks.push({ name: `CAN_${next.networks.length + 1}`, nodes: [], messages: [] });
      return next;
    });
    setSelectedNetwork(model.networks.length);
    setSelectedMessage(0);
    setSelectedSignal(0);
  };

  const renameNetwork = () => {
    const current = model.networks[selectedNetwork];
    if (!current) return;
    const name = window.prompt('Network name', current.name || 'CAN');
    if (!name) return;
    updateModel((next) => {
      if (next.networks[selectedNetwork]) next.networks[selectedNetwork].name = name.trim() || 'CAN';
      return next;
    });
  };

  const deleteNetwork = () => {
    if (!model.networks[selectedNetwork]) return;
    if (!window.confirm('Delete selected network and all messages?')) return;
    updateModel((next) => {
      next.networks = next.networks.filter((_, i) => i !== selectedNetwork);
      return next;
    });
    setSelectedNetwork((v) => Math.max(0, v - 1));
    setSelectedMessage(0);
    setSelectedSignal(0);
  };

  const addMessage = () => {
    updateModel((next) => {
      if (!next.networks.length) next.networks.push({ name: 'CAN', nodes: [], messages: [] });
      const net = next.networks[selectedNetwork] || next.networks[0];
      net.messages.push({
        id: 0x100 + net.messages.length,
        name: `NEW_MESSAGE_${net.messages.length + 1}`,
        length: 8,
        is_extended_frame: false,
        is_fd: false,
        cycle_time: null,
        senders: [],
        comment: '',
        protocol: null,
        signal_groups: [],
        signals: [],
      });
      return next;
    });
    setSelectedMessage(messages.length);
    setSelectedSignal(0);
  };

  const deleteMessage = (idx) => {
    updateModel((next) => {
      const net = next.networks[selectedNetwork];
      if (!net) return next;
      net.messages = (net.messages || []).filter((_, i) => i !== idx);
      return next;
    });
    setSelectedMessage((v) => Math.max(0, v - (idx <= v ? 1 : 0)));
    setSelectedSignal(0);
  };

  const moveMessage = (idx, dir) => {
    updateModel((next) => {
      const net = next.networks[selectedNetwork];
      if (!net) return next;
      const j = idx + dir;
      if (j < 0 || j >= net.messages.length) return next;
      [net.messages[idx], net.messages[j]] = [net.messages[j], net.messages[idx]];
      return next;
    });
    setSelectedMessage((v) => Math.max(0, v + dir));
  };

  const duplicateMessage = (idx) => {
    updateModel((next) => {
      const net = next.networks[selectedNetwork];
      const msg = net?.messages?.[idx];
      if (!msg) return next;
      net.messages.splice(idx + 1, 0, {
        ...msg,
        name: `${msg.name}_COPY`,
        senders: [...(msg.senders || [])],
        signal_groups: [...(msg.signal_groups || [])],
        signals: [...(msg.signals || [])],
      });
      return next;
    });
    setSelectedMessage(idx + 1);
    setSelectedSignal(0);
  };

  const addSignal = () => {
    if (!message) return;
    updateMessage({
      signals: [
        ...(message.signals || []),
        {
          name: `NEW_SIGNAL_${(message.signals || []).length + 1}`,
          start: 0,
          length: 8,
          byte_order: 'little_endian',
          is_signed: false,
          scale: 1,
          offset: 0,
          minimum: null,
          maximum: null,
          unit: '',
          receivers: [],
          choices: null,
          comment: '',
          is_multiplexer: false,
          multiplexer_ids: null,
          multiplexer_signal: null,
        },
      ],
    });
    setSelectedSignal((message.signals || []).length);
  };

  const deleteSignal = (idx) => {
    if (!message) return;
    updateMessage({ signals: (message.signals || []).filter((_, i) => i !== idx) });
    setSelectedSignal((v) => Math.max(0, v - (idx <= v ? 1 : 0)));
  };

  const moveSignal = (idx, dir) => {
    if (!message) return;
    const nextSignals = [...(message.signals || [])];
    const j = idx + dir;
    if (j < 0 || j >= nextSignals.length) return;
    [nextSignals[idx], nextSignals[j]] = [nextSignals[j], nextSignals[idx]];
    updateMessage({ signals: nextSignals });
    setSelectedSignal((v) => Math.max(0, v + dir));
  };

  const duplicateSignal = (idx) => {
    if (!message) return;
    const src = message.signals?.[idx];
    if (!src) return;
    const nextSignals = [...(message.signals || [])];
    nextSignals.splice(idx + 1, 0, {
      ...src,
      receivers: [...(src.receivers || [])],
      multiplexer_ids: src.multiplexer_ids ? [...src.multiplexer_ids] : null,
      choices: src.choices ? { ...src.choices } : null,
      name: `${src.name}_COPY`,
    });
    updateMessage({ signals: nextSignals });
    setSelectedSignal(idx + 1);
  };

  const nudgeSignal = (deltaStart, deltaLength) => {
    if (!signal || !message) return;
    const maxBits = Math.max(1, Number(message.length) * 8);
    const nextStart = Math.max(0, Math.min(maxBits - 1, Number(signal.start || 0) + deltaStart));
    const nextLength = Math.max(1, Math.min(maxBits, Number(signal.length || 1) + deltaLength));
    updateSignal(selectedSignal, { start: nextStart, length: nextLength });
  };

  const saveMdc = async () => {
    const suggested = mdcFilenameHint || `${(workspaceVehicle || 'project').trim()}_project.mdc`;
    const input = window.prompt('Save MDC filename', suggested);
    if (!input) return;
    setSaving(true);
    try {
      await apiJson(`/api/mdc/files/${encodeURIComponent(input)}`, {
        method: 'PUT',
        body: JSON.stringify({
          vehicle: workspaceVehicle.trim() || null,
          source_filename: null,
          model,
        }),
      });
      setMdcFilenameHint(input);
      notifications.show({ title: 'MDC', message: 'Saved', color: 'green' });
      loadMdcFiles();
    } catch (e) {
      notifications.show({ title: 'Save MDC failed', message: e.message, color: 'red' });
    } finally {
      setSaving(false);
    }
  };

  const openMdc = async () => {
    if (!selectedMdc) return;
    setMdcOpenLoading(true);
    try {
      const data = await apiJson(`/api/mdc/files/${encodeURIComponent(selectedMdc)}`);
      const loadedModel = data?.model || EMPTY_MODEL;
      setModel(loadedModel);
      setWorkspaceVehicle((data?.vehicle || '').trim());
      setMdcFilenameHint(data?.filename || selectedMdc);
      setSelectedNetwork(0);
      setSelectedMessage(0);
      setSelectedSignal(0);
      notifications.show({ title: 'MDC', message: `Loaded ${selectedMdc}`, color: 'green' });
    } catch (e) {
      notifications.show({ title: 'Open MDC failed', message: e.message, color: 'red' });
    } finally {
      setMdcOpenLoading(false);
    }
  };

  const exportDbcsFromMdcModel = async () => {
    const v = (workspaceVehicle || '').trim();
    if (!v) {
      notifications.show({ title: 'Export', message: 'Set the vehicle tag (used for Embedded-Sharepoint …/can/dbc/<vehicle>).', color: 'orange' });
      return;
    }
    const suggested = 'export';
    const base = window.prompt('Base filename for exported DBC set', suggested);
    if (!base) return;
    try {
      const res = await apiJson('/api/mdc/export-dbc', {
        method: 'POST',
        body: JSON.stringify({ vehicle: v, base_name: base, model }),
      });
      const count = (res.exported || []).length;
      notifications.show({ title: 'Export DBC', message: `Exported ${count} DBC file(s).`, color: 'green' });
    } catch (e) {
      notifications.show({ title: 'Export failed', message: e.message, color: 'red' });
    }
  };

  const networkOptions = useMemo(
    () => (model.networks || []).map((n, i) => ({ value: String(i), label: `${n.name} (${(n.messages || []).length})` })),
    [model.networks],
  );

  const signalIssues = useMemo(() => {
    if (!message) return [];
    const issues = [];
    const maxBits = Number(message.length || 8) * 8;
    const muxSelectors = (message.signals || []).filter((s) => !!s.is_multiplexer);
    if (muxSelectors.length > 1) {
      issues.push(`Multiple mux selector signals: ${muxSelectors.map((s) => s.name).join(', ')}`);
    }
    const muxSelectorNames = new Set(muxSelectors.map((s) => s.name));

    const occupied = new Map(); // context:bit => owner
    for (const s of (message.signals || [])) {
      const bits = signalBitPositions(s, maxBits);
      if (!bits.length) {
        issues.push(`${s.name}: invalid or out-of-bounds bits`);
        continue;
      }

      if (s.multiplexer_signal) {
        if (!muxSelectorNames.has(s.multiplexer_signal)) {
          issues.push(`${s.name}: references missing multiplexer '${s.multiplexer_signal}'`);
        }
        if (!s.multiplexer_ids || !s.multiplexer_ids.length) {
          issues.push(`${s.name}: multiplexed signal missing multiplexer IDs`);
        }
      }

      const contexts = [];
      if (!s.multiplexer_signal || s.is_multiplexer) {
        contexts.push('__common__');
      } else {
        for (const id of (s.multiplexer_ids || [])) contexts.push(`mux:${s.multiplexer_signal}:${id}`);
      }

      for (const b of bits) {
        for (const ctx of contexts) {
          const key = `${ctx}:${b}`;
          const owner = occupied.get(key);
          if (owner && owner !== s.name) {
            issues.push(`Overlap (${ctx}) bit ${b}: ${owner} ↔ ${s.name}`);
          } else {
            occupied.set(key, s.name);
          }
        }
      }
    }
    return Array.from(new Set(issues));
  }, [message]);

  const parseChoicesText = (text) => {
    const trimmed = (text || '').trim();
    if (!trimmed) return null;
    const out = {};
    for (const line of trimmed.split('\n')) {
      const raw = line.trim();
      if (!raw) continue;
      const eq = raw.indexOf('=');
      if (eq <= 0) continue;
      const key = raw.slice(0, eq).trim();
      const val = raw.slice(eq + 1).trim();
      if (!key) continue;
      out[key] = val;
    }
    return Object.keys(out).length ? out : null;
  };

  const serializeChoicesText = (choices) => {
    if (!choices || typeof choices !== 'object') return '';
    return Object.entries(choices).map(([k, v]) => `${k}=${v}`).join('\n');
  };

  const parseSignalGroups = (text) => {
    const lines = String(text || '').split('\n').map((x) => x.trim()).filter(Boolean);
    const groups = [];
    for (const line of lines) {
      const [namePart, sigPart] = line.split(':');
      const name = (namePart || '').trim();
      if (!name) continue;
      groups.push({
        name,
        repetitions: 1,
        signal_names: parseCsv(sigPart || ''),
      });
    }
    return groups;
  };

  const serializeSignalGroups = (groups) => {
    return (groups || [])
      .map((g) => `${g.name}: ${(g.signal_names || []).join(', ')}`)
      .join('\n');
  };

  return (
    <Box style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', padding: 16 }}>
      <Text size="sm" c="dimmed" mb="xs">
        Edits are stored in <strong>.mdc</strong> project files. Import from DBC is read-only; export writes DBCs into Embedded-Sharepoint (or local dbc) for the vehicle you set below.
      </Text>
      <Group gap="sm" mb="sm" align="flex-end" wrap="wrap">
        <Button variant="default" onClick={newProject}>New project</Button>
        <Button variant="filled" onClick={saveMdc} loading={saving}>Save MDC</Button>
        <Button variant="default" onClick={exportDbcsFromMdcModel} disabled={!(model.networks || []).length}>Export DBC set</Button>
        <TextInput
          label="Vehicle tag"
          description="MDC metadata and export folder"
          placeholder="e.g. Mcqueen"
          value={workspaceVehicle}
          onChange={(e) => setWorkspaceVehicle(e.currentTarget.value)}
          w={220}
        />
      </Group>

      <Group gap="sm" mb="sm" align="flex-end" wrap="wrap">
        <Select
          label="Import from DBC (vehicle)"
          data={vehicles.map((v) => ({ value: v, label: v }))}
          value={importVehicle || null}
          onChange={(v) => setImportVehicle(v || '')}
          searchable
          clearable
          w={200}
        />
        <Select
          label="DBC file"
          data={importDbcFiles.map((f) => ({ value: f.name, label: f.name }))}
          value={importFilename || null}
          onChange={(v) => setImportFilename(v || '')}
          searchable
          clearable
          w={280}
          disabled={!importVehicle}
        />
        <Button variant="default" onClick={importFromDbc} loading={importLoading} disabled={!importVehicle || !importFilename}>Import</Button>
      </Group>

      <Group gap="sm" mb="sm" align="flex-end" wrap="wrap">
        <Group gap={4}>
          <Button size="xs" variant="default" onClick={addNetwork} leftSection={<Plus size={12} />}>Network</Button>
          <Button size="xs" variant="default" onClick={renameNetwork} disabled={!network}>Rename</Button>
          <Button size="xs" variant="default" color="red" onClick={deleteNetwork} disabled={!network}>Delete</Button>
        </Group>
        <Select
          label="Open MDC"
          data={mdcFiles.map((f) => ({ value: f, label: f }))}
          value={selectedMdc || null}
          onChange={(v) => setSelectedMdc(v || '')}
          searchable
          clearable
          w={360}
        />
        <Button variant="default" onClick={openMdc} disabled={!selectedMdc} loading={mdcOpenLoading}>Open MDC</Button>
      </Group>

        <Grid gutter="md" style={{ flex: 1, minHeight: 0 }}>
          <Grid.Col span={{ base: 12, md: 3 }} style={{ minHeight: 0, display: 'flex', flexDirection: 'column' }}>
            <Group justify="space-between" mb={6}>
              <Text size="sm" fw={600}>Messages</Text>
              <ActionIcon variant="subtle" onClick={addMessage}><Plus size={14} /></ActionIcon>
            </Group>
            <Select
              label="Network"
              data={networkOptions}
              value={String(selectedNetwork)}
              onChange={(v) => {
                setSelectedNetwork(parseInt(v || '0', 10));
                setSelectedMessage(0);
                setSelectedSignal(0);
              }}
              disabled={!networkOptions.length}
              mb="xs"
            />
            <TextInput
              label="Network nodes (comma-separated)"
              value={(network?.nodes || []).join(', ')}
              onChange={(e) => updateModel((next) => {
                const net = next.networks[selectedNetwork];
                if (net) net.nodes = parseCsv(e.currentTarget.value);
                return next;
              })}
              mb="xs"
            />
            <ScrollArea style={{ flex: 1, minHeight: 0 }}>
              <Stack gap={6}>
                {messages.map((m, idx) => (
                  <Group
                    key={`${m.id}-${idx}`}
                    justify="space-between"
                    style={{
                      border: '1px solid var(--border)',
                      borderRadius: 6,
                      padding: '6px 8px',
                      background: idx === selectedMessage ? '#1a1a1f' : '#0f0f11',
                    }}
                  >
                    <Button variant="subtle" p={0} onClick={() => { setSelectedMessage(idx); setSelectedSignal(0); }}>
                      <Text size="xs">{m.name} (0x{Number(m.id).toString(16).toUpperCase()})</Text>
                    </Button>
                    <Group gap={2}>
                      <ActionIcon size="sm" variant="subtle" onClick={() => moveMessage(idx, -1)}><ArrowUp size={12} /></ActionIcon>
                      <ActionIcon size="sm" variant="subtle" onClick={() => moveMessage(idx, 1)}><ArrowDown size={12} /></ActionIcon>
                      <ActionIcon size="sm" variant="subtle" onClick={() => duplicateMessage(idx)}><Copy size={12} /></ActionIcon>
                      <ActionIcon size="sm" variant="subtle" color="red" onClick={() => deleteMessage(idx)}>
                        <Trash2 size={12} />
                      </ActionIcon>
                    </Group>
                  </Group>
                ))}
              </Stack>
            </ScrollArea>
          </Grid.Col>

          <Grid.Col span={{ base: 12, md: 9 }} style={{ minHeight: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
            {!message ? (
              <Box p="md"><Text c="dimmed">No message selected.</Text></Box>
            ) : (
              <>
                <Group grow align="flex-end">
                  <TextInput label="Message name" value={message.name || ''} onChange={(e) => updateMessage({ name: e.currentTarget.value })} />
                  <NumberInput label="Frame ID (decimal)" value={message.id} onChange={(v) => updateMessage({ id: Number(v) || 0 })} />
                  <NumberInput label="DLC" min={1} max={64} value={message.length} onChange={(v) => updateMessage({ length: Number(v) || 8 })} />
                </Group>
                <Group grow align="flex-end">
                  <NumberInput label="Cycle time (ms)" min={0} value={message.cycle_time ?? ''} onChange={(v) => updateMessage({ cycle_time: v === '' ? null : Number(v) })} />
                  <Select label="Protocol" data={PROTOCOL_OPTIONS} value={message.protocol || ''} onChange={(v) => updateMessage({ protocol: v || null })} />
                  <TextInput label="Senders (comma-separated)" value={(message.senders || []).join(', ')} onChange={(e) => updateMessage({ senders: parseCsv(e.currentTarget.value) })} />
                </Group>
                <Group gap="xl">
                  <Switch label="Extended frame (29-bit)" checked={!!message.is_extended_frame} onChange={(e) => updateMessage({ is_extended_frame: e.currentTarget.checked })} />
                  <Switch label="CAN FD" checked={!!message.is_fd} onChange={(e) => updateMessage({ is_fd: e.currentTarget.checked })} />
                </Group>
                <Textarea
                  label="Signal groups (one per line: group: sigA, sigB)"
                  minRows={2}
                  value={serializeSignalGroups(message.signal_groups)}
                  onChange={(e) => updateMessage({ signal_groups: parseSignalGroups(e.currentTarget.value) })}
                />
                {signalIssues.length > 0 && (
                  <Group gap="xs" wrap="wrap">
                    {signalIssues.slice(0, 6).map((issue) => (
                      <Badge key={issue} color="red" variant="light">{issue}</Badge>
                    ))}
                    {signalIssues.length > 6 && <Badge color="red" variant="light">+{signalIssues.length - 6} more</Badge>}
                  </Group>
                )}

                <Divider />
                <Group justify="space-between">
                  <Text size="sm" fw={600}>Signals</Text>
                  <Button size="xs" variant="light" leftSection={<Plus size={14} />} onClick={addSignal}>Add signal</Button>
                </Group>
                <ScrollArea style={{ maxHeight: 260 }}>
                  <Table striped withTableBorder highlightOnHover>
                    <Table.Thead>
                      <Table.Tr>
                        <Table.Th>Name</Table.Th>
                        <Table.Th>Start</Table.Th>
                        <Table.Th>Length</Table.Th>
                        <Table.Th>Endian</Table.Th>
                        <Table.Th>Signed</Table.Th>
                        <Table.Th />
                      </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                      {(message.signals || []).map((sig, idx) => (
                        <Table.Tr key={`${sig.name}-${idx}`} style={{ background: idx === selectedSignal ? 'rgba(96,165,250,0.08)' : undefined }}>
                          <Table.Td>
                            <Button variant="subtle" size="compact-xs" onClick={() => setSelectedSignal(idx)}>{idx + 1}</Button>
                            <TextInput size="xs" mt={4} value={sig.name || ''} onChange={(e) => updateSignal(idx, { name: e.currentTarget.value })} />
                          </Table.Td>
                          <Table.Td><NumberInput size="xs" min={0} max={(message.length * 8) - 1} value={sig.start} onChange={(v) => updateSignal(idx, { start: Number(v) || 0 })} /></Table.Td>
                          <Table.Td><NumberInput size="xs" min={1} max={message.length * 8} value={sig.length} onChange={(v) => updateSignal(idx, { length: Number(v) || 1 })} /></Table.Td>
                          <Table.Td><Select size="xs" data={BYTE_ORDER_OPTIONS} value={sig.byte_order || 'little_endian'} onChange={(v) => updateSignal(idx, { byte_order: v || 'little_endian' })} /></Table.Td>
                          <Table.Td><Switch size="sm" checked={!!sig.is_signed} onChange={(e) => updateSignal(idx, { is_signed: e.currentTarget.checked })} /></Table.Td>
                          <Table.Td>
                            <Group gap={2}>
                              <ActionIcon size="sm" variant="subtle" onClick={() => moveSignal(idx, -1)}><ArrowUp size={12} /></ActionIcon>
                              <ActionIcon size="sm" variant="subtle" onClick={() => moveSignal(idx, 1)}><ArrowDown size={12} /></ActionIcon>
                              <ActionIcon size="sm" variant="subtle" onClick={() => duplicateSignal(idx)}><Copy size={12} /></ActionIcon>
                              <ActionIcon size="sm" variant="subtle" color="red" onClick={() => deleteSignal(idx)}>
                                <Trash2 size={12} />
                              </ActionIcon>
                            </Group>
                          </Table.Td>
                        </Table.Tr>
                      ))}
                    </Table.Tbody>
                  </Table>
                </ScrollArea>

                <Divider />
                {signal ? (
                  <Stack gap="xs">
                    <Text size="sm" fw={600}>Signal Details: {signal.name}</Text>
                    <Group grow>
                      <TextInput label="Unit" value={signal.unit || ''} onChange={(e) => updateSignal(selectedSignal, { unit: e.currentTarget.value })} />
                      <TextInput
                        label="Receivers (comma-separated)"
                        value={(signal.receivers || []).join(', ')}
                        onChange={(e) => updateSignal(selectedSignal, {
                          receivers: parseCsv(e.currentTarget.value),
                        })}
                      />
                    </Group>
                    <Group grow>
                      <NumberInput label="Scale" value={signal.scale ?? 1} onChange={(v) => updateSignal(selectedSignal, { scale: Number(v) || 1 })} />
                      <NumberInput label="Offset" value={signal.offset ?? 0} onChange={(v) => updateSignal(selectedSignal, { offset: Number(v) || 0 })} />
                      <NumberInput label="Min" value={signal.minimum ?? ''} onChange={(v) => updateSignal(selectedSignal, { minimum: v === '' ? null : Number(v) })} />
                      <NumberInput label="Max" value={signal.maximum ?? ''} onChange={(v) => updateSignal(selectedSignal, { maximum: v === '' ? null : Number(v) })} />
                    </Group>
                    <Group align="flex-end" grow>
                      <Switch
                        label="Multiplexer selector"
                        checked={!!signal.is_multiplexer}
                        onChange={(e) => updateSignal(selectedSignal, { is_multiplexer: e.currentTarget.checked })}
                      />
                      <TextInput
                        label="Multiplexer signal name"
                        value={signal.multiplexer_signal || ''}
                        onChange={(e) => updateSignal(selectedSignal, { multiplexer_signal: e.currentTarget.value || null })}
                      />
                      <TextInput
                        label="Multiplexer IDs (comma-separated)"
                        value={(signal.multiplexer_ids || []).join(',')}
                        onChange={(e) => {
                          const ids = parseCsv(e.currentTarget.value)
                            .map((x) => parseInt(x, 10))
                            .filter((x) => Number.isFinite(x));
                          updateSignal(selectedSignal, { multiplexer_ids: ids.length ? ids : null });
                        }}
                      />
                    </Group>
                    <Textarea
                      label="Choices (one per line: value=label)"
                      minRows={3}
                      value={serializeChoicesText(signal.choices)}
                      onChange={(e) => updateSignal(selectedSignal, { choices: parseChoicesText(e.currentTarget.value) })}
                    />
                    <Textarea
                      label="Comment"
                      minRows={2}
                      value={signal.comment || ''}
                      onChange={(e) => updateSignal(selectedSignal, { comment: e.currentTarget.value })}
                    />
                    <Group gap={6}>
                      <Text size="xs" c="dimmed">Nudge</Text>
                      <ActionIcon variant="default" onClick={() => nudgeSignal(-1, 0)} title="Start -1"><ArrowLeft size={12} /></ActionIcon>
                      <ActionIcon variant="default" onClick={() => nudgeSignal(1, 0)} title="Start +1"><ArrowRight size={12} /></ActionIcon>
                      <ActionIcon variant="default" onClick={() => nudgeSignal(-8, 0)} title="Start -8"><ArrowUp size={12} /></ActionIcon>
                      <ActionIcon variant="default" onClick={() => nudgeSignal(8, 0)} title="Start +8"><ArrowDown size={12} /></ActionIcon>
                      <Button size="compact-xs" variant="default" onClick={() => nudgeSignal(0, -1)}>Length -1</Button>
                      <Button size="compact-xs" variant="default" onClick={() => nudgeSignal(0, 1)}>Length +1</Button>
                    </Group>
                  </Stack>
                ) : (
                  <Text size="sm" c="dimmed">Select a signal to edit full properties.</Text>
                )}

                <Divider />
                <MessageBitGrid
                  message={message}
                  selectedSignalName={signal?.name}
                  onSelectSignal={selectSignalByName}
                />
              </>
            )}
          </Grid.Col>
        </Grid>
    </Box>
  );
}
