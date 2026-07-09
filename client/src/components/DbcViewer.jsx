import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Car, FileText, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';
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

/** @param {Record<string, unknown>} s */
function signalStartBit(s) {
  const br = s.bit_range;
  if (Array.isArray(br) && br.length >= 1) return fmt(br[0]);
  if (s.start_bit != null) return fmt(s.start_bit);
  return '—';
}

/** @param {Record<string, unknown>} s */
function signalLength(s) {
  if (s.length != null) return fmt(s.length);
  const br = s.bit_range;
  if (Array.isArray(br) && br.length >= 2) {
    return fmt(Number(br[1]) - Number(br[0]) + 1);
  }
  return '—';
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
    <Button
      type="button"
      variant="outline"
      size="xs"
      onClick={onClick}
      className={cn(
        'h-7 border-border px-2.5 text-xs',
        active
          ? 'border-signal-blue/30 bg-signal-blue/10 text-foreground hover:bg-signal-blue/15'
          : 'bg-transparent text-muted-foreground hover:bg-accent'
      )}
    >
      {children}
    </Button>
  );
}

/** @param {{ children: React.ReactNode; onClick: () => void }} p */
function MiniLinkButton({ children, onClick }) {
  return (
    <Button
      type="button"
      variant="link"
      size="xs"
      onClick={onClick}
      className="h-auto px-1.5 py-0.5 text-xs text-muted-foreground"
    >
      {children}
    </Button>
  );
}

/** @param {{ label: string; active: boolean; onClick: () => void }} p */
function EcuPill({ label, active, onClick }) {
  return (
    <Button
      type="button"
      variant="outline"
      size="xs"
      onClick={onClick}
      className={cn(
        'h-7 border-border px-2.5 text-xs',
        active
          ? 'border-signal-purple/30 bg-signal-purple/10 text-foreground hover:bg-signal-purple/15'
          : 'bg-transparent text-muted-foreground hover:bg-accent'
      )}
    >
      {label}
    </Button>
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
    <div className="overflow-hidden rounded-md border border-border bg-card">
      <div className="flex items-start justify-between gap-2 border-b border-border bg-muted/30 px-3 py-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <span className="tabular text-sm font-semibold text-signal-blue">{idStr}</span>
            <span className="text-sm font-semibold text-foreground break-words">{name}</span>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
          <Badge variant="outline" className="tabular border-border text-muted-foreground">
            DLC {fmt(dlc)}
          </Badge>
          {ecu ? (
            <Badge
              variant="outline"
              className="border-signal-purple/30 bg-signal-purple/10 text-signal-purple"
            >
              {ecu}
            </Badge>
          ) : (
            <span className="text-xs italic text-muted-foreground">no sender</span>
          )}
        </div>
      </div>

      {signals.length > 0 ? (
        <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="h-8 px-3 text-xs">Signal</TableHead>
              <TableHead className="h-8 px-3 text-xs">Type</TableHead>
              <TableHead className="h-8 px-3 text-xs">Start</TableHead>
              <TableHead className="h-8 px-3 text-xs">Len</TableHead>
              <TableHead className="h-8 px-3 text-xs">Scale</TableHead>
              <TableHead className="h-8 px-3 text-xs">Offset</TableHead>
              <TableHead className="h-8 px-3 text-xs">Min</TableHead>
              <TableHead className="h-8 px-3 text-xs">Max</TableHead>
              <TableHead className="h-8 px-3 text-xs">Unit</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
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
                <TableRow key={String(sig.name)} className="align-top">
                  <TableCell className="px-3 py-2 text-xs font-medium text-foreground">
                    {String(sig.name ?? '')}
                    {choiceEntries.length > 0 ? (
                      <p className="mt-1 text-xs font-normal text-muted-foreground">
                        {choiceEntries.map(([val, label]) => (
                          <span key={val} className="mr-2 inline-block">
                            <span className="tabular">{val}</span>
                            {' = '}
                            {String(label)}
                          </span>
                        ))}
                      </p>
                    ) : null}
                  </TableCell>
                  <TableCell className="px-3 py-2 text-xs text-muted-foreground">
                    {sig.data_type ? String(sig.data_type) : '—'}
                  </TableCell>
                  <TableCell className="tabular px-3 py-2 text-xs text-muted-foreground">
                    {signalStartBit(sig)}
                  </TableCell>
                  <TableCell className="tabular px-3 py-2 text-xs text-muted-foreground">
                    {signalLength(sig)}
                  </TableCell>
                  <TableCell className="tabular px-3 py-2 text-xs text-muted-foreground">
                    {sig.scale != null ? fmt(sig.scale) : '—'}
                  </TableCell>
                  <TableCell className="tabular px-3 py-2 text-xs text-muted-foreground">
                    {sig.offset != null ? fmt(sig.offset) : '—'}
                  </TableCell>
                  <TableCell className="tabular px-3 py-2 text-xs text-muted-foreground">
                    {sig.min != null ? fmt(sig.min) : '—'}
                  </TableCell>
                  <TableCell className="tabular px-3 py-2 text-xs text-muted-foreground">
                    {sig.max != null ? fmt(sig.max) : '—'}
                  </TableCell>
                  <TableCell className="px-3 py-2 text-xs text-muted-foreground">
                    {sig.unit ? String(sig.unit) : '—'}
                    {bits ? (
                      <p className="tabular mt-0.5 text-[11px] text-muted-foreground/70">{bits}</p>
                    ) : null}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
        </div>
      ) : (
        <p className="px-3 py-2 text-xs text-muted-foreground">No signals defined.</p>
      )}
    </div>
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
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-background p-6">
      <div className="flex shrink-0 flex-col gap-2">
        <h2 className="font-display text-sm font-semibold text-foreground">DBC Viewer</h2>
        {schema ? (
          <p className="text-sm text-muted-foreground">
            <span className="tabular text-sm">{schema.filename}</span>
            {' · '}
            {schema.vehicle} · {messages.length} messages
            {uniqueNodes.length > 0 && (
              <>
                {' · '}
                {uniqueNodes.length} sender{uniqueNodes.length !== 1 ? 's' : ''}
              </>
            )}
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">Select a vehicle and DBC file</p>
        )}

        <div className="flex flex-wrap items-end gap-2">
          <div className="flex flex-col gap-1">
            <Label className="text-xs text-muted-foreground">Vehicle</Label>
            <div className="flex items-center gap-1">
              <Select value={vehicle || undefined} onValueChange={setVehicle}>
                <SelectTrigger className="h-8 w-[220px] text-xs" size="sm">
                  <div className="flex min-w-0 items-center gap-2">
                    <Car className="size-3.5 shrink-0 text-muted-foreground" />
                    <SelectValue placeholder="Select vehicle" />
                  </div>
                </SelectTrigger>
                <SelectContent>
                  {vehicleOptions.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {vehicle ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  className="text-muted-foreground"
                  onClick={() => setVehicle('')}
                  aria-label="Clear vehicle"
                >
                  <X className="size-3" />
                </Button>
              ) : null}
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <Label className="text-xs text-muted-foreground">DBC file</Label>
            <div className="flex items-center gap-1">
              <Select
                value={dbc || undefined}
                onValueChange={setDbc}
                disabled={!vehicle || dbcOptions.length === 0}
              >
                <SelectTrigger className="h-8 w-[260px] text-xs" size="sm">
                  <div className="flex min-w-0 items-center gap-2">
                    <FileText className="size-3.5 shrink-0 text-muted-foreground" />
                    <SelectValue placeholder={vehicle ? 'Select DBC' : 'Select vehicle first'} />
                  </div>
                </SelectTrigger>
                <SelectContent>
                  {dbcOptions.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {dbc ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  className="text-muted-foreground"
                  onClick={() => setDbc('')}
                  aria-label="Clear DBC file"
                >
                  <X className="size-3" />
                </Button>
              ) : null}
            </div>
          </div>

          <div className="flex min-w-[160px] flex-1 flex-col gap-1" style={{ maxWidth: 420 }}>
            <Label className="text-xs text-muted-foreground">Search</Label>
            <Input
              placeholder="IDs, ECUs, messages, signals, enums…"
              value={search}
              onChange={(e) => setSearch(e.currentTarget.value)}
              autoComplete="off"
              className="h-8 text-xs"
            />
          </div>

          <div className="flex flex-col gap-1">
            <Label className="text-xs text-muted-foreground">Sort</Label>
            <Select value={messageSort} onValueChange={(v) => setMessageSort(v ?? 'id-asc')}>
              <SelectTrigger className="h-8 w-[160px] text-xs" size="sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SORT_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {vehicle ? (
          <p className="text-xs text-muted-foreground">* = Embedded Sharepoint DBC</p>
        ) : null}

        <div className="flex flex-wrap items-center gap-2">
          <span className="min-w-16 text-xs text-muted-foreground">Search in</span>
          {SEARCH_FIELD_ROWS.map(([key, label]) => {
            const inputId = `dbc-search-${key}`;
            return (
              <div key={key} className="flex items-center gap-1.5">
                <Checkbox
                  id={inputId}
                  checked={searchIn[key]}
                  onCheckedChange={() => toggleSearchField(key)}
                />
                <Label htmlFor={inputId} className="cursor-pointer text-xs font-normal text-muted-foreground">
                  {label}
                </Label>
              </div>
            );
          })}
          <div className="flex gap-0.5">
            <MiniLinkButton onClick={selectAllSearchFields}>All</MiniLinkButton>
            <MiniLinkButton onClick={deselectAllSearchFields}>None</MiniLinkButton>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground">ECUs</span>
          <span className="text-xs italic text-muted-foreground">from senders</span>
          <MiniLinkButton onClick={selectAllEcus}>All</MiniLinkButton>
          <MiniLinkButton onClick={deselectAllEcus}>None</MiniLinkButton>
          <div className="flex flex-1 flex-wrap gap-1.5">
            {ecuOptions.map((id) => (
              <EcuPill
                key={id}
                label={id === ECU_NONE ? '— no sender' : id}
                active={selectedEcus.has(id)}
                onClick={() => toggleEcu(id)}
              />
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground">CAN ID</span>
          <MiniToggle active={idSearchFormat === 'hex'} onClick={() => setIdSearchFormat('hex')}>
            Hex
          </MiniToggle>
          <MiniToggle active={idSearchFormat === 'decimal'} onClick={() => setIdSearchFormat('decimal')}>
            Decimal
          </MiniToggle>
        </div>
      </div>

      <div className="mt-4 flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-border bg-card">
        {!schema && (
          <div className="p-4">
            <p className="text-sm text-muted-foreground">
              {loadingSchema
                ? 'Loading DBC schema…'
                : dbc
                  ? 'Failed to load schema or no messages found.'
                  : 'Select a vehicle and DBC file to view details.'}
            </p>
          </div>
        )}
        {schema && (
          <ScrollArea className="min-h-0 flex-1">
            <div className="p-4">
              <p className="mb-2 text-sm text-muted-foreground">Messages ({sortedMessages.length})</p>
              <div className="flex flex-col gap-2">
                {sortedMessages.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No messages match ECU and search filters.</p>
                ) : (
                  sortedMessages.map((m) => (
                    <DbcMessageCard key={`${m.id}-${m.name}`} msg={m} idFormat={idSearchFormat} />
                  ))
                )}
              </div>
              {uniqueNodes.length > 0 && (
                <div className="mt-6 border-t border-border pt-4">
                  <p className="mb-1.5 text-xs text-muted-foreground">Senders ({uniqueNodes.length})</p>
                  <p className="text-sm text-foreground">{uniqueNodes.join(', ')}</p>
                </div>
              )}
            </div>
          </ScrollArea>
        )}
      </div>
    </div>
  );
}
