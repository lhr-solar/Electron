import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Box, Text, Stack, Collapse } from '@mantine/core';
import { socket } from '../socket';

const MAX_MESSAGES = 500;
const LIVE_LOG_WIDTH = 320;

function formatTime(timestampNs) {
  const ms = Number(timestampNs) / 1e6;
  const d = new Date(ms);
  return d.toISOString().slice(11, 23);
}

export function LiveMessageLog() {
  const [messages, setMessages] = useState([]);
  const [expandedId, setExpandedId] = useState(null);
  const scrollRef = useRef(null);
  const atBottomRef = useRef(true);
  const nextIdRef = useRef(0);

  const checkAtBottom = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return true;
    const { scrollTop, scrollHeight, clientHeight } = el;
    return scrollTop + clientHeight >= scrollHeight - 20;
  }, []);

  const scrollToBottom = useCallback(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, []);

  useEffect(() => {
    const onLiveMessageBatch = (batch) => {
      if (!Array.isArray(batch) || batch.length === 0) return;
      const newMsgs = batch.map((payload) => ({ id: nextIdRef.current++, ...payload }));
      setMessages((prev) => {
        const next = [...prev, ...newMsgs].slice(-MAX_MESSAGES);
        return next;
      });
      if (atBottomRef.current) {
        requestAnimationFrame(() => scrollToBottom());
      }
    };
    socket.on('live_message_batch', onLiveMessageBatch);
    return () => socket.off('live_message_batch', onLiveMessageBatch);
  }, [scrollToBottom]);

  const handleScroll = useCallback(() => {
    atBottomRef.current = checkAtBottom();
  }, [checkAtBottom]);

  return (
    <Box
      style={{
        width: LIVE_LOG_WIDTH,
        minWidth: LIVE_LOG_WIDTH,
        borderLeft: '1px solid var(--border)',
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: '#0a0a0b',
      }}
    >
      <Text size="xs" c="dimmed" tt="uppercase" p="md" pb="xs" style={{ borderBottom: '1px solid var(--border)' }}>
        Live messages
      </Text>
      <Box
        ref={scrollRef}
        onScroll={handleScroll}
        style={{
          flex: 1,
          overflow: 'auto',
          padding: 8,
        }}
      >
        <Stack gap={4}>
          {messages.map((msg) => {
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
                  cursor: hasSignals ? 'pointer' : 'default',
                }}
                onClick={() => hasSignals && setExpandedId((x) => (x === msg.id ? null : msg.id))}
              >
                <Text size="xs" c="dimmed" style={{ marginBottom: 2 }}>
                  {formatTime(msg.timestamp_ns)}
                </Text>
                <Text size="sm" style={{ color: 'var(--text)' }}>
                  {msg.can_id_hex}
                  {msg.message_name != null ? ` · ${msg.message_name}` : ' | Not Found'}
                </Text>
                {hasSignals && (
                  <Collapse in={isExpanded}>
                    <Stack gap={4} mt="xs" pl="xs" style={{ borderLeft: '2px solid var(--border)' }}>
                      {Object.entries(msg.signals).map(([name, value]) => (
                        <Text key={name} size="xs" style={{ color: 'var(--text-muted)' }}>
                          {name}: {String(value)}
                        </Text>
                      ))}
                    </Stack>
                  </Collapse>
                )}
              </Box>
            );
          })}
        </Stack>
      </Box>
    </Box>
  );
}
