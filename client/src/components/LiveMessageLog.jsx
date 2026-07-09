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

/** variant: "sidebar" (default) | "stage" (server-mode centered live log) */
export function LiveMessageLog({ variant = 'sidebar' }) {
  const stage = variant === 'stage';
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

  const panel = (
    <Box
      style={
        stage
          ? {
              width: 'min(720px, 100%)',
              height: 'min(78vh, 820px)',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
              borderRadius: 12,
              border: '1px solid #2a2a30',
              background: 'linear-gradient(180deg, #121216 0%, #0c0c0f 100%)',
              boxShadow: '0 18px 48px rgba(0,0,0,0.45)',
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
            }
          : {
              width: LIVE_LOG_WIDTH,
              minWidth: LIVE_LOG_WIDTH,
              height: '100%',
              maxHeight: '100%',
              borderLeft: '1px solid var(--border)',
              display: 'flex',
              flexDirection: 'column',
              backgroundColor: 'var(--bg)',
              overflow: 'hidden',
            }
      }
    >
      <Group
        justify="space-between"
        align="center"
        wrap="nowrap"
        px={stage ? 'md' : 'md'}
        py={stage ? 'sm' : undefined}
        pb={stage ? undefined : 'xs'}
        style={{
          borderBottom: stage ? '1px solid #26262c' : '1px solid var(--border)',
          flexShrink: 0,
          paddingTop: stage ? undefined : 16,
        }}
      >
        <Text
          size={stage ? 'sm' : 'xs'}
          c={stage ? '#d4d4d8' : 'dimmed'}
          tt={stage ? undefined : 'uppercase'}
          fw={stage ? 600 : undefined}
          style={stage ? { letterSpacing: '0.04em' } : undefined}
        >
          {stage ? 'Live CAN' : 'Live messages'}
        </Text>
        {stage ? (
          <Text size="xs" c="#71717a">
            {filtered.length} shown
          </Text>
        ) : null}
      </Group>
      <Group
        gap="xs"
        p="xs"
        wrap="nowrap"
        style={{
          flexShrink: 0,
          borderBottom: stage ? '1px solid #26262c' : '1px solid var(--border)',
          minWidth: 0,
          overflow: 'hidden',
          background: stage ? 'rgba(255,255,255,0.02)' : undefined,
        }}
      >
        <TextInput
          placeholder="Filter by ID or name..."
          size="xs"
          value={search}
          onChange={(e) => setSearch(e.currentTarget.value)}
          style={{ flex: 1, minWidth: 0 }}
          styles={{
            input: {
              backgroundColor: stage ? '#0a0a0d' : 'var(--bg-elevated)',
              borderColor: stage ? '#2a2a30' : undefined,
              fontFamily: 'inherit',
            },
          }}
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
            <Play size={18} strokeWidth={2.5} style={{ color: '#facc15' }} />
          ) : (
            <Pause size={18} strokeWidth={2.5} style={{ color: 'var(--mantine-color-dimmed)' }} />
          )}
          <Text size="xs" c={paused ? 'yellow' : 'dimmed'} style={{ lineHeight: 1 }}>
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
          minWidth: 0,
          overflowX: 'hidden',
          overflowY: 'auto',
          padding: stage ? 12 : 8,
          position: 'relative',
        }}
      >
        <Stack gap={stage ? 6 : 4} style={{ minWidth: 0, width: '100%', boxSizing: 'border-box' }}>
          {topSpacerHeight > 0 && <Box style={{ height: topSpacerHeight }} />}
          {visibleRows.map((msg) => {
            const isExpanded = expandedId === msg.id;
            const hasSignals = msg.signals && Object.keys(msg.signals).length > 0;
            return (
              <Box
                key={msg.id}
                style={{
                  border: stage ? '1px solid #2a2a30' : '1px solid var(--border)',
                  borderRadius: stage ? 6 : 4,
                  padding: stage ? '8px 10px' : '6px 8px',
                  backgroundColor: stage ? 'rgba(255,255,255,0.03)' : 'var(--bg-elevated)',
                  cursor: 'pointer',
                  minWidth: 0,
                  maxWidth: '100%',
                  overflow: 'hidden',
                  boxSizing: 'border-box',
                }}
                onClick={() => setExpandedId((x) => (x === msg.id ? null : msg.id))}
              >
                <Text size="xs" c="dimmed" style={{ marginBottom: 2, fontVariantNumeric: 'tabular-nums' }}>
                  {formatTime(msg.timestamp_ns)}
                </Text>
                <Group gap={6} wrap="wrap" style={{ minWidth: 0 }}>
                  <Text
                    size="sm"
                    style={{
                      color: msg.message_name != null ? (stage ? '#e4e4e7' : 'var(--text)') : '#ef4444',
                      minWidth: 0,
                      flex: 1,
                      overflowWrap: 'anywhere',
                      wordBreak: 'break-word',
                    }}
                  >
                    {msg.can_id_hex}
                    {msg.message_name != null ? ` · ${msg.message_name}` : ' · Not Found'}
                  </Text>
                  {msg.sender && (
                    <Text size="xs" c="dimmed" style={{ opacity: 0.5, flexShrink: 0, overflowWrap: 'anywhere' }}>
                      {msg.sender}
                    </Text>
                  )}
                </Group>
                <Collapse in={isExpanded}>
                  <Stack gap={4} mt="xs" pl="xs" style={{ borderLeft: '2px solid var(--border)', minWidth: 0, overflow: 'hidden' }}>
                    {(msg.vehicle || msg.network) && (
                      <Text size="xs" style={{ color: '#6d9eeb', opacity: 0.8, fontStyle: 'italic' }}>
                        {[msg.vehicle, msg.network].filter(Boolean).join(' · ')}
                      </Text>
                    )}
                    {hasSignals && Object.entries(msg.signals).map(([name, value]) => {
                      const unit = msg.units && msg.units[name];
                      return (
                        <Text key={name} size="xs" style={{ color: 'var(--text-muted)', overflowWrap: 'anywhere', wordBreak: 'break-word' }}>
                          {name}: {formatValue3(value)}{unit ? ` ${unit}` : ''}
                        </Text>
                      );
                    })}
                    {msg.raw_packet && (
                      <Text size="xs" c="dimmed" style={{ fontFamily: 'monospace', opacity: 0.6, overflowWrap: 'anywhere', wordBreak: 'break-all' }}>
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

  if (!stage) return panel;

  return (
    <Box
      style={{
        flex: 1,
        minHeight: 0,
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px 16px',
        background:
          'radial-gradient(ellipse at 50% 30%, #16161c 0%, #0a0a0b 55%, #070708 100%)',
      }}
    >
      {panel}
    </Box>
  );
}
