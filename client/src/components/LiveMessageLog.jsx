import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Box, Text, Stack, Collapse, TextInput, Button, Group, UnstyledButton } from '@mantine/core';
import { ChevronsDown, Play, Pause } from 'lucide-react';
import { socket } from '../socket';

const MAX_MESSAGES = 500;
const LIVE_LOG_WIDTH = 320;
const SCROLL_THRESHOLD = 20;

function formatTime(timestampNs) {
  const ms = Number(timestampNs) / 1e6;
  const d = new Date(ms);
  return d.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit', fractionalSecondDigits: 3 });
}

function matchesSearch(msg, searchLower) {
  if (!searchLower.trim()) return true;
  const idMatch = (msg.can_id_hex || '').toLowerCase().includes(searchLower);
  const nameMatch = (msg.message_name != null ? String(msg.message_name) : '')
    .toLowerCase()
    .includes(searchLower);
  return idMatch || nameMatch;
}

export function LiveMessageLog() {
  const [messages, setMessages] = useState([]);
  const [expandedId, setExpandedId] = useState(null);
  const [search, setSearch] = useState('');
  const [autoScroll, setAutoScroll] = useState(true);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [paused, setPaused] = useState(false);
  const scrollRef = useRef(null);
  const nextIdRef = useRef(0);
  const pausedRef = useRef(false);

  const checkAtBottom = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return true;
    const { scrollTop, scrollHeight, clientHeight } = el;
    return scrollTop + clientHeight >= scrollHeight - SCROLL_THRESHOLD;
  }, []);

  const scrollToBottom = useCallback(() => {
    const el = scrollRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
      setIsAtBottom(true);
    }
  }, []);

  useEffect(() => {
    const onLiveMessageBatch = (batch) => {
      if (!Array.isArray(batch) || batch.length === 0) return;
      const newMsgs = batch.map((payload) => ({ id: nextIdRef.current++, ...payload }));
      if (pausedRef.current) return;
      setMessages((prev) => {
        const next = [...prev, ...newMsgs].slice(-MAX_MESSAGES);
        return next;
      });
      if (autoScroll) {
        requestAnimationFrame(() => scrollToBottom());
      }
    };
    socket.on('live_message_batch', onLiveMessageBatch);
    return () => socket.off('live_message_batch', onLiveMessageBatch);
  }, [autoScroll, scrollToBottom]);

  const togglePause = useCallback(() => {
    setPaused((p) => {
      const next = !p;
      pausedRef.current = next;
      return next;
    });
  }, []);

  const handleScroll = useCallback(() => {
    const atBottom = checkAtBottom();
    setIsAtBottom(atBottom);
  }, [checkAtBottom]);

  const searchLower = search.trim().toLowerCase();
  const filtered = searchLower
    ? messages.filter((msg) => matchesSearch(msg, searchLower))
    : messages;

  return (
    <Box
      style={{
        width: LIVE_LOG_WIDTH,
        minWidth: LIVE_LOG_WIDTH,
        height: '100vh',
        maxHeight: '100vh',
        borderLeft: '1px solid var(--border)',
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: '#0a0a0b',
        overflow: 'hidden',
      }}
    >
      <Text size="xs" c="dimmed" tt="uppercase" p="md" pb="xs" style={{ borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        Live messages
      </Text>
      <Group gap="xs" p="xs" style={{ flexShrink: 0, borderBottom: '1px solid var(--border)' }}>
        <TextInput
          placeholder="Filter by ID or name..."
          size="xs"
          value={search}
          onChange={(e) => setSearch(e.currentTarget.value)}
          style={{ flex: 1, minWidth: 0 }}
          styles={{ input: { backgroundColor: '#0f0f11' } }}
        />
        <UnstyledButton
          onClick={togglePause}
          title={paused ? 'Resume updates' : 'Pause updates'}
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 2,
            padding: '4px 6px',
            borderRadius: 4,
            width: 44,
            minWidth: 44,
            flexShrink: 0,
          }}
        >
          {paused
            ? <Play size={18} strokeWidth={2.5} style={{ color: 'var(--mantine-color-anchor)' }} />
            : <Pause size={18} strokeWidth={2.5} style={{ color: 'var(--mantine-color-dimmed)' }} />
          }
          <Text size="xs" c="dimmed" style={{ lineHeight: 1 }}>
            {paused ? 'Play' : 'Pause'}
          </Text>
        </UnstyledButton>
        <UnstyledButton
          onClick={() => setAutoScroll((a) => !a)}
          title={autoScroll ? 'Scroll mode: follow latest' : 'Scroll mode: stay at position'}
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 2,
            padding: '4px 6px',
            borderRadius: 4,
            width: 44,
            minWidth: 44,
            flexShrink: 0,
          }}
        >
          <ChevronsDown
            size={20}
            strokeWidth={2.5}
            style={{
              color: autoScroll ? 'var(--mantine-color-anchor)' : 'var(--mantine-color-dimmed)',
            }}
          />
          <Text size="xs" c="dimmed" style={{ lineHeight: 1 }}>
            {autoScroll ? 'Follow' : 'Pin'}
          </Text>
        </UnstyledButton>
      </Group>
      <Box
        ref={scrollRef}
        onScroll={handleScroll}
        style={{
          flex: 1,
          minHeight: 0,
          overflow: 'auto',
          padding: 8,
          position: 'relative',
        }}
      >
        <Stack gap={4}>
          {filtered.map((msg) => {
            const isExpanded = expandedId === msg.id;
            const hasSignals = msg.signals && Object.keys(msg.signals).length > 0;
            return (
              <Box
                key={msg.id}
                style={{
                  border: '1px solid var(--border)',
                  borderRadius: 4,
                  padding: '6px 8px',
                  backgroundColor: '#0f0f11',
                  cursor: 'pointer',
                }}
                onClick={() => setExpandedId((x) => (x === msg.id ? null : msg.id))}
              >
                <Text size="xs" c="dimmed" style={{ marginBottom: 2 }}>
                  {formatTime(msg.timestamp_ns)}
                </Text>
                <Text size="sm" style={{ color: msg.message_name != null ? 'var(--text)' : '#ef4444' }}>
                  {msg.can_id_hex}
                  {msg.message_name != null ? ` · ${msg.message_name}` : ' · Not Found'}
                </Text>
                <Collapse in={isExpanded}>
                  <Stack gap={4} mt="xs" pl="xs" style={{ borderLeft: '2px solid var(--border)' }}>
                    {hasSignals && Object.entries(msg.signals).map(([name, value]) => (
                      <Text key={name} size="xs" style={{ color: 'var(--text-muted)' }}>
                        {name}: {String(value)}
                      </Text>
                    ))}
                    {msg.raw_packet && (
                      <Text size="xs" c="dimmed" style={{ fontFamily: 'monospace', opacity: 0.6 }}>
                        {msg.raw_packet}
                      </Text>
                    )}
                  </Stack>
                </Collapse>
              </Box>
            );
          })}
        </Stack>
        {!isAtBottom && (
          <Button
            size="xs"
            variant="filled"
            onClick={scrollToBottom}
            style={{
              position: 'sticky',
              bottom: 12,
              left: '50%',
              transform: 'translateX(-50%)',
              boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
            }}
          >
            Scroll to bottom
          </Button>
        )}
      </Box>
    </Box>
  );
}
