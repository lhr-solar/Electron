import React, { useCallback, useEffect, useMemo, useState } from 'react';
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
  const [rangeStart, setRangeStart] = useState('');
  const [rangeEnd, setRangeEnd] = useState('');
  const [exporting, setExporting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [renameTarget, setRenameTarget] = useState(null);
  const [renameValue, setRenameValue] = useState('');
  const [renaming, setRenaming] = useState(false);

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
      setRangeStart('');
      setRangeEnd('');
      setConfirmDeleteOpen(false);
      setRenameTarget(null);
      setRenameValue('');
    }
  }, [opened]);

  const telemetryBuckets = buckets.filter((b) => !b.is_event && !b.protected);
  const protectedBuckets = buckets.filter((b) => b.protected);
  const eventBuckets = buckets.filter((b) => b.is_event);
  // System buckets (e.g. time_markers) are never valid telemetry write targets.
  const bucketOptions = telemetryBuckets.map((b) => ({ value: b.name, label: b.name }));

  const selectableEvents = useMemo(
    () => events.filter((e) => e.source !== 'influx' && !e.in_progress),
    [events]
  );
  const allEventIds = useMemo(() => selectableEvents.map((e) => e.id), [selectableEvents]);
  const allSelected = selectableEvents.length > 0 && selectedEventIds.length === selectableEvents.length;
  const canExport = selectedEventIds.length > 0 || rangeStart.trim() || rangeEnd.trim();
  const canDelete = canDeleteRuns && selectedEventIds.length > 0;
  const eventKey = (evt) => evt.uuid || evt.id;
  const canRenameEvent = (evt) => evt.source !== 'influx';

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
          start_iso: rangeStart.trim() || null,
          end_iso: rangeEnd.trim() || null,
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
    setRenameValue(evt.display_name || '');
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
      <DialogContent className="max-h-[85vh] overflow-y-auto bg-popover sm:max-w-2xl">
        <DialogHeader>
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
          <Alert variant="destructive" className="border-signal-red/30 bg-signal-red/5">
            <CircleAlert />
            <AlertTitle>InfluxDB not connected</AlertTitle>
            <AlertDescription>
              Connect InfluxDB to manage buckets and pull recent event metadata.
            </AlertDescription>
          </Alert>
        )}

        <Tabs defaultValue={eventsOnly ? 'events' : 'telemetry'}>
          <TabsList>
            {!eventsOnly && <TabsTrigger value="telemetry">Telemetry buckets</TabsTrigger>}
            <TabsTrigger value="events">Events</TabsTrigger>
          </TabsList>

          <TabsContent value="telemetry" className="pt-4">
            <div className="flex flex-col gap-2">
              <p className="text-sm text-muted-foreground">
                Telemetry data is written when Write on is enabled. Event metadata buckets are not allowed for telemetry.
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
                          {b.name.startsWith('debug') && (
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

          <TabsContent value="events" className="pt-4">
            <div className="flex flex-col gap-2">
              <p className="text-sm text-muted-foreground">
                Events merge local captures with recent metadata from Influx ({eventMeta.local_count} local, {eventMeta.influx_count} from Influx).
                CSV export uses local capture files when available.
              </p>
              <div className="flex gap-2">
                <div className="flex flex-1 flex-col gap-1.5">
                  <Label htmlFor="range-start" className="text-xs">Range start (ISO)</Label>
                  <Input
                    id="range-start"
                    placeholder="2026-07-08T16:00:00.000-07:00"
                    value={rangeStart}
                    onChange={(e) => setRangeStart(e.currentTarget.value)}
                    className="h-8 text-sm tabular"
                  />
                </div>
                <div className="flex flex-1 flex-col gap-1.5">
                  <Label htmlFor="range-end" className="text-xs">Range end (ISO)</Label>
                  <Input
                    id="range-end"
                    placeholder="2026-07-08T16:30:00.000-07:00"
                    value={rangeEnd}
                    onChange={(e) => setRangeEnd(e.currentTarget.value)}
                    className="h-8 text-sm tabular"
                  />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Select runs and/or a time range. Output is clipped to actual data timestamps (no empty padding).
              </p>
              <div className="flex flex-wrap items-center gap-2">
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
                {selectedEventIds.length > 0 && (
                  <span className="text-xs text-muted-foreground">
                    {selectedEventIds.length} selected
                    {canDeleteRuns ? ' — use Delete (top right)' : ''}
                  </span>
                )}
              </div>
              <div className="rounded-md border border-border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-9">
                        <Checkbox
                          checked={allSelected ? true : selectedEventIds.length > 0 && !allSelected ? 'indeterminate' : false}
                          onCheckedChange={toggleAllEvents}
                          aria-label="Select all events"
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
                    {events.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={6}>
                          <p className="text-sm text-muted-foreground">
                            No recorded events yet.
                          </p>
                        </TableCell>
                      </TableRow>
                    )}
                    {events.map((evt) => (
                      <TableRow key={evt.uuid || evt.id} className={evt.in_progress ? 'bg-signal-green/5' : undefined}>
                        <TableCell>
                          <Checkbox
                            checked={selectedEventIds.includes(evt.id)}
                            onCheckedChange={() => toggleEvent(evt.id)}
                            aria-label={`Select ${evt.display_name}`}
                            disabled={evt.source === 'influx' || evt.in_progress}
                          />
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="text-sm font-medium">{evt.display_name}</span>
                            {evt.in_progress && (
                              <Badge
                                variant="outline"
                                className="gap-1 border-signal-green/40 bg-signal-green/10 text-signal-green"
                              >
                                <Radio className="size-3 animate-pulse" />
                                in progress
                              </Badge>
                            )}
                            {evt.source === 'influx' && (
                              <Badge
                                variant="outline"
                                className="border-signal-purple/30 bg-signal-purple/10 text-signal-purple"
                              >
                                influx
                              </Badge>
                            )}
                            {evt.influx_synced && (
                              <Badge
                                variant="outline"
                                className="border-signal-green/30 bg-signal-green/10 text-signal-green"
                              >
                                synced
                              </Badge>
                            )}
                          </div>
                          <p className="tabular text-xs text-muted-foreground">
                            {evt.uuid || evt.id || evt.bucket_name}
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
                        <TableCell className="tabular text-xs">{evt.dump_file || '—'}</TableCell>
                        <TableCell>
                          {canRenameEvent(evt) && (
                            <Button
                              variant="ghost"
                              size="xs"
                              onClick={() => openRename(evt)}
                              aria-label={`Rename ${evt.display_name}`}
                              title="Rename run"
                              className="text-muted-foreground hover:text-foreground"
                            >
                              <Pencil className="size-3" />
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              {eventBuckets.length > 0 && (
                <div>
                  <p className="mb-1 text-xs text-muted-foreground">Influx event metadata buckets</p>
                  <div className="flex flex-wrap gap-1">
                    {eventBuckets.map((b) => (
                      <Badge
                        key={b.name}
                        variant="outline"
                        className="border-signal-purple/30 bg-signal-purple/10 text-signal-purple"
                      >
                        {b.name}
                      </Badge>
                    ))}
                  </div>
                </div>
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
