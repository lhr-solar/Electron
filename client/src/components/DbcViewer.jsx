import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Box, Group, Stack, Text, Select, ScrollArea, TextInput, UnstyledButton, Checkbox } from '@mantine/core';
import { Car, FileText } from 'lucide-react';
import {
  ECU_NONE,
  formatCanIdHex,
  messageMatchesSearch,
  buildEcuOptions,
  sortMessages,
  messageMatchesEcuFilter,
} from '../dbc/dbcSearch';
import { apiJson } from '../lib/api';

/** @param {unknown} v */
function fmt(v) {
  if (v === null || v === undefined) return '—';
  if (typeof v === 'boolean') return v ? 'yes' : 'no';
  if (typeof v === 'number' && Number.isNaN(v)) return '—';
  return String(v);
}

/** @param {{ id?: number; id_hex?: string }} m @param {'hex' | 'decimal'} idFormat */
function formatMessageId(m, idFormat) {
  if (idFormat === 'decimal') return String(m.id ?? '');
  return formatCanIdHex(m.id_hex ?? m.id);
}

/** @param {Record<string, unknown>} s */
function bitRangeLine(s) {
  const br = s.bit_range;
  if (Array.isArray(br) && br.length >= 2) {
    return `${br[0]}–${br[1]} (${s.length ?? '?'} bits)`;
  }
  if (s.start_bit != null && s.length != null) {
    const end = Number(s.start_bit) + Number(s.length) - 1;
    return `${s.start_bit}–${end} (${s.length} bits)`;
  }
  return null;
}

const SORT_OPTIONS = [
  { value: 'id-asc', label: 'ID · ascending' },
  { value: 'id-desc', label: 'ID · descending' },
  { value: 'name-asc', label: 'Name · A–Z' },
  { value: 'name-desc', label: 'Name · Z–A' },
];

const SEARCH_FIELD_ROWS = [
  ['ids', 'CAN IDs'],
  ['ecus', 'Sender ECUs'],
  ['msgNames', 'Messages & comments'],
  ['sigNames', 'Signals & enums'],
];

/** @param {{ active: boolean; children: React.ReactNode; onClick: () => void }} p */
function MiniToggle({ active, children, onClick }) {
  return (
    <UnstyledButton
      type="button"
      onClick={onClick}
      style={{
        padding: '4px 10px',
        borderRadius: 4,
        fontSize: 12,
        border: '1px solid var(--border)',
        backgroundColor: active ? '#27272a' : 'transparent',
        color: active ? '#e4e4e7' : '#71717a',
      }}
    >
      {children}
    </UnstyledButton>
  );
}

/** @param {{ children: React.ReactNode; onClick: () => void }} p */
function MiniLinkButton({ children, onClick }) {
  return (
    <UnstyledButton
      type="button"
      onClick={onClick}
      style={{
        padding: '2px 6px',
        fontSize: 12,
        color: '#71717a',
      }}
    >
      {children}
    </UnstyledButton>
  );
}

/** @param {{ label: string; active: boolean; onClick: () => void }} p */
function EcuPill({ label, active, onClick }) {
  return (
    <UnstyledButton
      type="button"
      onClick={onClick}
      style={{
        padding: '4px 10px',
        borderRadius: 4,
        fontSize: 12,
        border: '1px solid var(--border)',
        backgroundColor: active ? '#27272a' : 'transparent',
        color: active ? '#e4e4e7' : '#71717a',
      }}
    >
      {label}
    </UnstyledButton>
  );
}

/** @param {{ msg: Record<string, unknown>; idFormat: 'hex' | 'decimal' }} p */
function DbcMessageCard({ msg, idFormat }) {
  const name = String(msg.name ?? '');
  const dlc = msg.length;
  const ecu = msg.ecu;
  const signals = Array.isArray(msg.signals) ? msg.signals : [];
  const idStr = formatMessageId(msg, idFormat);

  return (
    <Box
      style={{
        border: '1px solid var(--border)',
        borderRadius: 6,
        padding: 10,
        backgroundColor: '#18181b',
      }}
    >
      <Group gap={6} mb={4} justify="space-between" wrap="nowrap" align="flex-start">
        <Text size="sm" fw={600} style={{ color: '#e4e4e7', wordBreak: 'break-word' }}>
          <Text span ff="monospace" style={{ color: '#a1a1aa', marginRight: 6 }}>
            {idStr}
          </Text>
          · {name}
        </Text>
        <Group gap={6} wrap="nowrap" style={{ flexShrink: 0 }}>
          <Text size="xs" c="dimmed">
            DLC {fmt(dlc)}
          </Text>
          {ecu ? (
            <Text size="xs" c="dimmed" style={{ opacity: 0.85 }}>
              ECU: {ecu}
            </Text>
          ) : (
            <Text size="xs" c="dimmed" fs="italic">
              no sender
            </Text>
          )}
        </Group>
      </Group>
      {signals.length > 0 ? (
        <Stack gap={6} mt={6}>
          {signals.map((s) => {
            if (!s || typeof s !== 'object') return null;
            const sig = /** @type {Record<string, unknown>} */ (s);
            const bits = bitRangeLine(sig);
            const choices = sig.choices;
            const choiceEntries =
              choices && typeof choices === 'object' && !Array.isArray(choices)
                ? Object.entries(choices)
                : [];
            return (
              <Box
                key={String(sig.name)}
                pt={6}
                style={{ borderTop: '1px solid var(--border)' }}
              >
                <Group gap={6} wrap="wrap" mb={2}>
                  <Text size="xs" fw={500} style={{ color: 'var(--text)' }}>
                    {String(sig.name ?? '')}
                  </Text>
                  {sig.data_type ? (
                    <Text size="xs" c="dimmed">
                      {String(sig.data_type)}
                    </Text>
                  ) : null}
                  {bits ? (
                    <Text size="xs" c="dimmed">
                      bits {bits}
                    </Text>
                  ) : null}
                  {sig.unit ? (
                    <Text size="xs" c="dimmed">
                      unit {String(sig.unit)}
                    </Text>
                  ) : null}
                </Group>
                {(sig.scale != null ||
                  sig.offset != null ||
                  sig.min != null ||
                  sig.max != null) && (
                  <Text size="xs" ff="monospace" c="dimmed" mt={2}>
                    {[
                      sig.scale != null ? `scale=${fmt(sig.scale)}` : null,
                      sig.offset != null ? `offset=${fmt(sig.offset)}` : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                    {(sig.min != null || sig.max != null) && (
                      <>
                        {(sig.scale != null || sig.offset != null) ? ' · ' : ''}
                        range [{fmt(sig.min)}, {fmt(sig.max)}]
                      </>
                    )}
                  </Text>
                )}
                {choiceEntries.length > 0 ? (
                  <Text size="xs" c="dimmed" mt={4}>
                    values:{' '}
                    {choiceEntries.map(([val, label]) => (
                      <Text span key={val} mr="xs">
                        <Text span ff="monospace" c="dimmed">
                          {val}
                        </Text>
                        {' = '}
                        {String(label)}
                      </Text>
                    ))}
                  </Text>
                ) : null}
              </Box>
            );
          })}
        </Stack>
      ) : (
        <Text size="xs" c="dimmed" mt={4}>
          No signals defined.
        </Text>
      )}
    </Box>
  );
}

export function DbcViewer() {
  const [vehicles, setVehicles] = useState([]);
  const [vehicle, setVehicle] = useState('');
  const [dbcFiles, setDbcFiles] = useState([]);
  const [dbc, setDbc] = useState('');
  const [schema, setSchema] = useState(null);
  const [loadingSchema, setLoadingSchema] = useState(false);

  const [search, setSearch] = useState('');
  const [searchIn, setSearchIn] = useState({
    ids: true,
    ecus: true,
    msgNames: true,
    sigNames: true,
  });
  const [selectedEcus, setSelectedEcus] = useState(() => new Set());
  const [messageSort, setMessageSort] = useState('id-asc');
  const [idSearchFormat, setIdSearchFormat] = useState(/** @type {'hex' | 'decimal'} */ ('hex'));

  const loadVehicles = useCallback(() => {
    apiJson('/api/dbc/vehicles')
      .then(setVehicles)
      .catch(() => setVehicles([]));
  }, []);

  const loadDbcFiles = useCallback((v) => {
    if (!v) {
      setDbcFiles([]);
      return;
    }
    apiJson(`/api/dbc/vehicles/${encodeURIComponent(v)}/files`)
      .then((files) => {
        const list = (files || []).map((entry) =>
          typeof entry === 'string' ? { name: entry, source: 'local' } : entry
        );
        setDbcFiles(list);
      })
      .catch(() => setDbcFiles([]));
  }, []);

  const loadSchema = useCallback((v, filename) => {
    if (!v || !filename) {
      setSchema(null);
      return;
    }
    setLoadingSchema(true);
    apiJson(`/api/dbc/vehicles/${encodeURIComponent(v)}/files/${encodeURIComponent(filename)}/schema`)
      .then(setSchema)
      .catch(() => setSchema(null))
      .finally(() => setLoadingSchema(false));
  }, []);

  useEffect(() => {
    loadVehicles();
  }, [loadVehicles]);

  useEffect(() => {
    if (!vehicle) {
      setDbcFiles([]);
      setDbc('');
      setSchema(null);
      return;
    }
    loadDbcFiles(vehicle);
    setDbc('');
    setSchema(null);
  }, [vehicle, loadDbcFiles]);

  useEffect(() => {
    if (vehicle && dbc) {
      loadSchema(vehicle, dbc);
    } else {
      setSchema(null);
    }
  }, [vehicle, dbc, loadSchema]);

  const messages = useMemo(() => {
    if (!schema?.messages) return [];
    return [...schema.messages].filter((m) => m && typeof m === 'object');
  }, [schema]);

  const ecuOptions = useMemo(() => buildEcuOptions(messages), [messages]);

  useEffect(() => {
    setSelectedEcus(new Set(ecuOptions));
  }, [vehicle, dbc, ecuOptions]);

  const filteredMessages = useMemo(() => {
    return messages.filter(
      (m) => messageMatchesEcuFilter(m, selectedEcus) && messageMatchesSearch(m, search, searchIn, idSearchFormat)
    );
  }, [messages, selectedEcus, search, searchIn, idSearchFormat]);

  const sortedMessages = useMemo(() => sortMessages(filteredMessages, messageSort), [filteredMessages, messageSort]);

  const toggleEcu = (id) => {
    setSelectedEcus((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  };

  const selectAllEcus = () => setSelectedEcus(new Set(ecuOptions));
  const deselectAllEcus = () => setSelectedEcus(new Set());

  const selectAllSearchFields = () =>
    setSearchIn({ ids: true, ecus: true, msgNames: true, sigNames: true });
  const deselectAllSearchFields = () =>
    setSearchIn({ ids: false, ecus: false, msgNames: false, sigNames: false });

  const toggleSearchField = (key) => {
    setSearchIn((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const uniqueNodes = useMemo(() => {
    const s = new Set();
    for (const m of messages) {
      if (m?.ecu) s.add(m.ecu);
    }
    return Array.from(s).sort();
  }, [messages]);

  const vehicleOptions = useMemo(() => vehicles.map((v) => ({ value: v, label: v })), [vehicles]);
  const dbcOptions = useMemo(
    () =>
      dbcFiles.map((f) => ({
        value: f.name,
        label: f.source === 'embedded' ? `${f.name} *` : f.name,
      })),
    [dbcFiles]
  );

  return (
    <Box
      style={{
        flex: 1,
        height: '100%',
        minHeight: 0,
        padding: 24,
        backgroundColor: '#0a0a0b',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <Stack gap="sm" style={{ flexShrink: 0 }}>
        <Text size="md" fw={600} style={{ color: '#e4e4e7' }}>
          DBC Viewer
        </Text>
        {schema ? (
          <Text size="sm" c="dimmed">
            <Text span ff="monospace" fz="sm">
              {schema.filename}
            </Text>
            {' · '}
            {schema.vehicle} · {messages.length} messages
            {uniqueNodes.length > 0 && (
              <>
                {' · '}
                {uniqueNodes.length} sender{uniqueNodes.length !== 1 ? 's' : ''}
              </>
            )}
          </Text>
        ) : (
          <Text size="sm" c="dimmed">
            Select a vehicle and DBC file
          </Text>
        )}

        <Group gap="sm" align="flex-end" wrap="wrap">
          <Select
            label="Vehicle"
            placeholder="Select vehicle"
            data={vehicleOptions}
            value={vehicle || null}
            onChange={(v) => setVehicle(v ?? '')}
            size="sm"
            clearable
            searchable
            leftSection={<Car size={14} style={{ color: 'var(--text-muted)' }} />}
            style={{ width: 220 }}
          />
          <Select
            label="DBC file"
            placeholder={vehicle ? 'Select DBC' : 'Select vehicle first'}
            data={dbcOptions}
            value={dbc || null}
            onChange={(v) => setDbc(v ?? '')}
            size="sm"
            clearable
            searchable
            leftSection={<FileText size={14} style={{ color: 'var(--text-muted)' }} />}
            style={{ width: 260 }}
            disabled={!vehicle || dbcOptions.length === 0}
          />
          <TextInput
            label="Search"
            placeholder="IDs, ECUs, messages, signals, enums…"
            value={search}
            onChange={(e) => setSearch(e.currentTarget.value)}
            autoComplete="off"
            size="sm"
            style={{ flex: '1 1 200px', minWidth: 160, maxWidth: 420 }}
          />
          <Select
            label="Sort"
            data={SORT_OPTIONS}
            value={messageSort}
            onChange={(v) => setMessageSort(v ?? 'id-asc')}
            size="sm"
            style={{ width: 160 }}
          />
        </Group>

        {vehicle ? (
          <Text size="xs" c="dimmed">
            * = Embedded Sharepoint DBC
          </Text>
        ) : null}

        <Group gap="md" align="center" wrap="wrap">
          <Text size="xs" c="dimmed" style={{ minWidth: 64 }}>
            Search in
          </Text>
          {SEARCH_FIELD_ROWS.map(([key, label]) => (
            <Checkbox
              key={key}
              label={label}
              checked={searchIn[key]}
              onChange={() => toggleSearchField(key)}
              size="xs"
              styles={{ label: { color: '#a1a1aa' } }}
            />
          ))}
          <Group gap={4}>
            <MiniLinkButton onClick={selectAllSearchFields}>All</MiniLinkButton>
            <MiniLinkButton onClick={deselectAllSearchFields}>None</MiniLinkButton>
          </Group>
        </Group>

        <Group gap="sm" align="center" wrap="wrap">
          <Text size="xs" c="dimmed">
            ECUs
          </Text>
          <Text size="xs" c="dimmed" fs="italic">
            from senders
          </Text>
          <MiniLinkButton onClick={selectAllEcus}>All</MiniLinkButton>
          <MiniLinkButton onClick={deselectAllEcus}>None</MiniLinkButton>
          <Group gap={6} wrap="wrap" style={{ flex: 1 }}>
            {ecuOptions.map((id) => (
              <EcuPill
                key={id}
                label={id === ECU_NONE ? '— no sender' : id}
                active={selectedEcus.has(id)}
                onClick={() => toggleEcu(id)}
              />
            ))}
          </Group>
        </Group>

        <Group gap="sm" align="center" wrap="wrap">
          <Text size="xs" c="dimmed">
            CAN ID
          </Text>
          <MiniToggle active={idSearchFormat === 'hex'} onClick={() => setIdSearchFormat('hex')}>
            Hex
          </MiniToggle>
          <MiniToggle active={idSearchFormat === 'decimal'} onClick={() => setIdSearchFormat('decimal')}>
            Decimal
          </MiniToggle>
        </Group>
      </Stack>

      <Box
        style={{
          flex: 1,
          minHeight: 0,
          marginTop: 16,
          border: '1px solid var(--border)',
          borderRadius: 8,
          backgroundColor: '#0f0f11',
          overflow: 'hidden',
        }}
      >
        {!schema && (
          <Box p="md">
            <Text size="sm" c="dimmed">
              {loadingSchema
                ? 'Loading DBC schema…'
                : dbc
                  ? 'Failed to load schema or no messages found.'
                  : 'Select a vehicle and DBC file to view details.'}
            </Text>
          </Box>
        )}
        {schema && (
          <ScrollArea style={{ height: '100%' }} type="auto" scrollbarSize={8}>
            <Box p="md">
              <Text size="sm" c="dimmed" mb="sm">
                Messages ({sortedMessages.length})
              </Text>
              <Stack gap="sm">
                {sortedMessages.length === 0 ? (
                  <Text size="sm" c="dimmed">
                    No messages match ECU and search filters.
                  </Text>
                ) : (
                  sortedMessages.map((m) => (
                    <DbcMessageCard key={`${m.id}-${m.name}`} msg={m} idFormat={idSearchFormat} />
                  ))
                )}
              </Stack>
              {uniqueNodes.length > 0 && (
                <Box mt="lg" pt="md" style={{ borderTop: '1px solid var(--border)' }}>
                  <Text size="xs" c="dimmed" mb={6}>
                    Senders ({uniqueNodes.length})
                  </Text>
                  <Text size="sm" style={{ color: '#e4e4e7' }}>
                    {uniqueNodes.join(', ')}
                  </Text>
                </Box>
              )}
            </Box>
          </ScrollArea>
        )}
      </Box>
    </Box>
  );
}
