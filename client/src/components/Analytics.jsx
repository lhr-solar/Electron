import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useDisclosure, useLocalStorage } from '@/lib/hooks';
import { notifications } from '@/lib/notify';
import { ChevronDown, ChevronUp, Pencil, Plus, Trash2, Upload, Download } from 'lucide-react';
import { mergePivotByFrameSignal } from '../analytics/mergeByFrame';
import { SimpleLineChart } from './SimpleLineChart';
import { socket } from '../socket';
import { apiJson } from '../lib/api';
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
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Collapsible, CollapsibleContent } from '@/components/ui/collapsible';
import { DotPattern } from '@/components/ui/dot-pattern';
import { cn } from '@/lib/utils';

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

/** Large min / max / readout value block with optional unit, index line, and time. */
function AnalyticsBigReadout({ valueDisplay, unit, indexLine, timeLine, footerHint }) {
  const missing = valueDisplay === '—';
  return (
    <div className="mt-4 px-4 py-8 text-center">
      <div className="flex flex-wrap items-baseline justify-center gap-2">
        <span className="tabular text-[clamp(2.5rem,8vw,4rem)] font-bold leading-tight tracking-tight text-foreground">
          {valueDisplay}
        </span>
        {unit ? (
          <span className="tabular text-[clamp(1rem,2.8vw,1.4rem)] font-medium text-muted-foreground">
            {unit}
          </span>
        ) : null}
      </div>
      {indexLine != null && indexLine !== '' ? (
        <p className="mt-2 text-xs text-muted-foreground">{indexLine}</p>
      ) : null}
      {timeLine ? (
        <p className={cn('text-xs text-muted-foreground', indexLine ? 'mt-1' : 'mt-4')}>
          {formatAnalyticsTime(timeLine)}
        </p>
      ) : null}
      {footerHint && missing ? (
        <p className="mt-4 text-xs text-muted-foreground">{footerHint}</p>
      ) : null}
    </div>
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

function parseNumberInput(raw, fallback = 0) {
  if (raw === '' || raw == null) return fallback;
  const n = Number(raw);
  return Number.isNaN(n) ? fallback : n;
}

function FieldSelect({ label, description, value, onValueChange, disabled, placeholder, children }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label className="text-xs">{label}</Label>
      {description ? <p className="text-xs text-muted-foreground">{description}</p> : null}
      <Select value={value} onValueChange={onValueChange} disabled={disabled}>
        <SelectTrigger className="w-full" size="sm">
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>{children}</SelectContent>
      </Select>
    </div>
  );
}

function FieldNumber({ label, description, min, value, onChange }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label className="text-xs">{label}</Label>
      {description ? <p className="text-xs text-muted-foreground">{description}</p> : null}
      <Input
        type="number"
        min={min}
        className="h-8"
        value={value ?? 0}
        onChange={(e) => onChange(parseNumberInput(e.target.value, 0))}
      />
    </div>
  );
}

function AnalyticsViewCardShell({
  title,
  subtitle,
  viewCount,
  viewIndex,
  onMoveUp,
  onMoveDown,
  onEdit,
  onDelete,
  error,
  children,
}) {
  const [open, setOpen] = useState(true);

  return (
    <Card className="max-w-full min-w-0 gap-0 py-0">
      <CardHeader className="gap-1 border-b border-border px-4 py-3">
        <div className="min-w-0">
          <CardTitle className="truncate font-display text-sm">{title}</CardTitle>
          <CardDescription className="truncate text-xs">{subtitle}</CardDescription>
        </div>
        <CardAction>
          <div className="flex shrink-0 items-center gap-0.5">
            {viewCount > 1 && (
              <>
                <Button
                  variant="outline"
                  size="icon-sm"
                  disabled={viewIndex <= 0}
                  onClick={onMoveUp}
                  title="Move up"
                >
                  <ChevronUp className="size-3.5" />
                </Button>
                <Button
                  variant="outline"
                  size="icon-sm"
                  disabled={viewIndex >= viewCount - 1}
                  onClick={onMoveDown}
                  title="Move down"
                >
                  <ChevronDown className="size-3.5" />
                </Button>
              </>
            )}
            <Button
              variant="outline"
              size="icon-sm"
              onClick={() => setOpen((v) => !v)}
              title={open ? 'Collapse' : 'Expand'}
            >
              <ChevronDown className={cn('size-3.5 transition-transform', open && 'rotate-180')} />
            </Button>
            <Button variant="outline" size="icon-sm" onClick={onEdit} title="Edit">
              <Pencil className="size-3.5" />
            </Button>
            <Button
              variant="outline"
              size="icon-sm"
              onClick={onDelete}
              title="Delete"
              className="text-destructive hover:text-destructive"
            >
              <Trash2 className="size-3.5" />
            </Button>
          </div>
        </CardAction>
      </CardHeader>
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleContent>
          <CardContent className="px-4 py-3">
            {error ? <p className="mb-2 text-xs text-signal-red">{error}</p> : null}
            {children}
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
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
    let inter = new Set((msgs[0].signals || []).map((s) => s.name));
    for (let i = 1; i < msgs.length; i++) {
      const n = new Set((msgs[i].signals || []).map((s) => s.name));
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

  const isEditingExisting = editing?.id && views?.some((x) => x.id === editing.id);

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-background">
      <div className="shrink-0 px-4 pt-4">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-display text-sm font-semibold text-foreground">Analytics</h2>
          <div className="flex flex-wrap items-center gap-1">
            <Button size="sm" onClick={openNew}>
              <Plus className="size-4" />
              Add view
            </Button>
            <Button size="sm" variant="outline" onClick={downloadJson}>
              <Download className="size-4" />
              Download JSON
            </Button>
            <label className="cursor-pointer">
              <input
                type="file"
                accept="application/json,.json"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = '';
                  if (f) onUploadFile(f);
                }}
              />
              <Button size="sm" variant="outline" asChild>
                <span>
                  <Upload className="size-4" />
                  Upload JSON
                </span>
              </Button>
            </label>
          </div>
        </div>
      </div>

      {uploadErrors.length > 0 && (
        <div className="shrink-0 px-4">
          <Card className="mb-4 gap-0 border-signal-amber/40 bg-signal-amber/5 py-0">
            <CardContent className="px-4 py-3">
              <p className="mb-2 text-sm font-semibold text-signal-amber">Validation errors</p>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>View</TableHead>
                    <TableHead>Path</TableHead>
                    <TableHead>Detail</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {uploadErrors.map((e, i) => (
                    <TableRow key={i}>
                      <TableCell className="tabular text-xs">{String(e.viewId ?? '—')}</TableCell>
                      <TableCell className="tabular text-xs">{e.path}</TableCell>
                      <TableCell className="text-xs">{e.detail}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {pendingValid.length > 0 && (
                <Button size="xs" className="mt-2" onClick={mergeValidImports}>
                  Import {pendingValid.length} valid view(s) anyway
                </Button>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto px-4 pb-4">
        {(views || []).length === 0 ? (
          <div className="relative flex flex-col items-center justify-center overflow-hidden rounded-lg border border-dashed border-border px-6 py-16 text-center">
            <DotPattern className="text-muted-foreground/15" width={20} height={20} />
            <p className="relative text-sm text-muted-foreground">
              No views yet. Add a view for live min / max / graph, large readout, or FrameID sync.
            </p>
            <Button size="sm" className="relative mt-4" onClick={openNew}>
              <Plus className="size-4" />
              Add view
            </Button>
          </div>
        ) : (
          <div className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
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
          </div>
        )}
      </div>

      <Dialog open={opened} onOpenChange={(o) => { if (!o) { close(); setEditing(null); } }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{isEditingExisting ? 'Edit view' : 'New view'}</DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="flex flex-col gap-2">
              <FieldSelect
                label="Vehicle"
                value={editing.vehicle || undefined}
                onValueChange={(x) =>
                  setEditing((e) => ({
                    ...e,
                    vehicle: x || '',
                    dbcFilename: '',
                    messageId: null,
                    syncMessageIds: [],
                    syncFrameSignalName: '',
                  }))
                }
              >
                {vehicles.map((v) => (
                  <SelectItem key={v} value={v}>
                    {v}
                  </SelectItem>
                ))}
              </FieldSelect>

              <FieldSelect
                label="DBC file"
                value={editing.dbcFilename || undefined}
                disabled={!editing.vehicle}
                onValueChange={(x) =>
                  setEditing((e) => ({
                    ...e,
                    dbcFilename: x || '',
                    messageId: null,
                    syncMessageIds: [],
                    syncFrameSignalName: '',
                  }))
                }
              >
                {dbcFiles.map((f) => (
                  <SelectItem key={f.name} value={f.name}>
                    {f.source === 'embedded' ? `${f.name} *` : f.name}
                  </SelectItem>
                ))}
              </FieldSelect>

              <FieldSelect
                label="View type"
                value={editing.viewType}
                onValueChange={(x) => {
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
              >
                <SelectItem value="min">Min</SelectItem>
                <SelectItem value="max">Max</SelectItem>
                <SelectItem value="graph">Graph (time series)</SelectItem>
                <SelectItem value="readout">Large readout (current value)</SelectItem>
                <SelectItem value="sync">FrameID sync (combined signals)</SelectItem>
              </FieldSelect>

              {editing.viewType === 'sync' ? (
                <>
                  <p className="text-xs text-muted-foreground">
                    Add one or more CAN messages (different arbitration ids allowed). Pick the exact DBC signal used as the
                    rolling frame counter; rows are aligned by matching that value and closest timestamp.
                  </p>
                  <Card className="gap-0 bg-muted/40 py-0">
                    <CardContent className="px-3 py-3">
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <span className="text-sm font-semibold">Messages</span>
                        <Button
                          size="xs"
                          variant="secondary"
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
                      </div>
                      {(editing.syncMessageIds || []).length === 0 ? (
                        <p className="text-xs text-muted-foreground">Add at least one CAN message.</p>
                      ) : (
                        <div className="flex flex-col gap-1.5">
                          {(editing.syncMessageIds || []).map((mid, idx) => (
                            <div key={idx} className="flex items-start gap-1">
                              <Select
                                value={mid != null ? String(mid) : undefined}
                                disabled={!schema}
                                onValueChange={(x) => {
                                  const v = x != null ? parseInt(x, 10) : null;
                                  setEditing((e) => {
                                    const next = [...(e.syncMessageIds || [])];
                                    next[idx] = v;
                                    return { ...e, syncMessageIds: next };
                                  });
                                }}
                              >
                                <SelectTrigger className="min-w-0 flex-1" size="sm">
                                  <SelectValue placeholder="Select CAN message" />
                                </SelectTrigger>
                                <SelectContent>
                                  {messages.map((m) => (
                                    <SelectItem key={m.id} value={String(m.id)}>
                                      {m.name} ({m.id_hex})
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <Button
                                variant="outline"
                                size="icon-sm"
                                className="mt-0.5 shrink-0 text-destructive hover:text-destructive"
                                onClick={() =>
                                  setEditing((e) => ({
                                    ...e,
                                    syncMessageIds: (e.syncMessageIds || []).filter((_, i) => i !== idx),
                                  }))
                                }
                              >
                                <Trash2 className="size-3.5" />
                              </Button>
                            </div>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                  <FieldSelect
                    label="Frame sync signal"
                    description="Exact name from DBC (shared by all messages above), e.g. FrameID_…"
                    value={editing.syncFrameSignalName || undefined}
                    disabled={syncFrameSignalOptions.length === 0}
                    placeholder={syncSelectedMessages.length ? 'Select signal' : 'Add messages first'}
                    onValueChange={(x) => setEditing((e) => ({ ...e, syncFrameSignalName: x || '' }))}
                  >
                    {syncFrameSignalOptions.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </FieldSelect>
                  {syncNeedsArrayIndex ? (
                    <FieldNumber
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
                  <FieldSelect
                    label="Message"
                    value={editing.messageId != null ? String(editing.messageId) : undefined}
                    disabled={!schema}
                    placeholder={loadingSchema ? 'Loading schema…' : 'Select message'}
                    onValueChange={(x) => {
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
                  >
                    {messages.map((m) => (
                      <SelectItem key={m.id} value={String(m.id)}>
                        {m.name} ({m.id_hex})
                      </SelectItem>
                    ))}
                  </FieldSelect>
                  <FieldSelect
                    label="Signal"
                    value={editing.signalName || undefined}
                    disabled={editing.messageId == null}
                    onValueChange={(x) => setEditing((e) => ({ ...e, signalName: x || '' }))}
                  >
                    {currentMessageSignals.map((s) => (
                      <SelectItem key={s.name} value={s.name}>
                        {signalSelectLabel(s)}
                      </SelectItem>
                    ))}
                  </FieldSelect>
                  {messages.find((m) => m.id === editing.messageId)?.array_index_signal ? (
                    <>
                      {(editing.viewType === 'min' || editing.viewType === 'max') && (
                        <>
                          <FieldSelect
                            label="Array: min/max scope"
                            value={editing.arrayMode || 'single_index'}
                            onValueChange={(x) => setEditing((e) => ({ ...e, arrayMode: x }))}
                          >
                            <SelectItem value="all_indices">All indexes (report index of extremum)</SelectItem>
                            <SelectItem value="single_index">Single index only</SelectItem>
                          </FieldSelect>
                          {editing.arrayMode === 'single_index' && (
                            <FieldNumber
                              label="Array index"
                              min={0}
                              value={editing.arrayIndex}
                              onChange={(x) => setEditing((e) => ({ ...e, arrayIndex: x ?? 0 }))}
                            />
                          )}
                        </>
                      )}
                      {(editing.viewType === 'graph' || editing.viewType === 'readout') && (
                        <FieldNumber
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
              <DialogFooter className="mt-4">
                <Button variant="outline" onClick={() => { close(); setEditing(null); }}>
                  Cancel
                </Button>
                <Button onClick={saveEditor}>Save</Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
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

  const title =
    view.viewType === 'readout' ? 'Readout' : view.viewType.toUpperCase() + ' · ' + view.signalName;
  const subtitle = `${view.vehicle} / ${view.dbcFilename} / ${view.messageName || view.messageId}`;

  return (
    <AnalyticsViewCardShell
      title={title}
      subtitle={subtitle}
      viewCount={viewCount}
      viewIndex={viewIndex}
      onMoveUp={onMoveUp}
      onMoveDown={onMoveDown}
      onEdit={onEdit}
      onDelete={onDelete}
      error={err}
    >
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
      {view.viewType === 'graph' && (
        <div className="mt-2 overflow-x-auto">
          <SimpleLineChart points={series} width={640} height={220} stroke="var(--chart-2)" />
        </div>
      )}
    </AnalyticsViewCardShell>
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
  const subtitle = `${view.vehicle} / ${view.dbcFilename}${idsLabel ? ` · ${idsLabel}` : ''}`;

  return (
    <AnalyticsViewCardShell
      title={title}
      subtitle={subtitle}
      viewCount={viewCount}
      viewIndex={viewIndex}
      onMoveUp={onMoveUp}
      onMoveDown={onMoveDown}
      onEdit={onEdit}
      onDelete={onDelete}
      error={err}
    >
      {!blocks.length ? (
        <p className="text-xs text-muted-foreground">
          Open edit and save once to attach DBC field lists (or re-import validated JSON).
        </p>
      ) : (
        <>
          {pivotTruncated && (
            <p className="mb-2 text-xs text-muted-foreground">
              Buffer window truncated rows (per message); increase ring buffer or narrow time if needed.
            </p>
          )}
          <ScrollArea className="h-[360px]">
            <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="whitespace-nowrap">Time</TableHead>
                  <TableHead className="whitespace-nowrap">{frameSig}</TableHead>
                  {blocks.map((b) => (
                    <TableHead key={b.messageId} className="min-w-[140px]">
                      <span className="line-clamp-2 text-xs font-semibold">
                        {b.messageName || 'Message'}
                      </span>
                      <span className="text-[10px] text-muted-foreground">{canIdHex(b.messageId)}</span>
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {mergedRows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={2 + blocks.length}>
                      <span className="text-xs text-muted-foreground">
                        No aligned rows yet (need matching {frameSig} across messages in the buffer).
                      </span>
                    </TableCell>
                  </TableRow>
                ) : (
                  mergedRows.map((row, i) => (
                    <TableRow key={i}>
                      <TableCell className="tabular whitespace-nowrap">
                        {String(row.t ?? '').slice(0, 28)}
                      </TableCell>
                      <TableCell className="tabular">
                        {row.frameId != null && Number.isFinite(Number(row.frameId))
                          ? formatValueCompact(Number(row.frameId))
                          : '—'}
                      </TableCell>
                      {row.byMessage?.map((bm, j) => (
                        <TableCell
                          key={j}
                          className="max-w-[320px] text-[11px] leading-snug whitespace-normal"
                        >
                          {formatPivotRowSignalsCell(bm.row, frameSig)}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
            </div>
          </ScrollArea>
        </>
      )}
    </AnalyticsViewCardShell>
  );
}
