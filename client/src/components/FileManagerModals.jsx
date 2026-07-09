import React, { useState, useRef, useCallback } from 'react';
import { Upload, Trash2, Pencil, Check, X, FolderPlus, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { notifications } from '@/lib/notify';
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
    <div
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onClick={() => inputRef.current?.click()}
      className={cn(
        'cursor-pointer rounded-lg border-2 border-dashed px-4 py-6 text-center transition-colors',
        dragOver
          ? 'border-signal-blue bg-signal-blue/5'
          : 'border-border-strong bg-muted/30 hover:border-signal-blue/50 hover:bg-signal-blue/5'
      )}
    >
      <Upload className="mx-auto mb-2 size-6 text-muted-foreground" />
      <p className="text-sm text-muted-foreground">Drop files here or click to browse</p>
      <p className="mt-1 text-xs text-muted-foreground">Accepts {accept}</p>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple
        className="hidden"
        onChange={(e) => {
          const files = Array.from(e.target.files);
          if (files.length > 0) onFiles(files);
          e.target.value = '';
        }}
      />
    </div>
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
    <div className="flex items-center gap-1 rounded-md border border-border bg-muted/30 px-2.5 py-1.5">
      {editing ? (
        <>
          <Input
            value={newName}
            onChange={(e) => setNewName(e.currentTarget.value)}
            className="h-7 flex-1 text-xs"
            onKeyDown={(e) => {
              if (e.key === 'Enter') confirmRename(e);
              if (e.key === 'Escape') cancelEdit(e);
            }}
            autoFocus
            onClick={(e) => e.stopPropagation()}
          />
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={confirmRename}
            className="text-signal-green hover:text-signal-green"
          >
            <Check className="size-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={cancelEdit}
            className="text-muted-foreground"
          >
            <X className="size-3.5" />
          </Button>
        </>
      ) : (
        <>
          <div className="flex min-w-0 flex-1 items-center justify-between gap-1">
            <span className="tabular break-all text-sm text-foreground">{name}</span>
            {embedded && (
              <span className="shrink-0 text-xs text-muted-foreground opacity-70">*</span>
            )}
          </div>
          {!readOnly && (
            <>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={startEdit}
                title="Rename"
                className="text-muted-foreground"
              >
                <Pencil className="size-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => onDelete(name)}
                title="Delete"
                className="text-signal-red hover:text-signal-red"
              >
                <Trash2 className="size-3.5" />
              </Button>
            </>
          )}
        </>
      )}
    </div>
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
    <Dialog open={opened} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-h-[85vh] overflow-y-auto bg-popover sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-display">Log Files</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <DropZone accept=".txt, .log" onFiles={handleUpload} />
          {loading && (
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Loader2 className="size-3 animate-spin" />
              Uploading...
            </p>
          )}
          <p className="text-xs uppercase text-muted-foreground">
            {files.length} file{files.length !== 1 ? 's' : ''}
          </p>
          <div className="flex flex-col gap-1.5">
            {[...files].sort().map((f) => (
              <FileRow key={f} name={f} onDelete={handleDelete} onRename={handleRename} />
            ))}
            {files.length === 0 && (
              <p className="text-sm text-muted-foreground">No log files found.</p>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
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
    <Dialog open={opened} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-h-[85vh] overflow-y-auto bg-popover sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-display">DBC Files</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="flex items-end gap-2">
            <div className="flex flex-1 flex-col gap-1.5">
              <Label className="text-xs">Vehicle</Label>
              <Select
                value={selectedVehicle || undefined}
                onValueChange={(v) => setSelectedVehicle(v || '')}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select vehicle" />
                </SelectTrigger>
                <SelectContent>
                  {vehicles.map((v) => (
                    <SelectItem key={v} value={v}>
                      {v}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => setAddingVehicle((a) => !a)}
              title="Add vehicle"
              className="text-muted-foreground"
            >
              <FolderPlus className="size-4" />
            </Button>
          </div>

          {addingVehicle && (
            <div className="flex items-center gap-1">
              <Input
                placeholder="New vehicle name"
                value={newVehicleName}
                onChange={(e) => setNewVehicleName(e.currentTarget.value)}
                className="h-8 flex-1 text-xs"
                onKeyDown={(e) => { if (e.key === 'Enter') handleAddVehicle(); }}
                autoFocus
              />
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={handleAddVehicle}
                className="text-signal-green hover:text-signal-green"
              >
                <Check className="size-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => { setAddingVehicle(false); setNewVehicleName(''); }}
                className="text-muted-foreground"
              >
                <X className="size-3.5" />
              </Button>
            </div>
          )}

          {selectedVehicle && (
            <>
              <DropZone accept=".dbc" onFiles={handleUpload} />
              {loading && (
                <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Loader2 className="size-3 animate-spin" />
                  Uploading...
                </p>
              )}
              <p className="text-xs uppercase text-muted-foreground">
                {files.length} file{files.length !== 1 ? 's' : ''}
              </p>
              <div className="flex flex-col gap-1.5">
                {[...files]
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
                {files.length === 0 && (
                  <p className="text-sm text-muted-foreground">No DBC files in this vehicle.</p>
                )}
              </div>
            </>
          )}

          {!selectedVehicle && (
            <p className="py-4 text-center text-sm text-muted-foreground">
              Select or add a vehicle to manage DBC files.
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
