import React, { useState, useEffect, useRef, useCallback, useMemo, useDeferredValue } from 'react';
import { ChevronsDown, Play, Pause } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Collapsible, CollapsibleContent } from '@/components/ui/collapsible';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
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
    <div
      className={cn(
        'flex flex-col overflow-hidden',
        stage
          ? 'mx-auto w-full max-w-[720px] rounded-xl border border-border-strong bg-gradient-to-b from-card to-background font-mono shadow-[0_18px_48px_rgba(0,0,0,0.45)]'
          : 'h-full w-full shrink-0 border-l border-border bg-background'
      )}
      style={
        stage
          ? { height: 'min(78vh, 820px)' }
          : { width: LIVE_LOG_WIDTH, minWidth: LIVE_LOG_WIDTH }
      }
    >
      <div
        className={cn(
          'flex shrink-0 items-center justify-between gap-2 border-b border-border px-4',
          stage ? 'py-2' : 'pb-1 pt-4'
        )}
      >
        <span
          className={cn(
            stage
              ? 'font-display text-sm font-semibold tracking-wide text-foreground/90'
              : 'text-xs uppercase text-muted-foreground'
          )}
        >
          {stage ? 'Live CAN' : 'Live messages'}
        </span>
        {stage ? (
          <span className="text-xs text-muted-foreground">{filtered.length} shown</span>
        ) : null}
      </div>

      <div
        className={cn(
          'flex shrink-0 items-center gap-1 overflow-hidden border-b border-border p-1',
          stage && 'bg-white/[0.02]'
        )}
      >
        <Input
          placeholder="Filter by ID or name..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className={cn(
            'h-7 min-w-0 flex-1 text-xs',
            stage ? 'border-border-strong bg-background' : 'bg-muted'
          )}
        />
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={togglePause}
              className={cn(paused ? 'text-signal-amber' : 'text-muted-foreground')}
            >
              {paused ? <Play className="size-4" strokeWidth={2.5} /> : <Pause className="size-4" strokeWidth={2.5} />}
            </Button>
          </TooltipTrigger>
          <TooltipContent>{paused ? 'Resume updates' : 'Pause updates'}</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => setAutoScroll((a) => !a)}
              className={cn(autoScroll ? 'text-signal-blue' : 'text-muted-foreground')}
            >
              <ChevronsDown className="size-4" strokeWidth={2.5} />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            {autoScroll ? 'Scroll mode: follow latest' : 'Scroll mode: stay at position'}
          </TooltipContent>
        </Tooltip>
      </div>

      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className={cn(
          'relative min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto',
          stage ? 'p-3' : 'p-2'
        )}
      >
        <div className={cn('flex w-full min-w-0 flex-col', stage ? 'gap-1.5' : 'gap-1')}>
          {topSpacerHeight > 0 && <div style={{ height: topSpacerHeight }} />}
          {visibleRows.map((msg) => {
            const isExpanded = expandedId === msg.id;
            const hasSignals = msg.signals && Object.keys(msg.signals).length > 0;
            return (
              <div
                key={msg.id}
                className={cn(
                  'min-w-0 max-w-full cursor-pointer overflow-hidden rounded-md border box-border',
                  stage
                    ? 'border-border-strong bg-white/[0.03] px-2.5 py-2'
                    : 'border-border bg-card px-2 py-1.5'
                )}
                onClick={() => setExpandedId((x) => (x === msg.id ? null : msg.id))}
              >
                <p className="tabular mb-0.5 text-xs text-muted-foreground">
                  {formatTime(msg.timestamp_ns)}
                </p>
                <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                  <p
                    className={cn(
                      'min-w-0 flex-1 text-sm break-words',
                      msg.message_name != null
                        ? 'text-foreground'
                        : 'text-signal-red'
                    )}
                  >
                    <span className="tabular">{msg.can_id_hex}</span>
                    {msg.message_name != null ? ` · ${msg.message_name}` : ' · Not Found'}
                  </p>
                  {msg.sender && (
                    <span className="shrink-0 text-xs text-muted-foreground/50 break-words">
                      {msg.sender}
                    </span>
                  )}
                </div>
                <Collapsible open={isExpanded}>
                  <CollapsibleContent>
                    <div className="mt-1 flex min-w-0 flex-col gap-1 overflow-hidden border-l-2 border-border pl-2">
                      {(msg.vehicle || msg.network) && (
                        <p className="text-xs italic text-signal-blue/80">
                          {[msg.vehicle, msg.network].filter(Boolean).join(' · ')}
                        </p>
                      )}
                      {hasSignals && Object.entries(msg.signals).map(([name, value]) => {
                        const unit = msg.units && msg.units[name];
                        return (
                          <p key={name} className="text-xs break-words text-muted-foreground">
                            {name}: <span className="tabular">{formatValue3(value)}</span>
                            {unit ? ` ${unit}` : ''}
                          </p>
                        );
                      })}
                      {msg.raw_packet && (
                        <p className="tabular text-xs break-all text-muted-foreground/60">
                          {msg.raw_packet}
                        </p>
                      )}
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              </div>
            );
          })}
          {bottomSpacerHeight > 0 && <div style={{ height: bottomSpacerHeight }} />}
        </div>
        {!isAtBottom && (
          <Button
            size="xs"
            onClick={scrollToBottom}
            className="sticky bottom-3 left-1/2 -translate-x-1/2 shadow-[0_2px_8px_rgba(0,0,0,0.4)]"
          >
            Scroll to bottom
          </Button>
        )}
      </div>
    </div>
  );

  if (!stage) return panel;

  return (
    <div className="flex h-full w-full min-h-0 flex-1 items-center justify-center bg-[radial-gradient(ellipse_at_50%_30%,#16161c_0%,#0a0a0b_55%,#070708_100%)] px-4 py-6">
      {panel}
    </div>
  );
}
