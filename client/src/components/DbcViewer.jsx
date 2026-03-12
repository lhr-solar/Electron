import React, { useState, useEffect, useCallback } from 'react';
import { Box, Group, Stack, Text, Select, ScrollArea } from '@mantine/core';
import { Car, FileText } from 'lucide-react';

function api(path) {
  return fetch(path).then(async (res) => {
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.detail || data.message || res.statusText);
    return data;
  });
}

export function DbcViewer() {
  const [vehicles, setVehicles] = useState([]);
  const [vehicle, setVehicle] = useState('');
  const [dbcFiles, setDbcFiles] = useState([]);
  const [dbc, setDbc] = useState('');
  const [schema, setSchema] = useState(null);
  const [loadingSchema, setLoadingSchema] = useState(false);

  const loadVehicles = useCallback(() => {
    api('/api/dbc/vehicles')
      .then(setVehicles)
      .catch(() => setVehicles([]));
  }, []);

  const loadDbcFiles = useCallback((v) => {
    if (!v) {
      setDbcFiles([]);
      return;
    }
    api(`/api/dbc/vehicles/${encodeURIComponent(v)}/files`)
      .then((files) => {
        const list = (files || []).map((entry) =>
          typeof entry === 'string' ? { name: entry, source: 'local' } : entry
        );
        setDbcFiles(list);
      })
      .catch(() => setDbcFiles([]));
  }, []);

  const loadSchema = useCallback(
    (v, filename) => {
      if (!v || !filename) {
        setSchema(null);
        return;
      }
      setLoadingSchema(true);
      api(`/api/dbc/vehicles/${encodeURIComponent(v)}/files/${encodeURIComponent(filename)}/schema`)
        .then(setSchema)
        .catch(() => setSchema(null))
        .finally(() => setLoadingSchema(false));
    },
    []
  );

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

  const vehicleOptions = vehicles.map((v) => ({ value: v, label: v }));
  const dbcOptions = dbcFiles.map((f) => ({
    value: f.name,
    label: f.source === 'embedded' ? `${f.name} *` : f.name,
  }));

  return (
    <Box
      style={{
        flex: 1,
        height: '100%',
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
        <Group gap="sm" align="flex-end">
          <Select
            label="Vehicle"
            placeholder="Select vehicle"
            data={vehicleOptions}
            value={vehicle || null}
            onChange={setVehicle}
            size="sm"
            leftSection={<Car size={14} style={{ color: 'var(--text-muted)' }} />}
            style={{ width: 220 }}
          />
          <Select
            label="DBC file"
            placeholder={vehicle ? 'Select DBC' : 'Select vehicle first'}
            data={dbcOptions}
            value={dbc || null}
            onChange={setDbc}
            size="sm"
            leftSection={<FileText size={14} style={{ color: 'var(--text-muted)' }} />}
            style={{ width: 260 }}
            disabled={!vehicle || dbcOptions.length === 0}
          />
        </Group>
        {vehicle && (
          <Text size="xs" c="dimmed">
            * = Embedded Sharepoint DBC
          </Text>
        )}
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
                ? 'Loading DBC schema...'
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
                {schema.filename} · {schema.vehicle}
              </Text>
              <Stack gap="sm">
                {[...schema.messages]
                  .slice()
                  .sort((a, b) => (a.id ?? 0) - (b.id ?? 0))
                  .map((m) => (
                  <Box
                    key={m.id}
                    style={{
                      border: '1px solid var(--border)',
                      borderRadius: 6,
                      padding: 10,
                      backgroundColor: '#18181b',
                    }}
                  >
                    <Group gap={6} mb={4} justify="space-between">
                      <Text size="sm" fw={600} style={{ color: '#e4e4e7' }}>
                        {m.id_hex} · {m.name}
                      </Text>
                      <Group gap={6}>
                        <Text size="xs" c="dimmed">
                          DLC {m.length}
                        </Text>
                        {m.ecu && (
                          <Text size="xs" c="dimmed" style={{ opacity: 0.7 }}>
                            ECU: {m.ecu}
                          </Text>
                        )}
                      </Group>
                    </Group>
                    {m.signals.length > 0 ? (
                      <Stack gap={4} mt={6}>
                        {m.signals.map((s) => (
                          <Box key={s.name}>
                            <Group gap={6} wrap="wrap" mb={2}>
                              <Text size="xs" fw={500} style={{ color: 'var(--text)' }}>
                                {s.name}
                              </Text>
                              {s.bit_range && (
                                <Text size="xs" c="dimmed">
                                  bits {s.bit_range[0]}–{s.bit_range[1]} ({s.length} bits)
                                </Text>
                              )}
                              {s.unit && (
                                <Text size="xs" c="dimmed">
                                  unit: {s.unit}
                                </Text>
                              )}
                            </Group>
                            {Array.isArray(s.choices) ? null : null}
                            {s.choices && (
                              <Text size="xs" c="dimmed" style={{ marginLeft: 8 }}>
                                values:{' '}
                                {Object.entries(s.choices)
                                  .map(([val, label]) => `${val}=${label}`)
                                  .join(', ')}
                              </Text>
                            )}
                          </Box>
                        ))}
                      </Stack>
                    ) : (
                      <Text size="xs" c="dimmed">
                        No signals defined.
                      </Text>
                    )}
                  </Box>
                ))}
              </Stack>
            </Box>
          </ScrollArea>
        )}
      </Box>
    </Box>
  );
}

