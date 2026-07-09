import React, { useState, useEffect, useCallback, useMemo, useRef, useDeferredValue } from 'react';
import { Search, RotateCcw, Pause, Play } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { socket } from '../socket';

const UI_FLUSH_INTERVAL_MS = 80;
const LS_CAN_KEYS = 'viewer_signal_dashboard_v1_can_keys';
const LS_ECUS = 'viewer_signal_dashboard_v1_ecus';
const LS_SEARCH = 'viewer_signal_dashboard_v1_search';

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

  const valueTone = paused ? 'text-foreground' : 'text-signal-green';

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col bg-background p-6">
      <div className="mb-4 flex items-center gap-2">
        <h2 className="font-display text-sm font-semibold text-foreground">Signal Dashboard</h2>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              className={cn(paused && 'text-signal-amber hover:text-signal-amber')}
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
              {paused ? <Play className="size-3.5" /> : <Pause className="size-3.5" />}
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-xs">
            {paused ? 'Resume live updates' : 'Pause live updates'}
          </TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => {
                pendingBatchesRef.current = [];
                setCache({});
                socket.emit('reset_cache');
              }}
            >
              <RotateCcw className="size-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-xs">
            Reset dashboard
          </TooltipContent>
        </Tooltip>
      </div>

      {cacheKeys.length === 0 && (
        <p className="mt-8 text-center text-sm text-muted-foreground">
          No messages received yet. Start the telemetry service to see signals.
        </p>
      )}

      {cacheKeys.length > 0 && (
        <div className="flex min-h-0 flex-1 gap-4">
          <aside className="flex w-[300px] min-w-[300px] flex-col overflow-hidden rounded-lg border border-border bg-card">
            <div className="border-b border-border p-2">
              <div className="relative">
                <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Filter by ECU, vehicle, ID, or name..."
                  className="h-7 pl-8 text-xs"
                  value={search}
                  onChange={(e) => setSearch(e.currentTarget.value)}
                />
              </div>
            </div>
            <ScrollArea className="min-h-0 flex-1">
              <div className="p-2">
                <div className="mb-1.5 flex items-center justify-between">
                  <span className="text-xs font-semibold text-muted-foreground">CAN IDs</span>
                  <div className="flex gap-0.5">
                    <Button
                      variant="ghost"
                      size="xs"
                      className="h-6 text-signal-blue hover:text-signal-blue"
                      onClick={() => setSelectedIdKeys(idOptions.map((o) => o.key))}
                    >
                      Select all
                    </Button>
                    <Button
                      variant="ghost"
                      size="xs"
                      className="h-6 text-muted-foreground"
                      onClick={() => setSelectedIdKeys([])}
                    >
                      Deselect all
                    </Button>
                  </div>
                </div>
                <div className="mb-2 flex flex-col gap-1">
                  {idOptions.map((o) => {
                    const inputId = `can-id-${o.key}`;
                    return (
                      <div key={o.key} className="flex items-start gap-2">
                        <Checkbox
                          id={inputId}
                          className="mt-0.5"
                          checked={selectedIdsSet.has(o.key)}
                          onCheckedChange={(checked) => {
                            const on = checked === true;
                            setSelectedIdKeys((prev) => {
                              const base = prev === undefined ? idOptions.map((x) => x.key) : [...prev];
                              if (on) {
                                return base.includes(o.key) ? base : [...base, o.key];
                              }
                              return base.filter((k) => k !== o.key);
                            });
                          }}
                        />
                        <Label htmlFor={inputId} className="cursor-pointer text-xs leading-snug font-normal text-foreground">
                          <span className="tabular">{o.canId}</span>{' '}
                          <span className="text-muted-foreground">({o.ecu})</span>
                        </Label>
                      </div>
                    );
                  })}
                </div>

                <Separator className="my-2" />

                <div className="mb-1.5 flex items-center justify-between">
                  <span className="text-xs font-semibold text-muted-foreground">ECUs</span>
                  <div className="flex gap-0.5">
                    <Button
                      variant="ghost"
                      size="xs"
                      className="h-6 text-signal-blue hover:text-signal-blue"
                      onClick={() => setSelectedEcus(ecuOptions)}
                    >
                      Select all
                    </Button>
                    <Button
                      variant="ghost"
                      size="xs"
                      className="h-6 text-muted-foreground"
                      onClick={() => setSelectedEcus([])}
                    >
                      Deselect all
                    </Button>
                  </div>
                </div>
                <div className="flex flex-col gap-1">
                  {ecuOptions.map((ecu) => {
                    const inputId = `ecu-${ecu}`;
                    return (
                      <div key={ecu} className="flex items-center gap-2">
                        <Checkbox
                          id={inputId}
                          checked={selectedEcusSet.has(ecu)}
                          onCheckedChange={(checked) => {
                            const on = checked === true;
                            setSelectedEcus((prev) => {
                              const base = prev === undefined ? [...ecuOptions] : [...prev];
                              if (on) {
                                return base.includes(ecu) ? base : [...base, ecu];
                              }
                              return base.filter((x) => x !== ecu);
                            });
                          }}
                        />
                        <Label htmlFor={inputId} className="cursor-pointer text-xs font-normal text-foreground">
                          {ecu}
                        </Label>
                      </div>
                    );
                  })}
                </div>
              </div>
            </ScrollArea>
          </aside>

          <div className="min-w-0 flex-1 overflow-y-auto">
            <div className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(360px,1fr))]">
              {visibleCacheKeys.map((cacheKey) => {
                const group = visibleByCacheKey[cacheKey];
                const { vehicle, sender, items } = group;
                return (
                  <div
                    key={cacheKey}
                    className="min-w-[360px] rounded-lg border border-border bg-card p-4"
                  >
                    <div className="mb-2 flex items-center gap-1.5">
                      <span className="text-sm font-semibold text-foreground">{sender}</span>
                      {vehicle && (
                        <span className="text-xs text-muted-foreground opacity-50">· {vehicle}</span>
                      )}
                    </div>
                    <div className="flex flex-col gap-1.5">
                      {items.map(({ canId, msg }) => {
                        const hasSignals = msg.signals && Object.keys(msg.signals).length > 0;
                        const notFound = msg.message_name == null;

                        return (
                          <div
                            key={canId}
                            className="rounded-md border border-border bg-muted/50 px-2 py-1.5"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span
                                className={cn(
                                  'text-sm tabular',
                                  notFound ? 'text-signal-red' : 'text-foreground'
                                )}
                              >
                                {canId}
                                {notFound ? ' · Not Found' : ` · ${msg.message_name}`}
                              </span>
                              <span className="shrink-0 text-xs text-muted-foreground">{msg.network}</span>
                            </div>
                            <div className="mt-1 flex flex-col gap-1 border-l-2 border-border pl-2">
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
                                      <span className="text-xs font-medium text-muted-foreground">
                                        {name}{unit ? ` (${unit})` : ''}:
                                      </span>
                                      <div className="mt-0.5 flex flex-wrap gap-x-2 gap-y-0.5 pl-2">
                                        {indices.map((idx) => {
                                          const v = value[idx];
                                          if (v === null || v === undefined) return null;
                                          return (
                                            <span key={idx} className="text-xs text-muted-foreground">
                                              <span className="tabular text-muted-foreground/70">[{idx}]</span>{' '}
                                              <span className={cn('tabular', valueTone)}>{formatValue3(v)}</span>
                                            </span>
                                          );
                                        })}
                                      </div>
                                    </div>
                                  );
                                }
                                return (
                                  <p key={name} className="text-xs text-muted-foreground">
                                    {name}:{' '}
                                    <span className={cn('tabular', valueTone)}>
                                      {formatValue3(value)}
                                    </span>
                                    {unitStr && (
                                      <span className="text-muted-foreground">{unitStr}</span>
                                    )}
                                  </p>
                                );
                              })}
                              {msg.raw_packet && (
                                <p className="tabular text-xs text-muted-foreground/60">
                                  {msg.raw_packet}
                                </p>
                              )}
                              {msg.timestamp_ns > 0 && (
                                <p className="text-xs text-muted-foreground/50">
                                  Last update:{' '}
                                  <span className="tabular">{formatTime(msg.timestamp_ns)}</span>
                                </p>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
            {visibleCacheKeys.length === 0 && (
              <p className="mt-8 text-center text-sm text-muted-foreground">
                No signals match current filters.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
