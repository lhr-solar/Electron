import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Download, Plus, Trash2, Loader2, CircleAlert } from 'lucide-react';
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
import { apiJson, buildApiUrl } from '../lib/api';

export function DatabaseManagementModal({
  opened,
  onClose,
  influxConnected = false,
  telemetryBucket,
  onBucketChange,
  vehicle,
  dbcFiles = [],
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

  const load = useCallback(() => {
    if (!influxConnected) {
      setBuckets([]);
      setEvents([]);
      setEventMeta({ local_count: 0, influx_count: 0 });
      setLoading(false);
      return;
    }
    setLoading(true);
    Promise.all([
      apiJson('/api/influx/buckets'),
      apiJson('/api/events'),
    ])
      .then(([bucketList, eventData]) => {
        setBuckets(Array.isArray(bucketList) ? bucketList : []);
        setEvents(eventData?.events || []);
        setEventMeta({
          local_count: eventData?.local_count ?? 0,
          influx_count: eventData?.influx_count ?? 0,
        });
      })
      .catch((e) => notifications.show({ title: 'Database', message: e.message, color: 'red' }))
      .finally(() => setLoading(false));
  }, [influxConnected]);

  useEffect(() => {
    if (opened) load();
  }, [opened, load]);

  useEffect(() => {
    if (!opened) {
      setSelectedEventIds([]);
      setRangeStart('');
      setRangeEnd('');
    }
  }, [opened]);

  const telemetryBuckets = buckets.filter((b) => !b.is_event);
  const eventBuckets = buckets.filter((b) => b.is_event);
  const bucketOptions = telemetryBuckets.map((b) => ({ value: b.name, label: b.name }));

  const allEventIds = useMemo(() => events.map((e) => e.id), [events]);
  const allSelected = events.length > 0 && selectedEventIds.length === events.length;
  const canExport = selectedEventIds.length > 0 || rangeStart.trim() || rangeEnd.trim();

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
      const res = await fetch(buildApiUrl('/api/events/decode-csv'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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

  return (
    <Dialog open={opened} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-h-[85vh] overflow-y-auto bg-popover sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="font-display">Database management</DialogTitle>
        </DialogHeader>

        {!influxConnected && (
          <Alert variant="destructive" className="border-signal-red/30 bg-signal-red/5">
            <CircleAlert />
            <AlertTitle>InfluxDB not connected</AlertTitle>
            <AlertDescription>
              Connect InfluxDB to manage buckets and pull recent event metadata.
            </AlertDescription>
          </Alert>
        )}

        <Tabs defaultValue="telemetry">
          <TabsList>
            <TabsTrigger value="telemetry">Telemetry buckets</TabsTrigger>
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
                    disabled={!influxConnected}
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
                    disabled={!influxConnected}
                    className="h-8 text-sm tabular"
                  />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Select events and/or a time range. Output is clipped to actual data timestamps (no empty padding).
              </p>
              <Button
                onClick={downloadDecodedCsv}
                disabled={!canExport || loading || !influxConnected || exporting}
              >
                {exporting ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Download className="size-3.5" />
                )}
                Generate and download CSV
              </Button>
              <div className="rounded-md border border-border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-9">
                        <Checkbox
                          checked={allSelected ? true : selectedEventIds.length > 0 && !allSelected ? 'indeterminate' : false}
                          onCheckedChange={toggleAllEvents}
                          aria-label="Select all events"
                          disabled={!influxConnected}
                        />
                      </TableHead>
                      <TableHead>Run</TableHead>
                      <TableHead>Start</TableHead>
                      <TableHead>End</TableHead>
                      <TableHead>Capture</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {events.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={5}>
                          <p className="text-sm text-muted-foreground">
                            {influxConnected ? 'No recorded events yet.' : 'InfluxDB required to load events.'}
                          </p>
                        </TableCell>
                      </TableRow>
                    )}
                    {events.map((evt) => (
                      <TableRow key={evt.id}>
                        <TableCell>
                          <Checkbox
                            checked={selectedEventIds.includes(evt.id)}
                            onCheckedChange={() => toggleEvent(evt.id)}
                            aria-label={`Select ${evt.display_name}`}
                            disabled={!influxConnected || evt.source === 'influx'}
                          />
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="text-sm font-medium">{evt.display_name}</span>
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
                          <p className="tabular text-xs text-muted-foreground">{evt.bucket_name}</p>
                        </TableCell>
                        <TableCell className="tabular text-xs">{evt.start_time_iso}</TableCell>
                        <TableCell className="tabular text-xs">{evt.end_time_iso || '—'}</TableCell>
                        <TableCell className="tabular text-xs">{evt.dump_file || '—'}</TableCell>
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
  );
}
