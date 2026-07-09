import React, { useState, useEffect, useCallback } from 'react';
import { Trash2, Pencil, Plus, Wifi, Zap, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { notifications } from '@/lib/notify';
import { apiJson } from '../lib/api';

function isCurrentConfig(c, currentIp, currentPort) {
  return (
    String(c.ip) === String(currentIp) &&
    Number(c.port) === Number(currentPort)
  );
}

export function CanpConfigModal({ opened, onClose, onRefresh, currentIp, currentPort, isServerMode = false }) {
  const [list, setList] = useState([]);
  const [autoId, setAutoId] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [formName, setFormName] = useState('');
  const [formIp, setFormIp] = useState('');
  const [formPort, setFormPort] = useState('');
  const [adding, setAdding] = useState(false);
  const [testing, setTesting] = useState(false);
  const [pendingDelete, setPendingDelete] = useState(null);
  const [autoSaving, setAutoSaving] = useState(false);

  const load = useCallback(() => {
    apiJson('/api/canp/configs')
      .then(setList)
      .catch((e) => notifications.show({ title: 'CANP configs', message: e.message, color: 'red' }));
    if (isServerMode) {
      apiJson('/api/canp/auto')
        .then((res) => setAutoId(res.auto || null))
        .catch(() => setAutoId(null));
    }
  }, [isServerMode]);

  useEffect(() => {
    if (opened) load();
  }, [opened, load]);

  const startAdd = () => {
    setAdding(true);
    setEditingId(null);
    setFormName('');
    setFormIp(currentIp || '');
    setFormPort(String(currentPort || '6500'));
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
    apiJson('/api/canp/configs', { method: 'POST', body: JSON.stringify({ name: formName.trim(), ip: formIp.trim(), port }) })
      .then((created) => {
        setList((prev) => [...prev, created]);
        setAdding(false);
        setFormName('');
        setFormIp('');
        setFormPort('');
        onRefresh?.();
        notifications.show({ title: 'CANP config', message: 'Added', color: 'green' });
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
    apiJson(`/api/canp/configs/${editingId}`, { method: 'PUT', body: JSON.stringify({ name: formName.trim(), ip: formIp.trim(), port }) })
      .then((updated) => {
        setList((prev) => prev.map((c) => (c.id === editingId ? updated : c)));
        setEditingId(null);
        onRefresh?.();
        notifications.show({ title: 'CANP config', message: 'Updated', color: 'green' });
      })
      .catch((e) => notifications.show({ title: 'Update failed', message: e.message, color: 'red' }));
  };

  const handleDelete = (c) => {
    setPendingDelete({ id: c.id, name: c.name });
  };

  const confirmDelete = () => {
    if (!pendingDelete) return;
    const { id, name } = pendingDelete;
    setPendingDelete(null);
    apiJson(`/api/canp/configs/${id}`, { method: 'DELETE' })
      .then(() => {
        setList((prev) => prev.filter((x) => x.id !== id));
        onRefresh?.();
        notifications.show({ title: 'CANP config', message: `"${name}" deleted`, color: 'green' });
        // Reload auto id — delete may fall back to DAQ Server.
        if (isServerMode) {
          apiJson('/api/canp/auto')
            .then((res) => setAutoId(res.auto || null))
            .catch(() => setAutoId(null));
        }
      })
      .catch((e) => notifications.show({ title: 'Delete failed', message: e.message, color: 'red' }));
  };

  const setAsAuto = (id) => {
    const next = autoId === id ? null : id;
    setAutoSaving(true);
    apiJson('/api/canp/auto', { method: 'PUT', body: JSON.stringify({ auto: next }) })
      .then((res) => {
        setAutoId(res.auto || null);
        notifications.show({
          title: 'Server auto-start',
          message: res.auto
            ? `Will auto-start with "${list.find((c) => c.id === res.auto)?.name || res.auto}"`
            : 'Auto-start cleared',
          color: 'green',
        });
      })
      .catch((e) => notifications.show({ title: 'Auto-start failed', message: e.message, color: 'red' }))
      .finally(() => setAutoSaving(false));
  };

  const testConnection = (ip, port) => {
    setTesting(true);
    apiJson('/api/tcp/test', { method: 'POST', body: JSON.stringify({ ip: ip.trim(), port: parseInt(port, 10) || 6500 }) })
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

  const renderForm = (onSave) => (
    <div className="flex flex-col gap-2">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="canp-form-name" className="text-xs">Name</Label>
        <Input
          id="canp-form-name"
          placeholder="e.g. DAQ Server"
          value={formName}
          onChange={(e) => setFormName(e.target.value)}
          className="h-8 text-sm"
        />
      </div>
      <div className="flex gap-2">
        <div className="flex flex-1 flex-col gap-1.5">
          <Label htmlFor="canp-form-ip" className="text-xs">IP</Label>
          <Input
            id="canp-form-ip"
            value={formIp}
            onChange={(e) => setFormIp(e.target.value)}
            className="h-8 text-sm tabular"
          />
        </div>
        <div className="flex flex-1 flex-col gap-1.5">
          <Label htmlFor="canp-form-port" className="text-xs">Port</Label>
          <Input
            id="canp-form-port"
            type="number"
            value={formPort}
            onChange={(e) => setFormPort(e.target.value)}
            className="h-8 text-sm tabular"
          />
        </div>
      </div>
      <div className="flex gap-2">
        <Button size="xs" onClick={onSave}>Save</Button>
        <Button variant="ghost" size="xs" onClick={cancelForm}>Cancel</Button>
        {onSave === saveEdit && (
          <Button
            variant="ghost"
            size="xs"
            onClick={() => testConnection(formIp, formPort)}
            disabled={testing}
          >
            {testing ? <Loader2 className="size-3 animate-spin" /> : <Wifi className="size-3" />}
            Test
          </Button>
        )}
      </div>
    </div>
  );

  return (
    <>
      <Dialog open={opened} onOpenChange={(o) => { if (!o) onClose(); }}>
        <DialogContent className="max-h-[85vh] overflow-y-auto bg-popover sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-display">Manage CANP configs</DialogTitle>
          </DialogHeader>

          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm text-muted-foreground">
                {isServerMode
                  ? 'Presets + server auto-start (default: DAQ Server, HighNoon, all DBCs)'
                  : 'Saved CANP host/port presets'}
              </p>
              <Button variant="ghost" size="xs" onClick={startAdd} disabled={adding}>
                <Plus className="size-3" />
                Add
              </Button>
            </div>

            {adding && (
              <div className="rounded-md border border-border bg-muted/50 p-3">
                {renderForm(saveAdd)}
              </div>
            )}

            <div className="flex flex-col gap-1">
              {list.map((c) => (
                <div
                  key={c.id}
                  className={cn(
                    'rounded-md border border-border px-3 py-2',
                    editingId === c.id ? 'bg-accent' : 'bg-muted/30'
                  )}
                >
                  {editingId === c.id ? (
                    renderForm(saveEdit)
                  ) : (
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="text-sm font-medium">{c.name}</span>
                          {isCurrentConfig(c, currentIp, currentPort) && (
                            <Badge
                              variant="outline"
                              className="border-signal-green/30 bg-signal-green/10 text-signal-green"
                            >
                              current
                            </Badge>
                          )}
                          {isServerMode && autoId === c.id && (
                            <Badge
                              variant="outline"
                              className="border-signal-blue/30 bg-signal-blue/10 text-signal-blue"
                            >
                              auto
                            </Badge>
                          )}
                        </div>
                        <p className="tabular text-xs text-muted-foreground">
                          {c.ip}:{c.port}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-0.5">
                        {isServerMode && (
                          <Button
                            variant={autoId === c.id ? 'default' : 'ghost'}
                            size="icon-sm"
                            onClick={() => setAsAuto(c.id)}
                            disabled={autoSaving}
                            title={autoId === c.id ? 'Clear server auto-start' : 'Set as server auto-start'}
                            className={autoId === c.id ? '' : 'text-muted-foreground'}
                          >
                            {autoSaving ? (
                              <Loader2 className="size-3.5 animate-spin" />
                            ) : (
                              <Zap className="size-3.5" />
                            )}
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => testConnection(c.ip, c.port)}
                          disabled={testing}
                          title="Test connection"
                          className="text-muted-foreground"
                        >
                          {testing ? (
                            <Loader2 className="size-3.5 animate-spin" />
                          ) : (
                            <Wifi className="size-3.5" />
                          )}
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => startEdit(c)}
                          title="Edit"
                          className="text-muted-foreground"
                        >
                          <Pencil className="size-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => handleDelete(c)}
                          title="Delete"
                          className="text-signal-red hover:text-signal-red"
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {list.length === 0 && !adding && (
              <p className="py-4 text-center text-sm text-muted-foreground">
                No CANP configs yet. Add one above.
              </p>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!pendingDelete} onOpenChange={(o) => { if (!o) setPendingDelete(null); }}>
        <DialogContent className="bg-popover sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display">Delete CANP config</DialogTitle>
            <DialogDescription>
              {pendingDelete ? `Delete "${pendingDelete.name}"? This cannot be undone.` : ''}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPendingDelete(null)}>Cancel</Button>
            <Button variant="destructive" onClick={confirmDelete}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
