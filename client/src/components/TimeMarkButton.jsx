import React, { useEffect, useRef, useState } from 'react';
import { Bookmark, List } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { apiJson } from '../lib/api';
import { notifications } from '../lib/notify';
import { socket } from '../socket';
import { TimeMarkersModal } from './TimeMarkersModal';

function clickTimeNs() {
  if (typeof performance !== 'undefined' && typeof performance.timeOrigin === 'number') {
    return Math.round((performance.timeOrigin + performance.now()) * 1e6);
  }
  return Date.now() * 1e6;
}

/**
 * Header controls: Time Mark (immediate save + name) and Markers list.
 * Only available when Influx is connected (any adapter).
 */
export function TimeMarkButton() {
  const [busy, setBusy] = useState(false);
  const [influxConnected, setInfluxConnected] = useState(false);
  const [nameOpen, setNameOpen] = useState(false);
  const [listOpen, setListOpen] = useState(false);
  const [listRefreshKey, setListRefreshKey] = useState(0);
  const [name, setName] = useState('');
  const [pending, setPending] = useState(null); // { id, time_ns, time_iso }
  const inputRef = useRef(null);

  useEffect(() => {
    const onStatus = (status) => {
      if (typeof status?.influx_connected === 'boolean') {
        setInfluxConnected(status.influx_connected);
      }
    };
    socket.on('status', onStatus);
    return () => socket.off('status', onStatus);
  }, []);

  useEffect(() => {
    if (nameOpen) {
      const t = setTimeout(() => inputRef.current?.focus(), 50);
      return () => clearTimeout(t);
    }
  }, [nameOpen]);

  const bumpList = () => setListRefreshKey((k) => k + 1);

  if (!influxConnected) return null;

  const mark = async () => {
    if (busy) return;
    const time_ns = clickTimeNs();
    setBusy(true);
    try {
      const marker = await apiJson('/api/time-markers', {
        method: 'POST',
        body: JSON.stringify({ time_ns }),
      });
      setPending({
        id: marker.id,
        time_ns: marker.time_ns,
        time_iso: marker.time_iso,
      });
      setName('');
      setNameOpen(true);
      bumpList();
      notifications.show({
        title: 'Time mark saved',
        message: 'Optional: name this marker',
        color: 'green',
      });
    } catch (e) {
      notifications.show({
        title: 'Time mark failed',
        message: e.message || String(e),
        color: 'red',
      });
    } finally {
      setBusy(false);
    }
  };

  const closeName = () => {
    setNameOpen(false);
    setPending(null);
    setName('');
  };

  const submitName = async () => {
    if (!pending) {
      closeName();
      return;
    }
    const label = name.trim();
    if (!label) {
      closeName();
      return;
    }
    setBusy(true);
    try {
      await apiJson(`/api/time-markers/${encodeURIComponent(pending.id)}`, {
        method: 'PATCH',
        body: JSON.stringify({ name: label, time_ns: pending.time_ns }),
      });
      notifications.show({ title: 'Marker named', message: label, color: 'green' });
      bumpList();
      closeName();
    } catch (e) {
      notifications.show({
        title: 'Name failed',
        message: e.message || String(e),
        color: 'red',
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="flex items-center gap-1">
        <Button
          variant="secondary"
          size="sm"
          onClick={mark}
          disabled={busy}
          className="h-8 gap-1.5 px-2.5 text-[13px]"
          title="Save a timestamp marker now"
        >
          <Bookmark size={13} strokeWidth={1.75} />
          Time Mark
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setListOpen(true)}
          className="h-8 gap-1.5 px-2.5 text-[13px]"
          title="View saved time markers"
        >
          <List size={13} strokeWidth={1.75} />
          Markers
        </Button>
      </div>

      <Dialog
        open={nameOpen}
        onOpenChange={(o) => {
          if (!o) closeName();
        }}
      >
        <DialogContent className="bg-popover sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display">Name time mark</DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground">
            Timestamp already saved
            {pending?.time_iso ? ` · ${pending.time_iso}` : ''}. Name is optional — close to leave
            unnamed.
          </p>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="time-mark-name" className="text-xs">
              Event name
            </Label>
            <Input
              id="time-mark-name"
              ref={inputRef}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. brake test start"
              className="h-8"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  submitName();
                }
              }}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeName} disabled={busy}>
              Skip
            </Button>
            <Button onClick={submitName} disabled={busy || !name.trim()}>
              Save name
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <TimeMarkersModal
        opened={listOpen}
        onClose={() => setListOpen(false)}
        refreshKey={listRefreshKey}
      />
    </>
  );
}
