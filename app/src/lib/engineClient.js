// engineClient — the UI's only door to the backend. REST for config/spec CRUD
// and start/stop; a single WS for live batches + status.
//
// Wire framing (backend/API_CONTRACT.md): each server→client frame is JSON
// `{ "type": "live_message_batch" | "status", "payload": any }`; client→server
// frames are `{ "type": "request_cache" | "reset_cache" }`. The Python backend
// owns the framing; this contract is the source of truth.

import {
  parseServerEnvelope,
  clientEnvelope,
  CLIENT_MESSAGE_TYPES,
} from './engineContract.js';
import { resolveApiBase } from './runtime.js';

function httpToWs(httpBase) {
  return httpBase.replace(/^http(s?):\/\//, (_m, s) => `ws${s}://`);
}

/**
 * Create an engine client bound to a base URL (default ws/http://127.0.0.1:8350).
 * @param {{ baseUrl?: string }} [opts]
 */
export function createEngineClient(opts = {}) {
  const httpBase = resolveApiBase({ explicit: opts.baseUrl });
  const wsUrl = `${httpToWs(httpBase)}/ws`;

  // ---- REST ----------------------------------------------------------------
  async function apiJson(path, options = {}) {
    if (!path.startsWith('/')) throw new Error(`path must start with '/': ${path}`);
    const res = await fetch(`${httpBase}${path}`, {
      headers: { 'Content-Type': 'application/json', ...options.headers },
      ...options,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const nested = typeof data.detail === 'object' && data.detail ? data.detail : null;
      const err = new Error(
        data.error?.detail || nested?.detail || data.detail || data.message || res.statusText,
      );
      err.status = res.status;
      err.title = data.error?.title || nested?.title;
      throw err;
    }
    return data;
  }

  const rest = {
    getConfig: () => apiJson('/api/config'),
    saveConfig: (config) =>
      apiJson('/api/config', { method: 'PUT', body: JSON.stringify(config) }),
    /** One-shot status (same shape as WS `status`); prefer WS for live updates. */
    getStatus: () => apiJson('/api/status'),
    start: () => apiJson('/api/start', { method: 'POST' }),
    stop: () => apiJson('/api/stop', { method: 'POST' }),
    listMdc: () => apiJson('/api/mdc'),
    getSpec: (specId) => apiJson(`/api/mdc/${encodeURIComponent(specId)}`),
    saveSpec: (specId, spec) =>
      apiJson(`/api/mdc/${encodeURIComponent(specId)}`, {
        method: 'PUT',
        body: JSON.stringify(spec),
      }),
    deleteSpec: (specId) =>
      apiJson(`/api/mdc/${encodeURIComponent(specId)}`, { method: 'DELETE' }),
    /** Import a .dbc file → v3 MDC document. Returns null when endpoint unavailable. */
    importDbc: async (file) => {
      const form = new FormData();
      form.append('file', file);
      const res = await fetch(`${httpBase}/api/mdc/import-dbc`, { method: 'POST', body: form });
      if (res.status === 404 || res.status === 501) return null;
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const err = new Error(data.detail || data.message || res.statusText);
        err.status = res.status;
        throw err;
      }
      return data;
    },
    // ---- Local settings + Embedded-Sharepoint (contract §4) ----------------
    getSharepointStatus: () => apiJson('/api/sharepoint/status'),
    cloneSharepoint: (body = {}) =>
      apiJson('/api/sharepoint/clone', { method: 'POST', body: JSON.stringify(body) }),
    fetchSharepoint: () => apiJson('/api/sharepoint/fetch', { method: 'POST' }),
    pullSharepoint: () => apiJson('/api/sharepoint/pull', { method: 'POST' }),
    pushSharepoint: (body = {}) =>
      apiJson('/api/sharepoint/push', { method: 'POST', body: JSON.stringify(body) }),
    checkoutSharepoint: (body) =>
      apiJson('/api/sharepoint/checkout', { method: 'POST', body: JSON.stringify(body) }),
    discardSharepoint: () => apiJson('/api/sharepoint/discard', { method: 'POST' }),
    getBranches: () => apiJson('/api/sharepoint/branches'),
    createBranch: (body) =>
      apiJson('/api/sharepoint/branches', { method: 'POST', body: JSON.stringify(body) }),
    stash: (body) =>
      apiJson('/api/sharepoint/stash', { method: 'POST', body: JSON.stringify(body) }),
    getSettings: () => apiJson('/api/settings'),
    updateSettings: (patch) =>
      apiJson('/api/settings', { method: 'PUT', body: JSON.stringify(patch) }),
    getVehicles: () => apiJson('/api/vehicles'),
    addVehicle: (name) =>
      apiJson('/api/vehicles', { method: 'POST', body: JSON.stringify({ name }) }),

    /** Export an MDC document → { dbc, warnings[] }. Returns null when endpoint unavailable. */
    exportDbc: async (spec) => {
      const res = await fetch(`${httpBase}/api/mdc/export-dbc`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(spec),
      });
      if (res.status === 404 || res.status === 501) return null;
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const err = new Error(data.detail || data.message || res.statusText);
        err.status = res.status;
        throw err;
      }
      return data;
    },
  };

  // ---- WS ------------------------------------------------------------------
  /** @type {WebSocket|null} */
  let ws = null;
  let shouldReconnect = false;
  let reconnectTimer = null;
  const listeners = { live_message_batch: new Set(), status: new Set(), open: new Set(), close: new Set() };

  const emit = (event, payload) => {
    const set = listeners[event];
    if (set) for (const fn of set) fn(payload);
  };

  function handleFrame(raw) {
    let frame;
    try {
      frame = JSON.parse(raw);
    } catch {
      return;
    }
    const parsed = parseServerEnvelope(frame);
    if (parsed) emit(parsed.type, parsed.payload);
  }

  /** Send a client→server envelope; no-op if the socket isn't open. */
  function send(type) {
    if (ws?.readyState !== WebSocket.OPEN) return false;
    ws.send(JSON.stringify(clientEnvelope(type)));
    return true;
  }

  function connect() {
    if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return;
    shouldReconnect = true;
    // Never let a bad URL (e.g. an unexpected origin) throw out of an effect and
    // unmount the UI — degrade to "disconnected" instead.
    try {
      ws = new WebSocket(wsUrl);
    } catch {
      ws = null;
      emit('close');
      return;
    }
    ws.onopen = () => emit('open');
    ws.onmessage = (ev) => handleFrame(ev.data);
    ws.onclose = () => {
      emit('close');
      if (shouldReconnect) {
        clearTimeout(reconnectTimer);
        reconnectTimer = setTimeout(connect, 1000);
      }
    };
    ws.onerror = () => ws?.close();
  }

  function disconnect() {
    shouldReconnect = false;
    clearTimeout(reconnectTimer);
    if (ws) {
      ws.onclose = null;
      ws.close();
      ws = null;
    }
  }

  /** Subscribe to a WS event; returns an unsubscribe fn. */
  function on(event, fn) {
    const set = listeners[event];
    if (!set) throw new Error(`unknown event: ${event}`);
    set.add(fn);
    return () => set.delete(fn);
  }

  return {
    httpBase,
    wsUrl,
    apiJson,
    ...rest,
    connect,
    disconnect,
    on,
    requestCache: () => send(CLIENT_MESSAGE_TYPES.REQUEST_CACHE),
    resetCache: () => send(CLIENT_MESSAGE_TYPES.RESET_CACHE),
    get connected() {
      return ws?.readyState === WebSocket.OPEN;
    },
  };
}

export const engineClient = createEngineClient();
