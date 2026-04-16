import React, { useState, useRef, useCallback } from 'react';
import { Modal, Box, Text, Stack, Group, Button, TextInput, Select, ActionIcon } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { Upload, Trash2, Pencil, Check, X, Plus, FolderPlus } from 'lucide-react';
import { apiJson, buildApiUrl } from '../lib/api';

function DropZone({ accept, onFiles }) {
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef(null);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    setDragOver(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) onFiles(files);
  }, [onFiles]);

  const handleDragOver = useCallback((e) => {
    e.preventDefault();
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback(() => setDragOver(false), []);

  return (
    <Box
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onClick={() => inputRef.current?.click()}
      style={{
        border: `2px dashed ${dragOver ? 'var(--mantine-color-blue-6)' : '#3f3f46'}`,
        borderRadius: 8,
        padding: '24px 16px',
        textAlign: 'center',
        cursor: 'pointer',
        backgroundColor: dragOver ? 'rgba(59,130,246,0.06)' : '#0f0f11',
        transition: 'border-color 150ms, background-color 150ms',
      }}
    >
      <Upload size={24} style={{ color: '#71717a', marginBottom: 8 }} />
      <Text size="sm" c="dimmed">Drop files here or click to browse</Text>
      <Text size="xs" c="dimmed" mt={4}>Accepts {accept}</Text>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple
        style={{ display: 'none' }}
        onChange={(e) => {
          const files = Array.from(e.target.files);
          if (files.length > 0) onFiles(files);
          e.target.value = '';
        }}
      />
    </Box>
  );
}

function FileRow({ name, onDelete, onRename, readOnly = false, embedded = false }) {
  const [editing, setEditing] = useState(false);
  const [newName, setNewName] = useState(name);

  const startEdit = (e) => {
    e.stopPropagation();
    setNewName(name);
    setEditing(true);
  };

  const confirmRename = (e) => {
    e.stopPropagation();
    const trimmed = newName.trim();
    if (trimmed && trimmed !== name) {
      onRename(name, trimmed);
    }
    setEditing(false);
  };

  const cancelEdit = (e) => {
    e.stopPropagation();
    setEditing(false);
  };

  return (
    <Group
      gap="xs"
      wrap="nowrap"
      style={{
        padding: '6px 10px',
        borderRadius: 4,
        backgroundColor: '#0f0f11',
        border: '1px solid #1f1f23',
      }}
    >
      {editing ? (
        <>
          <TextInput
            value={newName}
            onChange={(e) => setNewName(e.currentTarget.value)}
            size="xs"
            style={{ flex: 1 }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') confirmRename(e);
              if (e.key === 'Escape') cancelEdit(e);
            }}
            autoFocus
            onClick={(e) => e.stopPropagation()}
          />
          <ActionIcon size="sm" variant="subtle" color="green" onClick={confirmRename}>
            <Check size={14} />
          </ActionIcon>
          <ActionIcon size="sm" variant="subtle" color="gray" onClick={cancelEdit}>
            <X size={14} />
          </ActionIcon>
        </>
      ) : (
        <>
          <Group gap={4} justify="space-between" style={{ flex: 1 }}>
            <Text size="sm" style={{ color: '#e4e4e7', wordBreak: 'break-all' }}>
              {name}
            </Text>
            {embedded && (
              <Text size="xs" c="dimmed" style={{ opacity: 0.7 }}>
                *
              </Text>
            )}
          </Group>
          {!readOnly && (
            <>
              <ActionIcon size="sm" variant="subtle" color="gray" onClick={startEdit} title="Rename">
                <Pencil size={14} />
              </ActionIcon>
              <ActionIcon size="sm" variant="subtle" color="red" onClick={() => onDelete(name)} title="Delete">
                <Trash2 size={14} />
              </ActionIcon>
            </>
          )}
        </>
      )}
    </Group>
  );
}

export function LogFileManagerModal({ opened, onClose, onFilesChanged }) {
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(false);

  const loadFiles = useCallback(() => {
    apiJson('/api/files/log')
      .then((list) => setFiles(list || []))
      .catch((e) => notifications.show({ title: 'Error', message: e.message, color: 'red' }));
  }, []);

  React.useEffect(() => {
    if (opened) loadFiles();
  }, [opened, loadFiles]);

  const handleUpload = async (fileList) => {
    setLoading(true);
    for (const file of fileList) {
      const formData = new FormData();
      formData.append('file', file);
      try {
        await fetch(buildApiUrl('/api/files/log'), { method: 'POST', body: formData });
      } catch (e) {
        notifications.show({ title: 'Upload failed', message: e.message, color: 'red' });
      }
    }
    setLoading(false);
    loadFiles();
    onFilesChanged?.();
  };

  const handleDelete = async (filename) => {
    try {
      await apiJson('/api/files/log', {
        method: 'DELETE',
        body: JSON.stringify({ filename }),
      });
      loadFiles();
      onFilesChanged?.();
    } catch (e) {
      notifications.show({ title: 'Delete failed', message: e.message, color: 'red' });
    }
  };

  const handleRename = async (oldName, newName) => {
    try {
      await apiJson('/api/files/log/rename', {
        method: 'PUT',
        body: JSON.stringify({ old_name: oldName, new_name: newName }),
      });
      loadFiles();
      onFilesChanged?.();
    } catch (e) {
      notifications.show({ title: 'Rename failed', message: e.message, color: 'red' });
    }
  };

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title="Log Files"
      centered
      size="md"
      styles={{
        header: { backgroundColor: '#0a0a0b', borderBottom: '1px solid #1f1f23' },
        body: { backgroundColor: '#0a0a0b' },
        content: { backgroundColor: '#0a0a0b' },
      }}
    >
      <Stack gap="md">
        <DropZone accept=".txt, .log" onFiles={handleUpload} />
        {loading && <Text size="xs" c="dimmed">Uploading...</Text>}
        <Text size="xs" c="dimmed" tt="uppercase">{files.length} file{files.length !== 1 ? 's' : ''}</Text>
        <Stack gap={6}>
          {files.sort().map((f) => (
            <FileRow key={f} name={f} onDelete={handleDelete} onRename={handleRename} />
          ))}
          {files.length === 0 && <Text size="sm" c="dimmed">No log files found.</Text>}
        </Stack>
      </Stack>
    </Modal>
  );
}

export function DbcFileManagerModal({ opened, onClose, vehicles, currentVehicle, onFilesChanged, onVehiclesChanged }) {
  const [selectedVehicle, setSelectedVehicle] = useState(currentVehicle || '');
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [addingVehicle, setAddingVehicle] = useState(false);
  const [newVehicleName, setNewVehicleName] = useState('');

  React.useEffect(() => {
    if (opened) setSelectedVehicle(currentVehicle || '');
  }, [opened, currentVehicle]);

  const loadFiles = useCallback((vehicle) => {
    if (!vehicle) { setFiles([]); return; }
    apiJson(`/api/dbc/vehicles/${encodeURIComponent(vehicle)}/files`)
      .then((list) => setFiles((list || []).map((entry) => (
        typeof entry === 'string' ? { name: entry, source: 'local' } : entry
      ))))
      .catch((e) => {
        setFiles([]);
        notifications.show({ title: 'Error', message: e.message, color: 'red' });
      });
  }, []);

  React.useEffect(() => {
    if (opened && selectedVehicle) loadFiles(selectedVehicle);
  }, [opened, selectedVehicle, loadFiles]);

  const handleUpload = async (fileList) => {
    if (!selectedVehicle) {
      notifications.show({ title: 'No vehicle', message: 'Select a vehicle first.', color: 'orange' });
      return;
    }
    setLoading(true);
    for (const file of fileList) {
      const formData = new FormData();
      formData.append('file', file);
      try {
        await fetch(buildApiUrl(`/api/dbc/vehicles/${encodeURIComponent(selectedVehicle)}/files`), {
          method: 'POST',
          body: formData,
        });
      } catch (e) {
        notifications.show({ title: 'Upload failed', message: e.message, color: 'red' });
      }
    }
    setLoading(false);
    loadFiles(selectedVehicle);
    onFilesChanged?.();
  };

  const handleDelete = async (filename) => {
    try {
      await apiJson(`/api/dbc/vehicles/${encodeURIComponent(selectedVehicle)}/files`, {
        method: 'DELETE',
        body: JSON.stringify({ filename }),
      });
      loadFiles(selectedVehicle);
      onFilesChanged?.();
    } catch (e) {
      notifications.show({ title: 'Delete failed', message: e.message, color: 'red' });
    }
  };

  const handleRename = async (oldName, newName) => {
    try {
      await apiJson(`/api/dbc/vehicles/${encodeURIComponent(selectedVehicle)}/files/rename`, {
        method: 'PUT',
        body: JSON.stringify({ old_name: oldName, new_name: newName }),
      });
      loadFiles(selectedVehicle);
      onFilesChanged?.();
    } catch (e) {
      notifications.show({ title: 'Rename failed', message: e.message, color: 'red' });
    }
  };

  const handleAddVehicle = async () => {
    const name = newVehicleName.trim();
    if (!name) return;
    try {
      await apiJson('/api/dbc/vehicles', {
        method: 'POST',
        body: JSON.stringify({ name }),
      });
      setAddingVehicle(false);
      setNewVehicleName('');
      setSelectedVehicle(name);
      onVehiclesChanged?.();
      notifications.show({ title: 'Vehicle', message: `Created "${name}"`, color: 'green' });
    } catch (e) {
      notifications.show({ title: 'Failed', message: e.message, color: 'red' });
    }
  };

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title="DBC Files"
      centered
      size="md"
      styles={{
        header: { backgroundColor: '#0a0a0b', borderBottom: '1px solid #1f1f23' },
        body: { backgroundColor: '#0a0a0b' },
        content: { backgroundColor: '#0a0a0b' },
      }}
    >
      <Stack gap="md">
        <Group gap="xs" align="flex-end">
          <Select
            label="Vehicle"
            data={vehicles.map((v) => ({ value: v, label: v }))}
            value={selectedVehicle || null}
            onChange={(v) => setSelectedVehicle(v || '')}
            searchable
            size="sm"
            style={{ flex: 1 }}
          />
          <Button
            size="sm"
            variant="subtle"
            onClick={() => setAddingVehicle((a) => !a)}
            title="Add vehicle"
            style={{ color: 'var(--text-muted)' }}
          >
            <FolderPlus size={16} />
          </Button>
        </Group>

        {addingVehicle && (
          <Group gap="xs">
            <TextInput
              placeholder="New vehicle name"
              size="xs"
              value={newVehicleName}
              onChange={(e) => setNewVehicleName(e.currentTarget.value)}
              style={{ flex: 1 }}
              onKeyDown={(e) => { if (e.key === 'Enter') handleAddVehicle(); }}
              autoFocus
            />
            <ActionIcon size="md" variant="subtle" color="green" onClick={handleAddVehicle}>
              <Check size={14} />
            </ActionIcon>
            <ActionIcon size="md" variant="subtle" color="gray" onClick={() => { setAddingVehicle(false); setNewVehicleName(''); }}>
              <X size={14} />
            </ActionIcon>
          </Group>
        )}

        {selectedVehicle && (
          <>
            <DropZone accept=".dbc" onFiles={handleUpload} />
            {loading && <Text size="xs" c="dimmed">Uploading...</Text>}
            <Text size="xs" c="dimmed" tt="uppercase">{files.length} file{files.length !== 1 ? 's' : ''}</Text>
            <Stack gap={6}>
              {files
                .slice()
                .sort((a, b) => a.name.localeCompare(b.name))
                .map((f) => (
                  <FileRow
                    key={f.name}
                    name={f.name}
                    onDelete={handleDelete}
                    onRename={handleRename}
                    readOnly={f.source === 'embedded'}
                    embedded={f.source === 'embedded'}
                  />
                ))}
              {files.length === 0 && <Text size="sm" c="dimmed">No DBC files in this vehicle.</Text>}
            </Stack>
          </>
        )}

        {!selectedVehicle && (
          <Text size="sm" c="dimmed" ta="center" py="md">Select or add a vehicle to manage DBC files.</Text>
        )}
      </Stack>
    </Modal>
  );
}
