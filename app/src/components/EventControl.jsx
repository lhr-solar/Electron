import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActionIcon,
  Badge,
  Button,
  Collapse,
  Group,
  Stack,
  Text,
  TextInput,
  UnstyledButton,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { ChevronDown, ChevronUp, Circle, Square } from 'lucide-react';
import { createEventsClient } from '../lib/eventsClient.js';
import { useEngineClient, useEngineStatus } from '../lib/useEngine.jsx';

function formatTs(ns) {
  if (!ns) return '—';
  const d = new Date(Number(ns) / 1e6);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString();
}

function recentWindow() {
  const to = new Date();
  const from = new Date(to.getTime() - 24 * 60 * 60 * 1000);
  return { from: from.toISOString(), to: to.toISOString() };
}

export default function EventControl() {
  const client = useEngineClient();
  const { status } = useEngineStatus();
  const events = useMemo(
    () => createEventsClient((path, opts) => client.apiJson(path, opts)),
    [client],
  );

  const [available, setAvailable] = useState(null);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [recent, setRecent] = useState([]);
  const [showRecent, setShowRecent] = useState(false);

  const active = status.active_event ?? null;

  const refreshRecent = useCallback(async () => {
    if (available === false) return;
    const list = await events.listRecent(recentWindow());
    setRecent(list.slice(0, 8));
  }, [available, events]);

  useEffect(() => {
    let cancelled = false;
    events.probe().then((ok) => {
      if (!cancelled) setAvailable(ok);
    });
    return () => {
      cancelled = true;
    };
  }, [events]);

  useEffect(() => {
    if (available) refreshRecent();
  }, [available, active?.id, refreshRecent]);

  if (available === false) return null;

  const run = async (label, fn) => {
    setBusy(true);
    try {
      await fn();
      await refreshRecent();
    } catch (e) {
      notifications.show({ title: `${label} failed`, message: e.message, color: 'red' });
    } finally {
      setBusy(false);
    }
  };

  const start = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    return run('Start event', async () => {
      await events.start({ name: trimmed });
      setName('');
    });
  };

  const stop = () => {
    if (!active?.id) return;
    return run('Stop event', () => events.stop(active.id));
  };

  return (
    <Stack gap={4} style={{ minWidth: 0 }}>
      <Group gap="xs" wrap="nowrap">
        <TextInput
          placeholder="Event name"
          value={name}
          onChange={(e) => setName(e.currentTarget.value)}
          onKeyDown={(e) => e.key === 'Enter' && start()}
          disabled={busy || Boolean(active)}
          size="xs"
          style={{ width: 140 }}
        />
        <Button
          size="xs"
          leftSection={<Circle size={12} />}
          onClick={start}
          disabled={busy || Boolean(active) || !name.trim()}
        >
          Start
        </Button>
        <Button
          size="xs"
          color="red"
          variant="light"
          leftSection={<Square size={12} />}
          onClick={stop}
          disabled={busy || !active}
        >
          Stop
        </Button>
        {active ? (
          <Badge color="green" variant="dot" size="sm">
            {active.name}
          </Badge>
        ) : (
          <Text size="xs" c="dimmed">
            No active event
          </Text>
        )}
        <UnstyledButton
          onClick={() => setShowRecent((v) => !v)}
          title="Recent events"
          style={{ color: 'var(--text-muted)', display: 'flex', alignItems: 'center' }}
        >
          {showRecent ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </UnstyledButton>
      </Group>
      <Collapse in={showRecent}>
        <Stack gap={2} pl={4}>
          {recent.length === 0 ? (
            <Text size="xs" c="dimmed">
              No recent events
            </Text>
          ) : (
            recent.map((ev) => (
              <Group key={ev.id} gap="xs" wrap="nowrap">
                <Text size="xs" fw={500} truncate style={{ maxWidth: 120 }}>
                  {ev.name}
                </Text>
                <Text size="xs" c="dimmed">
                  {formatTs(ev.start_ts_ns)}
                  {ev.end_ts_ns ? ` → ${formatTs(ev.end_ts_ns)}` : ' (active)'}
                </Text>
              </Group>
            ))
          )}
          <ActionIcon
            variant="subtle"
            size="xs"
            onClick={refreshRecent}
            title="Refresh recent events"
            aria-label="Refresh recent events"
          >
            ↻
          </ActionIcon>
        </Stack>
      </Collapse>
    </Stack>
  );
}
