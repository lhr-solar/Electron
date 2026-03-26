import React, { useState, useEffect, useRef, useCallback, useMemo, useDeferredValue } from 'react';
import { Box, Text, Stack, Collapse, TextInput, Button, Group, UnstyledButton } from '@mantine/core';
import { ChevronsDown, Play, Pause } from 'lucide-react';
import { socket } from '../socket';

const MAX_MESSAGES = 500;
const LIVE_LOG_WIDTH = 320;
const SCROLL_THRESHOLD = 20;
const UI_FLUSH_INTERVAL_MS = 80;
const ESTIMATED_ROW_HEIGHT = 72;
const OVERSCAN_ROWS = 8;

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

function formatValue3(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    const s = value.toFixed(3);
    return s.replace(/\.?0+$/, '');
  }
  const num = Number(value);
  if (Number.isFinite(num)) {
    const s = num.toFixed(3);
    return s.replace(/\.?0+$/, '');
  }
  return String(value);
}

export function LiveMessageLog() {
  const [messages, setMessages] = useState([]);
  const [expandedId, setExpandedId] = useState(null);
  const [search, setSearch] = useState('');
  const [autoScroll, setAutoScroll] = useState(true);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [paused, setPaused] = useState(false);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(0);
  const scrollRef = useRef(null);
  const nextIdRef = useRef(0);
  const pausedRef = useRef(false);
  const autoScrollRef = useRef(true);
  const pendingMsgsRef = useRef([]);

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
    autoScrollRef.current = autoScroll;
  }, [autoScroll]);

  useEffect(() => {
    const onLiveMessageBatch = (batch) => {
      if (!Array.isArray(batch) || batch.length === 0) return;
      if (pausedRef.current) return;
      for (const payload of batch) {
        pendingMsgsRef.current.push({ id: nextIdRef.current++, ...payload });
      }
    };
    socket.on('live_message_batch', onLiveMessageBatch);
    return () => socket.off('live_message_batch', onLiveMessageBatch);
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      if (pausedRef.current) return;
      const pending = pendingMsgsRef.current;
      if (pending.length === 0) return;
      pendingMsgsRef.current = [];
      setMessages((prev) => [...prev, ...pending].slice(-MAX_MESSAGES));
      if (autoScrollRef.current) {
        requestAnimationFrame(() => scrollToBottom());
      }
    }, UI_FLUSH_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [scrollToBottom]);

  const togglePause = useCallback(() => {
    setPaused((p) => {
      const next = !p;
      pausedRef.current = next;
      if (!next) {
        // Resume from a clean queue to avoid large burst rendering.
        pendingMsgsRef.current = [];
      }
      return next;
    });
  }, []);

  const handleScroll = useCallback(() => {
    const atBottom = checkAtBottom();
    setIsAtBottom(atBottom);
    const el = scrollRef.current;
    if (el) setScrollTop(el.scrollTop);
  }, [checkAtBottom]);

  const deferredSearch = useDeferredValue(search);
  const searchLower = deferredSearch.trim().toLowerCase();
  const filtered = useMemo(
    () => (searchLower ? messages.filter((msg) => matchesSearch(msg, searchLower)) : messages),
    [messages, searchLower]
  );

  const totalRows = filtered.length;
  const startIndex = Math.max(0, Math.floor(scrollTop / ESTIMATED_ROW_HEIGHT) - OVERSCAN_ROWS);
  const visibleRowCount = Math.ceil((viewportHeight || 0) / ESTIMATED_ROW_HEIGHT) + OVERSCAN_ROWS * 2;
  const endIndex = Math.min(totalRows, startIndex + Math.max(visibleRowCount, 30));
  const visibleRows = useMemo(
    () => filtered.slice(startIndex, endIndex),
    [filtered, startIndex, endIndex]
  );
  const topSpacerHeight = startIndex * ESTIMATED_ROW_HEIGHT;
  const bottomSpacerHeight = Math.max(0, (totalRows - endIndex) * ESTIMATED_ROW_HEIGHT);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return undefined;
    const updateSize = () => setViewportHeight(el.clientHeight || 0);
    updateSize();
    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(updateSize);
      ro.observe(el);
      return () => ro.disconnect();
    }
    window.addEventListener('resize', updateSize);
    return () => window.removeEventListener('resize', updateSize);
  }, []);

  return (
    <Box
      style={{
        width: LIVE_LOG_WIDTH,
        minWidth: LIVE_LOG_WIDTH,
        height: '100%',
        maxHeight: '100%',
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
          {paused ? (
            <Play
              size={18}
              strokeWidth={2.5}
              style={{ color: '#facc15' }} // yellow highlight when paused
            />
          ) : (
            <Pause
              size={18}
              strokeWidth={2.5}
              style={{ color: 'var(--mantine-color-dimmed)' }}
            />
          )}
          <Text
            size="xs"
            c={paused ? 'yellow' : 'dimmed'}
            style={{ lineHeight: 1 }}
          >
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
          {topSpacerHeight > 0 && <Box style={{ height: topSpacerHeight }} />}
          {visibleRows.map((msg) => {
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
                <Group gap={6} wrap="nowrap">
                  <Text size="sm" style={{ color: msg.message_name != null ? 'var(--text)' : '#ef4444' }}>
                    {msg.can_id_hex}
                    {msg.message_name != null ? ` · ${msg.message_name}` : ' · Not Found'}
                  </Text>
                  {msg.sender && <Text size="xs" c="dimmed" style={{ opacity: 0.5, flexShrink: 0 }}>{msg.sender}</Text>}
                </Group>
                <Collapse in={isExpanded}>
                  <Stack gap={4} mt="xs" pl="xs" style={{ borderLeft: '2px solid var(--border)' }}>
                    {(msg.vehicle || msg.network) && (
                      <Text size="xs" style={{ color: '#6d9eeb', opacity: 0.8, fontStyle: 'italic' }}>
                        {[msg.vehicle, msg.network].filter(Boolean).join(' · ')}
                      </Text>
                    )}
                    {hasSignals && Object.entries(msg.signals).map(([name, value]) => {
                      const unit = msg.units && msg.units[name];
                      return (
                        <Text key={name} size="xs" style={{ color: 'var(--text-muted)' }}>
                          {name}: {formatValue3(value)}{unit ? ` ${unit}` : ''}
                        </Text>
                      );
                    })}
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
          {bottomSpacerHeight > 0 && <Box style={{ height: bottomSpacerHeight }} />}
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
