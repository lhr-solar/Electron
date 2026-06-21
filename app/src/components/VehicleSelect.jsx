import { useState } from 'react';
import { Button, Group, Modal, Select, Stack, Text, TextInput } from '@mantine/core';
import { Plus } from 'lucide-react';
import { notifications } from '@mantine/notifications';
import { useVehicles } from '../lib/useVehicles.js';

function vehicleLabel(v) {
  const tags = [];
  if (v.hasDbc) tags.push('DBC');
  if (v.hasMdc) tags.push('MDC');
  return tags.length ? `${v.id} (${tags.join(', ')})` : v.id;
}

export default function VehicleSelect({
  value,
  onChange,
  disabled = false,
  allowAdd = true,
  label = 'Vehicle',
  size = 'sm',
}) {
  const { vehicles, resolvedDefault, loading, addVehicle, setDefaultVehicle } = useVehicles();
  const [addOpen, setAddOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [busy, setBusy] = useState(false);

  const selected = value ?? resolvedDefault;
  const data = vehicles.map((v) => ({ value: v.id, label: vehicleLabel(v) }));

  const handleChange = async (id) => {
    if (!id) return;
    try {
      await setDefaultVehicle(id);
      onChange?.(id);
    } catch (e) {
      notifications.show({ title: 'Vehicle update failed', message: e.message, color: 'red' });
    }
  };

  const submitAdd = async () => {
    const name = newName.trim();
    if (!name) return;
    setBusy(true);
    try {
      const entry = await addVehicle(name);
      await setDefaultVehicle(entry.id);
      onChange?.(entry.id);
      setAddOpen(false);
      setNewName('');
      notifications.show({ title: 'Vehicle added', message: entry.id, color: 'green' });
    } catch (e) {
      notifications.show({ title: 'Add vehicle failed', message: e.message, color: 'red' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Group gap="xs" wrap="nowrap">
        <Select
          label={label}
          size={size}
          data={data}
          value={selected}
          onChange={handleChange}
          disabled={disabled || loading || !data.length}
          searchable
          style={{ flex: 1, minWidth: 160 }}
        />
        {allowAdd ? (
          <Button
            size={size}
            variant="default"
            leftSection={<Plus size={14} />}
            onClick={() => setAddOpen(true)}
            disabled={disabled}
            style={{ alignSelf: 'flex-end' }}
          >
            Add
          </Button>
        ) : null}
      </Group>

      <Modal opened={addOpen} onClose={() => setAddOpen(false)} title="Add vehicle" centered>
        <Stack gap="sm">
          <Text size="sm" c="dimmed">
            Creates an empty folder under the data checkout. No delete from the app.
          </Text>
          <TextInput
            label="Name"
            value={newName}
            onChange={(e) => setNewName(e.currentTarget.value)}
            placeholder="Daybreak"
            data-autofocus
          />
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setAddOpen(false)}>
              Cancel
            </Button>
            <Button onClick={submitAdd} loading={busy} disabled={!newName.trim()}>
              Create
            </Button>
          </Group>
        </Stack>
      </Modal>
    </>
  );
}
