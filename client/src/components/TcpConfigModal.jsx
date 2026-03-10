import React, { useState, useEffect, useCallback } from 'react';
import { Modal, Box, Text, Stack, Group, Button, TextInput, ActionIcon } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { Trash2, Pencil, Plus, Wifi } from 'lucide-react';

function api(path, options = {}) {
  return fetch(path, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  }).then(async (res) => {
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.detail || data.message || res.statusText);
    return data;
  });
}

export function TcpConfigModal({ opened, onClose, onRefresh, currentIp, currentPort }) {
  const [list, setList] = useState([]);
  const [editingId, setEditingId] = useState(null);
  const [formName, setFormName] = useState('');
  const [formIp, setFormIp] = useState('');
  const [formPort, setFormPort] = useState('');
  const [adding, setAdding] = useState(false);
  const [testing, setTesting] = useState(false);

  const load = useCallback(() => {
    api('/api/tcp/configs')
      .then(setList)
      .catch((e) => notifications.show({ title: 'TCP configs', message: e.message, color: 'red' }));
  }, []);

  useEffect(() => {
    if (opened) load();
  }, [opened, load]);


  const startAdd = () => {
    setAdding(true);
    setEditingId(null);
    setFormName('');
    setFormIp(currentIp || '');
    setFormPort(String(currentPort || '8187'));
  };

  const startEdit = (c) => {
    setAdding(false);
    setEditingId(c.id);
    setFormName(c.name);
    setFormIp(c.ip);
    setFormPort(String(c.port));
  };

  const cancelForm = () => {
    setAdding(false);
    setEditingId(null);
  };

  const saveAdd = () => {
    if (!formName.trim() || !formIp.trim()) {
      notifications.show({ title: 'Validation', message: 'Name and IP required', color: 'red' });
      return;
    }
    const port = parseInt(formPort, 10);
    if (isNaN(port) || port < 1 || port > 65535) {
      notifications.show({ title: 'Validation', message: 'Valid port required (1-65535)', color: 'red' });
      return;
    }
    api('/api/tcp/configs', { method: 'POST', body: JSON.stringify({ name: formName.trim(), ip: formIp.trim(), port }) })
      .then((created) => {
        setList((prev) => [...prev, created]);
        setAdding(false);
        setFormName('');
        setFormIp('');
        setFormPort('');
        onRefresh?.();
        notifications.show({ title: 'TCP config', message: 'Added', color: 'green' });
      })
      .catch((e) => notifications.show({ title: 'Add failed', message: e.message, color: 'red' }));
  };

  const saveEdit = () => {
    if (!formName.trim() || !formIp.trim()) {
      notifications.show({ title: 'Validation', message: 'Name and IP required', color: 'red' });
      return;
    }
    const port = parseInt(formPort, 10);
    if (isNaN(port) || port < 1 || port > 65535) {
      notifications.show({ title: 'Validation', message: 'Valid port required (1-65535)', color: 'red' });
      return;
    }
    api(`/api/tcp/configs/${editingId}`, { method: 'PUT', body: JSON.stringify({ name: formName.trim(), ip: formIp.trim(), port }) })
      .then((updated) => {
        setList((prev) => prev.map((c) => (c.id === editingId ? updated : c)));
        setEditingId(null);
        onRefresh?.();
        notifications.show({ title: 'TCP config', message: 'Updated', color: 'green' });
      })
      .catch((e) => notifications.show({ title: 'Update failed', message: e.message, color: 'red' }));
  };

  const handleDelete = (c) => {
    if (!confirm(`Delete "${c.name}"?`)) return;
    api(`/api/tcp/configs/${c.id}`, { method: 'DELETE' })
      .then(() => {
        setList((prev) => prev.filter((x) => x.id !== c.id));
        onRefresh?.();
        notifications.show({ title: 'TCP config', message: 'Deleted', color: 'green' });
      })
      .catch((e) => notifications.show({ title: 'Delete failed', message: e.message, color: 'red' }));
  };

  const testConnection = (ip, port) => {
    setTesting(true);
    api('/api/tcp/test', { method: 'POST', body: JSON.stringify({ ip: ip.trim() }) })
      .then((res) => {
        if (res.ok) {
          notifications.show({ title: 'Connection test', message: res.message, color: 'green' });
        } else {
          notifications.show({ title: 'Connection failed', message: res.message, color: 'red', autoClose: 5000 });
        }
      })
      .catch((e) => notifications.show({ title: 'Test failed', message: e.message, color: 'red' }))
      .finally(() => setTesting(false));
  };

  return (
    <Modal opened={opened} onClose={onClose} title="Manage TCP configs" size="md">
      <Stack gap="md">
        <Group justify="space-between">
          <Text size="sm" c="dimmed">Saved network/port presets</Text>
          <Button variant="subtle" size="xs" leftSection={<Plus size={12} />} onClick={startAdd} disabled={adding}>
            Add
          </Button>
        </Group>

        {adding && (
          <Box p="sm" style={{ border: '1px solid var(--border)', borderRadius: 6, backgroundColor: '#0f0f11' }}>
            <Stack gap="xs">
              <TextInput label="Name" placeholder="e.g. Main Server" value={formName} onChange={(e) => setFormName(e.target.value)} size="sm" />
              <Group grow>
                <TextInput label="IP" value={formIp} onChange={(e) => setFormIp(e.target.value)} size="sm" />
                <TextInput label="Port" type="number" value={formPort} onChange={(e) => setFormPort(e.target.value)} size="sm" />
              </Group>
              <Group>
                <Button size="xs" onClick={saveAdd}>Save</Button>
                <Button variant="subtle" size="xs" onClick={cancelForm}>Cancel</Button>
              </Group>
            </Stack>
          </Box>
        )}

        <Stack gap={4}>
          {list.map((c) => (
            <Box
              key={c.id}
              style={{
                border: '1px solid var(--border)',
                borderRadius: 4,
                padding: '8px 12px',
                backgroundColor: editingId === c.id ? '#18181b' : '#0f0f11',
              }}
            >
              {editingId === c.id ? (
                <Stack gap="xs">
                  <TextInput label="Name" value={formName} onChange={(e) => setFormName(e.target.value)} size="sm" />
                  <Group grow>
                    <TextInput label="IP" value={formIp} onChange={(e) => setFormIp(e.target.value)} size="sm" />
                    <TextInput label="Port" type="number" value={formPort} onChange={(e) => setFormPort(e.target.value)} size="sm" />
                  </Group>
                  <Group>
                    <Button size="xs" onClick={saveEdit}>Save</Button>
                    <Button variant="subtle" size="xs" onClick={cancelForm}>Cancel</Button>
                    <Button variant="subtle" size="xs" onClick={() => testConnection(formIp, formPort)} loading={testing}>
                      Test
                    </Button>
                  </Group>
                </Stack>
              ) : (
                <Group justify="space-between">
                  <div>
                    <Text size="sm" fw={500}>{c.name}</Text>
                    <Text size="xs" c="dimmed">{c.ip}:{c.port}</Text>
                  </div>
                  <Group gap={4}>
                    <ActionIcon variant="subtle" size="sm" onClick={() => testConnection(c.ip, c.port)} loading={testing} title="Test connection">
                      <Wifi size={14} />
                    </ActionIcon>
                    <ActionIcon variant="subtle" size="sm" onClick={() => startEdit(c)} title="Edit">
                      <Pencil size={14} />
                    </ActionIcon>
                    <ActionIcon variant="subtle" size="sm" color="red" onClick={() => handleDelete(c)} title="Delete">
                      <Trash2 size={14} />
                    </ActionIcon>
                  </Group>
                </Group>
              )}
            </Box>
          ))}
        </Stack>

        {list.length === 0 && !adding && (
          <Text size="sm" c="dimmed" ta="center" py="md">No TCP configs yet. Add one above.</Text>
        )}
      </Stack>
    </Modal>
  );
}
