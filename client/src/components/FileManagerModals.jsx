import React, { useState, useRef, useCallback } from 'react';
import { Modal, Box, Text, Stack, Group, Button, TextInput, Select, ActionIcon } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { Upload, Trash2, Pencil, Check, X, Plus } from 'lucide-react';
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

