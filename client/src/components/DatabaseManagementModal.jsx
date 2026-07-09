import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Modal, Box, Text, Stack, Group, Button, TextInput, Select, Table, Tabs, Badge, Checkbox, Alert } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { Download, Plus, Trash2 } from 'lucide-react';
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
    <Modal opened={opened} onClose={onClose} title="Database management" size="lg">
      {!influxConnected && (
        <Alert color="red" mb="md" title="InfluxDB not connected">
          Connect InfluxDB to manage buckets and pull recent event metadata.
        </Alert>
      )}
      <Tabs defaultValue="telemetry">
        <Tabs.List>
          <Tabs.Tab value="telemetry">Telemetry buckets</Tabs.Tab>
          <Tabs.Tab value="events">Events</Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="telemetry" pt="md">
          <Stack gap="sm">
            <Text size="sm" c="dimmed">
              Telemetry data is written when Write on is enabled. Event metadata buckets are not allowed for telemetry.
            </Text>
            <Select
              label="Active telemetry bucket"
              data={bucketOptions.length ? bucketOptions : [{ value: telemetryBucket || 'debug', label: telemetryBucket || 'debug' }]}
              value={telemetryBucket || null}
              onChange={(v) => onBucketChange?.(v || '')}
              disabled={loading || !influxConnected}
            />
            <Group align="flex-end">
              <TextInput
                label="New bucket"
                placeholder="my_telemetry_bucket"
                value={newBucket}
                onChange={(e) => setNewBucket(e.currentTarget.value)}
                style={{ flex: 1 }}
                disabled={!influxConnected}
              />
              <Button leftSection={<Plus size={14} />} onClick={createBucket} disabled={!newBucket.trim() || !influxConnected}>
                Add
              </Button>
            </Group>
            <Table striped highlightOnHover>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Name</Table.Th>
                  <Table.Th>Type</Table.Th>
                  <Table.Th />
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {telemetryBuckets.map((b) => (
                  <Table.Tr key={b.name}>
                    <Table.Td>{b.name}</Table.Td>
                    <Table.Td><Badge size="sm" color="blue">telemetry</Badge></Table.Td>
                    <Table.Td>
                      {b.name.startsWith('debug') && (
                        <Button variant="subtle" color="red" size="xs" leftSection={<Trash2 size={12} />} onClick={() => deleteBucket(b.name)} disabled={!influxConnected}>
                          Delete
                        </Button>
                      )}
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Stack>
        </Tabs.Panel>

        <Tabs.Panel value="events" pt="md">
          <Stack gap="sm">
            <Text size="sm" c="dimmed">
              Events merge local captures with recent metadata from Influx ({eventMeta.local_count} local, {eventMeta.influx_count} from Influx).
              CSV export uses local capture files when available.
            </Text>
            <Group grow align="flex-end">
              <TextInput
                label="Range start (ISO)"
                placeholder="2026-07-08T16:00:00.000-07:00"
                value={rangeStart}
                onChange={(e) => setRangeStart(e.currentTarget.value)}
                disabled={!influxConnected}
              />
              <TextInput
                label="Range end (ISO)"
                placeholder="2026-07-08T16:30:00.000-07:00"
                value={rangeEnd}
                onChange={(e) => setRangeEnd(e.currentTarget.value)}
                disabled={!influxConnected}
              />
            </Group>
            <Text size="xs" c="dimmed">
              Select events and/or a time range. Output is clipped to actual data timestamps (no empty padding).
            </Text>
            <Button
              leftSection={<Download size={14} />}
              onClick={downloadDecodedCsv}
              loading={exporting}
              disabled={!canExport || loading || !influxConnected}
            >
              Generate and download CSV
            </Button>
            <Table striped highlightOnHover>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th w={36}>
                    <Checkbox
                      checked={allSelected}
                      indeterminate={selectedEventIds.length > 0 && !allSelected}
                      onChange={toggleAllEvents}
                      aria-label="Select all events"
                      disabled={!influxConnected}
                    />
                  </Table.Th>
                  <Table.Th>Run</Table.Th>
                  <Table.Th>Start</Table.Th>
                  <Table.Th>End</Table.Th>
                  <Table.Th>Capture</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {events.length === 0 && (
                  <Table.Tr>
                    <Table.Td colSpan={5}>
                      <Text size="sm" c="dimmed">
                        {influxConnected ? 'No recorded events yet.' : 'InfluxDB required to load events.'}
                      </Text>
                    </Table.Td>
                  </Table.Tr>
                )}
                {events.map((evt) => (
                  <Table.Tr key={evt.id}>
                    <Table.Td>
                      <Checkbox
                        checked={selectedEventIds.includes(evt.id)}
                        onChange={() => toggleEvent(evt.id)}
                        aria-label={`Select ${evt.display_name}`}
                        disabled={!influxConnected || evt.source === 'influx'}
                      />
                    </Table.Td>
                    <Table.Td>
                      <Group gap={6}>
                        <Text size="sm" fw={500}>{evt.display_name}</Text>
                        {evt.source === 'influx' && <Badge size="xs" color="grape">influx</Badge>}
                        {evt.influx_synced && <Badge size="xs" color="teal">synced</Badge>}
                      </Group>
                      <Text size="xs" c="dimmed">{evt.bucket_name}</Text>
                    </Table.Td>
                    <Table.Td><Text size="xs">{evt.start_time_iso}</Text></Table.Td>
                    <Table.Td><Text size="xs">{evt.end_time_iso || '—'}</Text></Table.Td>
                    <Table.Td><Text size="xs" style={{ fontFamily: 'monospace' }}>{evt.dump_file || '—'}</Text></Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
            {eventBuckets.length > 0 && (
              <Box>
                <Text size="xs" c="dimmed" mb={4}>Influx event metadata buckets</Text>
                {eventBuckets.map((b) => (
                  <Badge key={b.name} size="sm" color="grape" mr={4} mb={4}>{b.name}</Badge>
                ))}
              </Box>
            )}
          </Stack>
        </Tabs.Panel>
      </Tabs>
    </Modal>
  );
}
