import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Download, Plus, Trash2, Loader2, CircleAlert, Pencil, Radio } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { notifications } from '@/lib/notify';
import { apiJson, buildApiUrl, getManageToken } from '../lib/api';

const PAGE_SIZE = 40;

function eventDayMs(iso) {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : null;
}

function dayStartMs(yyyyMmDd) {
  if (!yyyyMmDd) return null;
  const t = Date.parse(`${yyyyMmDd}T00:00:00`);
  return Number.isFinite(t) ? t : null;
}

function dayEndMs(yyyyMmDd) {
  if (!yyyyMmDd) return null;
  const t = Date.parse(`${yyyyMmDd}T23:59:59.999`);
  return Number.isFinite(t) ? t : null;
}

function eventLabel(evt) {
  return (evt?.name || '').trim() || evt?.display_name || 'Untitled run';
}

export function DatabaseManagementModal({
  opened,
  onClose,
  influxConnected = false,
  telemetryBucket,
  onBucketChange,
  vehicle,
  dbcFiles = [],
  canDeleteRuns = true,
  eventsOnly = false,
}) {
  const [buckets, setBuckets] = useState([]);
  const [events, setEvents] = useState([]);
  const [eventMeta, setEventMeta] = useState({ local_count: 0, influx_count: 0 });
  const [newBucket, setNewBucket] = useState('');
  const [loading, setLoading] = useState(false);
  const [selectedEventIds, setSelectedEventIds] = useState([]);
  const [nameQuery, setNameQuery] = useState('');
  const [filterDateStart, setFilterDateStart] = useState('');
  const [filterDateEnd, setFilterDateEnd] = useState('');
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [exporting, setExporting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [renameTarget, setRenameTarget] = useState(null);
  const [renameValue, setRenameValue] = useState('');
  const [renaming, setRenaming] = useState(false);
  const listRef = useRef(null);

  const load = useCallback(() => {
    setLoading(true);
    const tasks = [apiJson('/api/events')];
    if (!eventsOnly) {
      tasks.unshift(
        influxConnected
          ? apiJson('/api/influx/buckets')
          : Promise.resolve([])
      );
    }
    Promise.all(tasks)
      .then((results) => {
        const eventData = eventsOnly ? results[0] : results[1];
        const bucketList = eventsOnly ? [] : results[0];
        setBuckets(Array.isArray(bucketList) ? bucketList : []);
        setEvents(eventData?.events || []);
        setEventMeta({
          local_count: eventData?.local_count ?? 0,
          influx_count: eventData?.influx_count ?? 0,
        });
        setVisibleCount(PAGE_SIZE);
      })
      .catch((e) => notifications.show({ title: 'Database', message: e.message, color: 'red' }))
      .finally(() => setLoading(false));
  }, [influxConnected, eventsOnly]);

  useEffect(() => {
    if (opened) load();
  }, [opened, load]);

  useEffect(() => {
    if (!opened) {
      setSelectedEventIds([]);
      setNameQuery('');
      setFilterDateStart('');
      setFilterDateEnd('');
      setVisibleCount(PAGE_SIZE);
      setConfirmDeleteOpen(false);
      setRenameTarget(null);
      setRenameValue('');
    }
  }, [opened]);

  // System buckets (debug, time_markers) are never selectable write targets.
  // canp always writes telemetry_main; other adapters always write debug.
  const telemetryBuckets = buckets.filter((b) => !b.is_event && !b.protected);
  const protectedBuckets = buckets.filter((b) => b.protected);
  const bucketOptions = [{ value: 'telemetry_main', label: 'telemetry_main' }];

  const eventKey = (evt) => evt.uuid || evt.id;

  const filteredEvents = useMemo(() => {
    const q = nameQuery.trim().toLowerCase();
    const startBound = dayStartMs(filterDateStart);
    const endBound = dayEndMs(filterDateEnd);
    return events.filter((e) => {
      if (q) {
        const hay = `${eventLabel(e)} ${e.dump_file || ''} ${e.uuid || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (startBound != null || endBound != null) {
        const t = eventDayMs(e.start_time_iso);
        if (t == null) return false;
        if (startBound != null && t < startBound) return false;
        if (endBound != null && t > endBound) return false;
      }
      return true;
    });
  }, [events, nameQuery, filterDateStart, filterDateEnd]);

  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
    if (listRef.current) listRef.current.scrollTop = 0;
  }, [nameQuery, filterDateStart, filterDateEnd]);

  const visibleEvents = useMemo(
    () => filteredEvents.slice(0, visibleCount),
    [filteredEvents, visibleCount]
  );
  const hasMore = visibleCount < filteredEvents.length;

  const onListScroll = (e) => {
    const el = e.currentTarget;
    if (!hasMore) return;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 80) {
      setVisibleCount((n) => Math.min(n + PAGE_SIZE, filteredEvents.length));
    }
  };

  const selectableEvents = useMemo(
    () => filteredEvents.filter((e) => !e.in_progress),
    [filteredEvents]
  );
  const allEventIds = useMemo(() => selectableEvents.map((e) => eventKey(e)), [selectableEvents]);
  const allSelected = selectableEvents.length > 0 && selectedEventIds.length === selectableEvents.length;
  const exportStartIso = filterDateStart ? `${filterDateStart}T00:00:00` : null;
  const exportEndIso = filterDateEnd ? `${filterDateEnd}T23:59:59.999` : null;
  const canExport = selectedEventIds.length > 0 || !!exportStartIso || !!exportEndIso;
  const canDelete = canDeleteRuns && selectedEventIds.length > 0;

  const toggleEvent = (id) => {
    setSelectedEventIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const toggleAllEvents = () => {
    setSelectedEventIds(allSelected ? [] : allEventIds);
  };

  const createBucket = () => {
    const name = newBucket.trim();
    if (!name) return;
    apiJson('/api/influx/buckets', { method: 'POST', body: JSON.stringify({ name }) })
      .then(() => {
        notifications.show({ title: 'Bucket', message: `Created ${name}`, color: 'green' });
        setNewBucket('');
        load();
      })
      .catch((e) => notifications.show({ title: 'Create failed', message: e.message, color: 'red' }));
  };

  const deleteBucket = (name) => {
    apiJson(`/api/influx/buckets/${encodeURIComponent(name)}`, { method: 'DELETE' })
      .then(() => {
        notifications.show({ title: 'Bucket', message: `Deleted ${name}`, color: 'green' });
        load();
      })
      .catch((e) => notifications.show({ title: 'Delete failed', message: e.message, color: 'red' }));
  };

  const downloadDecodedCsv = async () => {
    if (!canExport) return;
    setExporting(true);
    try {
      const headers = { 'Content-Type': 'application/json' };
      const token = getManageToken();
      if (token) headers['X-Manage-Token'] = token;
      const res = await fetch(buildApiUrl('/api/events/decode-csv'), {
        method: 'POST',
        credentials: 'include',
        headers,
        body: JSON.stringify({
          event_ids: selectedEventIds.length ? selectedEventIds : null,
          start_iso: selectedEventIds.length ? null : exportStartIso,
          end_iso: selectedEventIds.length ? null : exportEndIso,
          vehicle: vehicle || null,
          dbc_files: Array.isArray(dbcFiles) ? dbcFiles : [],
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || res.statusText);
      }
      const blob = await res.blob();
      const disposition = res.headers.get('Content-Disposition') || '';
      const match = disposition.match(/filename="?([^"]+)"?/);
      const filename = match?.[1] || 'decoded-clean.zip';
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      const rows = res.headers.get('X-Decode-Rows');
      const csvCount = res.headers.get('X-Decode-Csv-Count');
      notifications.show({
        title: 'CSV export',
        message: rows ? `${rows} rows across ${csvCount || '?'} CSV files` : 'Download started',
        color: 'green',
      });
    } catch (e) {
      notifications.show({ title: 'Export failed', message: e.message, color: 'red' });
    } finally {
      setExporting(false);
    }
  };

  const deleteSelectedRuns = async () => {
    if (!canDelete) return;
    setDeleting(true);
    try {
      const res = await apiJson('/api/events/delete', {
        method: 'POST',
        body: JSON.stringify({ event_ids: selectedEventIds }),
      });
      notifications.show({
        title: 'Runs deleted',
        message: `Removed ${res.count ?? selectedEventIds.length} run(s)`,
        color: 'green',
      });
      setSelectedEventIds([]);
      setConfirmDeleteOpen(false);
      load();
    } catch (e) {
      notifications.show({ title: 'Delete failed', message: e.message, color: 'red' });
    } finally {
      setDeleting(false);
    }
  };

  const openRename = (evt) => {
    setRenameTarget(evt);
    setRenameValue(eventLabel(evt));
  };

  const submitRename = async () => {
    const name = renameValue.trim();
    if (!name || !renameTarget) return;
    setRenaming(true);
    try {
      await apiJson('/api/events/rename', {
        method: 'POST',
        body: JSON.stringify({ event_id: eventKey(renameTarget), name }),
      });
      notifications.show({ title: 'Run renamed', message: name, color: 'green' });
      setRenameTarget(null);
      setRenameValue('');
      load();
    } catch (e) {
      notifications.show({ title: 'Rename failed', message: e.message, color: 'red' });
    } finally {
      setRenaming(false);
    }
  };

  return (
    <>
    <Dialog open={opened} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="flex h-[90vh] max-h-[90vh] w-[95vw] flex-col overflow-hidden bg-popover sm:max-w-6xl">
        <DialogHeader className="shrink-0">
          <div className="flex items-center justify-between gap-2 pr-8">
            <DialogTitle className="font-display">Database management</DialogTitle>
            {canDeleteRuns && selectedEventIds.length > 0 && (
              <Button
                variant="destructive"
                size="sm"
                onClick={() => setConfirmDeleteOpen(true)}
                disabled={deleting}
                className="shrink-0"
              >
                {deleting ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
                Delete {selectedEventIds.length}
              </Button>
            )}
          </div>
        </DialogHeader>

        {!influxConnected && !eventsOnly && (
          <Alert variant="destructive" className="shrink-0 border-signal-red/30 bg-signal-red/5">
            <CircleAlert />
            <AlertTitle>InfluxDB not connected</AlertTitle>
            <AlertDescription>
              Connect InfluxDB to manage buckets. CANP runs still work from the local manifest.
            </AlertDescription>
          </Alert>
        )}

        <Tabs defaultValue={eventsOnly ? 'events' : 'telemetry'} className="flex min-h-0 flex-1 flex-col">
          <TabsList className="shrink-0">
            {!eventsOnly && <TabsTrigger value="telemetry">Telemetry buckets</TabsTrigger>}
            <TabsTrigger value="events">Events</TabsTrigger>
          </TabsList>

          <TabsContent value="telemetry" className="min-h-0 flex-1 overflow-y-auto pt-4">
            <div className="flex flex-col gap-2">
              <p className="text-sm text-muted-foreground">
                Telemetry data is written when Write on is enabled. canp → telemetry_main; other adapters → debug.
              </p>
              <div className="flex flex-col gap-1.5">
                <Label className="text-xs">Active telemetry bucket</Label>
                <Select
                  value={telemetryBucket || undefined}
                  onValueChange={(v) => onBucketChange?.(v || '')}
                  disabled={loading || !influxConnected}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select bucket" />
                  </SelectTrigger>
                  <SelectContent>
                    {(bucketOptions.length ? bucketOptions : [{ value: telemetryBucket || 'debug', label: telemetryBucket || 'debug' }]).map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-end gap-2">
                <div className="flex flex-1 flex-col gap-1.5">
                  <Label htmlFor="new-bucket" className="text-xs">New bucket</Label>
                  <Input
                    id="new-bucket"
                    placeholder="my_telemetry_bucket"
                    value={newBucket}
                    onChange={(e) => setNewBucket(e.currentTarget.value)}
                    disabled={!influxConnected}
                    className="h-8 text-sm"
                  />
                </div>
                <Button
                  onClick={createBucket}
                  disabled={!newBucket.trim() || !influxConnected}
                  className="shrink-0"
                >
                  <Plus className="size-3.5" />
                  Add
                </Button>
              </div>
              <div className="rounded-md border border-border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead className="w-[100px]" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {protectedBuckets.map((b) => (
                      <TableRow key={b.name}>
                        <TableCell className="tabular text-sm">{b.name}</TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className="border-signal-purple/30 bg-signal-purple/10 text-signal-purple"
                          >
                            system
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">Protected</TableCell>
                      </TableRow>
                    ))}
                    {telemetryBuckets.map((b) => (
                      <TableRow key={b.name}>
                        <TableCell className="tabular text-sm">{b.name}</TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className="border-signal-blue/30 bg-signal-blue/10 text-signal-blue"
                          >
                            telemetry
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {b.name.startsWith('debug') && b.name !== 'debug' && (
                            <Button
                              variant="ghost"
                              size="xs"
                              onClick={() => deleteBucket(b.name)}
                              disabled={!influxConnected}
                              className="text-signal-red hover:text-signal-red"
                            >
                              <Trash2 className="size-3" />
                              Delete
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="events" className="flex min-h-0 flex-1 flex-col gap-2 pt-4 data-[state=inactive]:hidden">
            <p className="shrink-0 text-sm text-muted-foreground">
              CANP runs from logs/canp/canp_manifest.json ({eventMeta.local_count}).
              Default names: Run 1, Run 2, … resetting each day.
            </p>
            <div className="flex shrink-0 flex-wrap items-end gap-2">
              <div className="flex min-w-[180px] flex-1 flex-col gap-1.5">
                <Label htmlFor="run-search" className="text-xs">Search name</Label>
                <Input
                  id="run-search"
                  value={nameQuery}
                  onChange={(e) => setNameQuery(e.currentTarget.value)}
                  placeholder="Filter by name…"
                  className="h-8 text-sm"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="filter-start" className="text-xs">From date</Label>
                <Input
                  id="filter-start"
                  type="date"
                  value={filterDateStart}
                  onChange={(e) => setFilterDateStart(e.currentTarget.value)}
                  className="h-8 w-[150px] text-sm tabular"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="filter-end" className="text-xs">To date</Label>
                <Input
                  id="filter-end"
                  type="date"
                  value={filterDateEnd}
                  onChange={(e) => setFilterDateEnd(e.currentTarget.value)}
                  className="h-8 w-[150px] text-sm tabular"
                />
              </div>
              {(nameQuery || filterDateStart || filterDateEnd) && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8"
                  onClick={() => {
                    setNameQuery('');
                    setFilterDateStart('');
                    setFilterDateEnd('');
                  }}
                >
                  Clear
                </Button>
              )}
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              <Button
                onClick={downloadDecodedCsv}
                disabled={!canExport || loading || exporting}
              >
                {exporting ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Download className="size-3.5" />
                )}
                Generate and download CSV
              </Button>
              <span className="text-xs text-muted-foreground">
                {filteredEvents.length} match{filteredEvents.length === 1 ? '' : 'es'}
                {selectedEventIds.length > 0
                  ? ` · ${selectedEventIds.length} selected${canDeleteRuns ? ' — Delete (top right)' : ''}`
                  : ' · select runs and/or set a date filter to export'}
              </span>
            </div>
            <div
              ref={listRef}
              onScroll={onListScroll}
              className="min-h-0 flex-1 overflow-auto rounded-md border border-border"
            >
              <Table>
                <TableHeader className="sticky top-0 z-10 bg-popover">
                  <TableRow>
                    <TableHead className="w-9">
                      <Checkbox
                        checked={allSelected ? true : selectedEventIds.length > 0 && !allSelected ? 'indeterminate' : false}
                        onCheckedChange={toggleAllEvents}
                        aria-label="Select all filtered events"
                        disabled={selectableEvents.length === 0}
                      />
                    </TableHead>
                    <TableHead>Run</TableHead>
                    <TableHead>Start</TableHead>
                    <TableHead>End</TableHead>
                    <TableHead>Capture</TableHead>
                    <TableHead className="w-9" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredEvents.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6}>
                        <p className="text-sm text-muted-foreground">
                          {loading
                            ? 'Loading…'
                            : events.length === 0
                              ? 'No recorded CANP runs yet.'
                              : 'No runs match the current filters.'}
                        </p>
                      </TableCell>
                    </TableRow>
                  )}
                  {visibleEvents.map((evt) => {
                    const key = eventKey(evt);
                    const label = eventLabel(evt);
                    return (
                      <TableRow key={key} className={evt.in_progress ? 'bg-signal-green/5' : undefined}>
                        <TableCell>
                          <Checkbox
                            checked={selectedEventIds.includes(key)}
                            onCheckedChange={() => toggleEvent(key)}
                            aria-label={`Select ${label}`}
                            disabled={evt.in_progress}
                          />
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="text-sm font-medium">{label}</span>
                            {evt.in_progress && (
                              <Badge
                                variant="outline"
                                className="gap-1 border-signal-green/40 bg-signal-green/10 text-signal-green"
                              >
                                <Radio className="size-3 animate-pulse" />
                                in progress
                              </Badge>
                            )}
                          </div>
                          <p className="tabular text-xs text-muted-foreground">
                            {evt.start_time_iso || evt.uuid || evt.id}
                          </p>
                        </TableCell>
                        <TableCell className="tabular text-xs">{evt.start_time_iso}</TableCell>
                        <TableCell className="tabular text-xs">
                          {evt.in_progress ? (
                            <span className="text-signal-green">recording…</span>
                          ) : (
                            evt.end_time_iso || '—'
                          )}
                        </TableCell>
                        <TableCell className="tabular text-xs">
                          {evt.dump_file || '—'}
                          {evt.dump_file && evt.dump_exists === false && (
                            <span className="ml-1 text-signal-amber">(missing)</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="xs"
                            onClick={() => openRename(evt)}
                            aria-label={`Rename ${label}`}
                            title="Rename run"
                            className="text-muted-foreground hover:text-foreground"
                          >
                            <Pencil className="size-3" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
              {hasMore && (
                <p className="border-t border-border py-2 text-center text-xs text-muted-foreground">
                  Scroll for more ({visibleEvents.length} / {filteredEvents.length})
                </p>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>

    <Dialog
      open={!!renameTarget}
      onOpenChange={(o) => { if (!o) { setRenameTarget(null); setRenameValue(''); } }}
    >
      <DialogContent className="bg-popover sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display">Rename run</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-2">
          <Label htmlFor="rename-input" className="text-xs">Run name</Label>
          <Input
            id="rename-input"
            value={renameValue}
            onChange={(e) => setRenameValue(e.currentTarget.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') submitRename(); }}
            placeholder="Run name"
            autoFocus
            className="h-9 text-sm"
          />
          {renameTarget?.in_progress && (
            <p className="text-xs text-signal-green">This run is currently recording.</p>
          )}
          <div className="mt-2 flex justify-end gap-2">
            <Button
              variant="ghost"
              onClick={() => { setRenameTarget(null); setRenameValue(''); }}
              disabled={renaming}
            >
              Cancel
            </Button>
            <Button onClick={submitRename} disabled={!renameValue.trim() || renaming}>
              {renaming ? <Loader2 className="size-3.5 animate-spin" /> : <Pencil className="size-3.5" />}
              Save
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>

    <Dialog open={confirmDeleteOpen} onOpenChange={(o) => { if (!o) setConfirmDeleteOpen(false); }}>
      <DialogContent className="bg-popover sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display">Delete {selectedEventIds.length} run(s)?</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <p className="text-sm text-muted-foreground">
            This permanently removes the selected run(s) and their local capture files. This cannot be undone.
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setConfirmDeleteOpen(false)} disabled={deleting}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={deleteSelectedRuns}
              disabled={deleting || selectedEventIds.length === 0}
            >
              {deleting ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
              Delete
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
    </>
  );
}
