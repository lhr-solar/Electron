import { Group, NumberInput, Stack, Text } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import VehicleSelect from '../../components/VehicleSelect.jsx';
import { useEngineClient, useEngineStatus } from '../../lib/useEngine.jsx';
import { useVehicles } from '../../lib/useVehicles.js';

export default function IngestBar() {
  const client = useEngineClient();
  const { status } = useEngineStatus();
  const { settings, setDefaultVehicle, refresh } = useVehicles();
  const running = status.service_running;

  const saveBitrate = async (v) => {
    const bitrate = Number(v) || 500000;
    try {
      await client.updateSettings({ defaultReadBitrate: bitrate });
      await refresh();
    } catch (e) {
      notifications.show({ title: 'Bitrate save failed', message: e.message, color: 'red' });
    }
  };

  return (
    <Group
      px="md"
      py="xs"
      gap="md"
      wrap="wrap"
      style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg-elevated)' }}
    >
      <Text size="xs" c="dimmed" fw={600} style={{ letterSpacing: '0.04em' }}>
        INGEST
      </Text>
      <VehicleSelect
        label="Vehicle"
        disabled={running}
        onChange={(id) => setDefaultVehicle(id).catch(() => {})}
      />
      <NumberInput
        label="Read bitrate (bit/s)"
        size="sm"
        value={settings?.defaultReadBitrate ?? 500000}
        onChange={saveBitrate}
        min={1000}
        step={1000}
        disabled={running}
        style={{ width: 180 }}
      />
      {running ? (
        <Text size="xs" c="dimmed" style={{ alignSelf: 'flex-end', paddingBottom: 6 }}>
          Stop ingest to change vehicle/bitrate
        </Text>
      ) : null}
    </Group>
  );
}
