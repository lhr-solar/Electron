// API contract (mirrors the v3 envelopes; see AGENTS.md "three contracts").
//
// Source of truth: backend/API_CONTRACT.md — the API is served by the Python
// backend (FastAPI), whose payload shapes mirror the v3 reference:
//   - WS "live_message_batch": server/services/telemetry.py (_emit_live_messages)
//   - WS "status":             server/app.py (build_status_payload)
//   - per-message item:        server/util/async_processor.py (process_packets)
//
// Server→client frames use the typed envelope `{ type, payload }`; the payloads
// below are the unchanged v3 data. These are plain runtime guards/normalizers —
// no TypeScript, no schema lib — kept tiny on purpose. The backend is the only
// authority over the wire format; the UI is a pure client.

/**
 * @typedef {Object} EngineMessage
 * @property {number} timestamp_ns
 * @property {string} can_id_hex
 * @property {string} message_name
 * @property {Object<string, *>} signals
 * @property {string} [network]
 * @property {string} [sender]
 * @property {string} [vehicle]
 * @property {Object<string, string>} [units]
 * @property {number|null} [array_index]
 * @property {string} [raw_packet]
 */

/**
 * @typedef {Object} EngineStatus
 * @property {boolean} service_running
 * @property {boolean} influx_connected
 * @property {boolean} grafana_active
 * @property {string} [grafana_url]
 * @property {'idle'|'running'|'error'|'finished'} parser_status
 * @property {string|null} [parser_connection_state]
 * @property {string|null} [error_message]
 * @property {string[]} [dbc_errors]
 * @property {string} [influx_bucket]
 * @property {string} [vehicle]
 * @property {{ id: string, name: string, start_ts_ns: number, end_ts_ns?: number|null, tags?: string[], note?: string }|null} [active_event]
 */

export const DEFAULT_STATUS = Object.freeze({
  service_running: false,
  influx_connected: false,
  grafana_active: false,
  grafana_url: undefined,
  parser_status: 'idle',
  parser_connection_state: null,
  error_message: null,
  dbc_errors: [],
  influx_bucket: undefined,
  vehicle: undefined,
  active_event: null,
});

const isObject = (v) => v != null && typeof v === 'object' && !Array.isArray(v);

/**
 * Normalize one wire item into an EngineMessage, or return null if it is not a
 * usable message. Tolerant by design: the engine owns the shape and may add
 * fields, so we only require the identity + payload keys the UI depends on.
 * @param {unknown} raw
 * @returns {EngineMessage|null}
 */
export function parseEngineMessage(raw) {
  if (!isObject(raw)) return null;
  const { can_id_hex, message_name, signals } = raw;
  if (typeof can_id_hex !== 'string') return null;
  if (typeof message_name !== 'string') return null;
  if (!isObject(signals)) return null;
  return {
    timestamp_ns: Number(raw.timestamp_ns) || 0,
    can_id_hex,
    message_name,
    signals,
    network: typeof raw.network === 'string' ? raw.network : undefined,
    sender: typeof raw.sender === 'string' ? raw.sender : undefined,
    vehicle: typeof raw.vehicle === 'string' ? raw.vehicle : undefined,
    units: isObject(raw.units) ? raw.units : undefined,
    array_index: raw.array_index ?? null,
    raw_packet: typeof raw.raw_packet === 'string' ? raw.raw_packet : undefined,
  };
}

/**
 * Parse a "live_message_batch" WS payload (an array of message items),
 * dropping any items that fail validation.
 * @param {unknown} payload
 * @returns {EngineMessage[]}
 */
export function parseLiveMessageBatch(payload) {
  if (!Array.isArray(payload)) return [];
  const out = [];
  for (const item of payload) {
    const msg = parseEngineMessage(item);
    if (msg) out.push(msg);
  }
  return out;
}

/**
 * Merge a partial "status" WS payload onto DEFAULT_STATUS so consumers always
 * read a complete shape.
 * @param {unknown} payload
 * @returns {EngineStatus}
 */
export function parseStatus(payload) {
  if (!isObject(payload)) return { ...DEFAULT_STATUS };
  const active_event =
    payload.active_event === null || payload.active_event === undefined
      ? null
      : isObject(payload.active_event)
        ? payload.active_event
        : null;
  return {
    ...DEFAULT_STATUS,
    ...payload,
    active_event,
    dbc_errors: Array.isArray(payload.dbc_errors) ? payload.dbc_errors : [],
  };
}

// ---- Server→client envelope ------------------------------------------------
// Every WS frame is `{ "type": "live_message_batch" | "status", "payload": ... }`
// (backend/API_CONTRACT.md). Per-type payload parsers live above; this just
// unwraps and validates the envelope.

/** Envelope `type` values the client understands. */
export const SERVER_MESSAGE_TYPES = Object.freeze({
  LIVE_MESSAGE_BATCH: 'live_message_batch',
  STATUS: 'status',
});

/**
 * Parse a raw WS envelope into `{ type, payload }` with the payload already
 * normalized for its type. Returns null for malformed/unknown frames so the
 * caller can ignore them (additive-only contract: unknown types are not errors).
 * @param {unknown} frame
 * @returns {{ type: string, payload: * }|null}
 */
export function parseServerEnvelope(frame) {
  if (!isObject(frame) || typeof frame.type !== 'string') return null;
  switch (frame.type) {
    case SERVER_MESSAGE_TYPES.LIVE_MESSAGE_BATCH:
      return { type: frame.type, payload: parseLiveMessageBatch(frame.payload) };
    case SERVER_MESSAGE_TYPES.STATUS:
      return { type: frame.type, payload: parseStatus(frame.payload) };
    default:
      return null;
  }
}

// ---- Client→server messages ------------------------------------------------
// Typeless payloads per the contract; the envelope carries only `type`.

/** Client→server `type` values. */
export const CLIENT_MESSAGE_TYPES = Object.freeze({
  REQUEST_CACHE: 'request_cache',
  RESET_CACHE: 'reset_cache',
});

/** Build a client→server envelope frame for the given type. */
export function clientEnvelope(type) {
  return { type };
}
