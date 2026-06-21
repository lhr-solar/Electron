import { describe, it, expect } from 'vitest';
import {
  parseLiveMessageBatch,
  parseStatus,
  parseServerEnvelope,
  clientEnvelope,
  SERVER_MESSAGE_TYPES,
  CLIENT_MESSAGE_TYPES,
  DEFAULT_STATUS,
} from './engineContract.js';

// Sample mirrors the backend wire shape (backend/API_CONTRACT.md item +
// live_message_batch envelope).
const SAMPLE_BATCH = [
  {
    timestamp_ns: 1718000000000000000,
    raw_packet: 'deadbeef',
    can_id_hex: '0x123',
    message_name: 'BMS_Status',
    network: 'powertrain',
    sender: 'BMS',
    vehicle: 'lhr',
    units: { pack_voltage: 'V' },
    signals: { pack_voltage: 401.2, soc: 87 },
  },
  { garbage: true }, // dropped: missing required keys
];

describe('parseLiveMessageBatch', () => {
  it('parses valid items and drops invalid ones', () => {
    const msgs = parseLiveMessageBatch(SAMPLE_BATCH);
    expect(msgs).toHaveLength(1);
    expect(msgs[0].message_name).toBe('BMS_Status');
    expect(msgs[0].can_id_hex).toBe('0x123');
    expect(msgs[0].signals.soc).toBe(87);
    expect(msgs[0].timestamp_ns).toBe(1718000000000000000);
  });

  it('returns [] for non-array payloads', () => {
    expect(parseLiveMessageBatch(null)).toEqual([]);
    expect(parseLiveMessageBatch({})).toEqual([]);
  });
});

describe('parseStatus', () => {
  it('merges partial status onto defaults', () => {
    const s = parseStatus({ service_running: true, parser_status: 'running', grafana_url: 'http://x:3000' });
    expect(s.service_running).toBe(true);
    expect(s.parser_status).toBe('running');
    expect(s.grafana_url).toBe('http://x:3000');
    expect(s.dbc_errors).toEqual([]);
  });

  it('falls back to defaults on garbage', () => {
    expect(parseStatus(null)).toEqual(DEFAULT_STATUS);
  });
});

describe('parseServerEnvelope', () => {
  it('unwraps a live_message_batch envelope and parses its payload', () => {
    const parsed = parseServerEnvelope({
      type: SERVER_MESSAGE_TYPES.LIVE_MESSAGE_BATCH,
      payload: SAMPLE_BATCH,
    });
    expect(parsed.type).toBe('live_message_batch');
    expect(parsed.payload).toHaveLength(1);
    expect(parsed.payload[0].message_name).toBe('BMS_Status');
  });

  it('unwraps a status envelope and merges onto defaults', () => {
    const parsed = parseServerEnvelope({
      type: SERVER_MESSAGE_TYPES.STATUS,
      payload: { service_running: true, parser_status: 'running' },
    });
    expect(parsed.type).toBe('status');
    expect(parsed.payload.service_running).toBe(true);
    expect(parsed.payload.dbc_errors).toEqual([]);
  });

  it('returns null for unknown types and malformed frames', () => {
    expect(parseServerEnvelope({ type: 'signal_cache', payload: {} })).toBeNull();
    expect(parseServerEnvelope({ event: 'status', data: {} })).toBeNull();
    expect(parseServerEnvelope(null)).toBeNull();
  });
});

describe('clientEnvelope', () => {
  it('builds typed client→server frames with no payload', () => {
    expect(clientEnvelope(CLIENT_MESSAGE_TYPES.REQUEST_CACHE)).toEqual({
      type: 'request_cache',
    });
    expect(clientEnvelope(CLIENT_MESSAGE_TYPES.RESET_CACHE)).toEqual({
      type: 'reset_cache',
    });
  });
});
