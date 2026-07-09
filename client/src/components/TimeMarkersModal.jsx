import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, Pencil, RefreshCw, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { apiJson } from '../lib/api';
import { notifications } from '../lib/notify';
import { cn } from '@/lib/utils';

const RANGES = [
  { value: '-24h', label: 'Last 24h' },
  { value: '-7d', label: 'Last 7 days' },
  { value: '-30d', label: 'Last 30 days' },
  { value: '-90d', label: 'Last 90 days' },
];

function formatLocal(iso) {
  if (!iso) return '—';
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return String(iso);
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: 'medium',
      timeStyle: 'medium',
    }).format(new Date(ms));
  } catch {
    return String(iso);
  }
}

export function TimeMarkersModal({ opened, onClose, refreshKey = 0 }) {
  const [range, setRange] = useState('-30d');
  const [markers, setMarkers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState('');
  const [renameTarget, setRenameTarget] = useState(null);
  const [renameValue, setRenameValue] = useState('');
  const [renaming, setRenaming] = useState(false);
  const [selectedIds, setSelectedIds] = useState([]);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiJson(
        `/api/time-markers?time_range=${encodeURIComponent(range)}&limit=500`
      );
      setMarkers(res.markers || []);
      setSelectedIds([]);
    } catch (e) {
      notifications.show({
        title: 'Could not load markers',
        message: e.message || String(e),
        color: 'red',
      });
      setMarkers([]);
    } finally {
      setLoading(false);
    }
  }, [range]);

  useEffect(() => {
    if (!opened) return;
    load();
  }, [opened, load, refreshKey]);

  useEffect(() => {
    if (!opened) {
      setSelectedIds([]);
      setConfirmDeleteOpen(false);
    }
  }, [opened]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return markers;
    return markers.filter((m) => {
      const name = String(m.name || '').toLowerCase();
      const iso = String(m.time_iso || '').toLowerCase();
      const local = formatLocal(m.time_iso).toLowerCase();
      return name.includes(q) || iso.includes(q) || local.includes(q) || String(m.id).includes(q);
    });
  }, [markers, query]);

  const openRename = (m) => {
    setRenameTarget(m);
    setRenameValue(m.name || '');
  };

  const submitRename = async () => {
    if (!renameTarget) return;
    const label = renameValue.trim();
    setRenaming(true);
    try {
      await apiJson(`/api/time-markers/${encodeURIComponent(renameTarget.id)}`, {
        method: 'PATCH',
        body: JSON.stringify({ name: label, time_ns: renameTarget.time_ns }),
      });
      notifications.show({
        title: label ? 'Marker renamed' : 'Name cleared',
        message: label || 'Unnamed',
        color: 'green',
      });
      setRenameTarget(null);
      await load();
    } catch (e) {
      notifications.show({
        title: 'Rename failed',
        message: e.message || String(e),
        color: 'red',
      });
    } finally {
      setRenaming(false);
    }
  };

  const toggleSelected = (id, checked) => {
    setSelectedIds((prev) => {
      if (checked) return prev.includes(id) ? prev : [...prev, id];
      return prev.filter((x) => x !== id);
    });
  };

  const allFilteredSelected =
    filtered.length > 0 && filtered.every((m) => selectedIds.includes(m.id));

  const toggleSelectAll = (checked) => {
    if (checked) {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        filtered.forEach((m) => next.add(m.id));
        return [...next];
      });
    } else {
      const drop = new Set(filtered.map((m) => m.id));
      setSelectedIds((prev) => prev.filter((id) => !drop.has(id)));
    }
  };

  const deleteSelected = async () => {
    if (!selectedIds.length) return;
    const byId = new Map(markers.map((m) => [m.id, m]));
    const payload = selectedIds
      .map((id) => byId.get(id))
      .filter(Boolean)
      .map((m) => ({ id: m.id, time_ns: m.time_ns, name: m.name || '' }));
    if (!payload.length) return;
    setDeleting(true);
    try {
      const res = await apiJson('/api/time-markers/delete', {
        method: 'POST',
        body: JSON.stringify({ markers: payload }),
      });
      notifications.show({
        title: 'Markers deleted',
        message: `Removed ${res.count ?? payload.length}`,
        color: 'green',
      });
      setConfirmDeleteOpen(false);
      setSelectedIds([]);
      await load();
    } catch (e) {
      notifications.show({
        title: 'Delete failed',
        message: e.message || String(e),
        color: 'red',
      });
    } finally {
      setDeleting(false);
    }
  };

  const copyIso = async (iso) => {
    try {
      await navigator.clipboard.writeText(iso);
      notifications.show({ title: 'Copied', message: iso, color: 'blue' });
    } catch {
      notifications.show({ title: 'Copy failed', color: 'red' });
    }
  };

  return (
    <>
      <Dialog
        open={opened}
        onOpenChange={(o) => {
          if (!o) onClose();
        }}
      >
        <DialogContent className="flex max-h-[85vh] flex-col overflow-hidden bg-popover sm:max-w-2xl">
          <DialogHeader>
            <div className="flex items-center justify-between gap-2 pr-8">
              <DialogTitle className="font-display">Time markers</DialogTitle>
              {selectedIds.length > 0 && (
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => setConfirmDeleteOpen(true)}
                  disabled={deleting}
                  className="shrink-0"
                >
                  {deleting ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <Trash2 className="size-3.5" />
                  )}
                  Delete {selectedIds.length}
                </Button>
              )}
            </div>
          </DialogHeader>
          <p className="text-xs text-muted-foreground">
            Click <span className="font-medium text-foreground">Time Mark</span> in the header to
            drop a timestamp. Anyone can rename or delete markers.
          </p>

          <div className="flex flex-wrap items-end gap-2">
            <div className="flex min-w-[140px] flex-col gap-1.5">
              <Label className="text-xs">Range</Label>
              <Select value={range} onValueChange={setRange}>
                <SelectTrigger className="h-8 w-full" size="sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {RANGES.map((r) => (
                    <SelectItem key={r.value} value={r.value}>
                      {r.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              <Label className="text-xs">Search</Label>
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Filter by name or time…"
                className="h-8"
              />
            </div>
            <Button
              variant="outline"
              size="sm"
              className="h-8"
              onClick={load}
              disabled={loading}
              title="Refresh"
            >
              <RefreshCw className={cn('size-3.5', loading && 'animate-spin')} />
              Refresh
            </Button>
          </div>

          <div className="min-h-0 flex-1 overflow-auto rounded-md border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <Checkbox
                      checked={allFilteredSelected}
                      onCheckedChange={(v) => toggleSelectAll(!!v)}
                      aria-label="Select all markers"
                      disabled={!filtered.length}
                    />
                  </TableHead>
                  <TableHead className="w-[40%]">Time</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead className="w-[72px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="py-8 text-center text-sm text-muted-foreground">
                      {loading ? 'Loading…' : 'No markers in this range.'}
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map((m) => (
                    <TableRow key={m.id}>
                      <TableCell className="align-top">
                        <Checkbox
                          checked={selectedIds.includes(m.id)}
                          onCheckedChange={(v) => toggleSelected(m.id, !!v)}
                          aria-label={`Select ${m.name || m.id}`}
                        />
                      </TableCell>
                      <TableCell className="align-top">
                        <button
                          type="button"
                          className="text-left text-sm tabular-nums hover:underline"
                          title="Copy ISO timestamp"
                          onClick={() => copyIso(m.time_iso)}
                        >
                          {formatLocal(m.time_iso)}
                        </button>
                        <div className="mt-0.5 text-[11px] text-muted-foreground tabular-nums">
                          {m.time_iso}
                        </div>
                      </TableCell>
                      <TableCell className="align-top text-sm">
                        {m.name ? (
                          m.name
                        ) : (
                          <span className="italic text-muted-foreground">Unnamed</span>
                        )}
                      </TableCell>
                      <TableCell className="align-top">
                        <Button
                          variant="ghost"
                          size="xs"
                          onClick={() => openRename(m)}
                          title="Rename"
                        >
                          <Pencil className="size-3" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!renameTarget}
        onOpenChange={(o) => {
          if (!o) setRenameTarget(null);
        }}
      >
        <DialogContent className="bg-popover sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display">Rename marker</DialogTitle>
          </DialogHeader>
          {renameTarget ? (
            <p className="text-xs text-muted-foreground">
              {formatLocal(renameTarget.time_iso)}
            </p>
          ) : null}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="marker-rename" className="text-xs">
              Event name
            </Label>
            <Input
              id="marker-rename"
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              className="h-8"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  submitRename();
                }
              }}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameTarget(null)} disabled={renaming}>
              Cancel
            </Button>
            <Button onClick={submitRename} disabled={renaming}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={confirmDeleteOpen}
        onOpenChange={(o) => {
          if (!o) setConfirmDeleteOpen(false);
        }}
      >
        <DialogContent className="bg-popover sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display">
              Delete {selectedIds.length} marker{selectedIds.length === 1 ? '' : 's'}?
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">This cannot be undone.</p>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setConfirmDeleteOpen(false)}
              disabled={deleting}
            >
              Cancel
            </Button>
            <Button variant="destructive" onClick={deleteSelected} disabled={deleting}>
              {deleting ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
