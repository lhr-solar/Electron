import { describe, it, expect } from 'vitest';
import {
  SELECTION_KINDS,
  ENUMS,
  iterMessages,
  resolveSelection,
  selectionPath,
  setIn,
  messageBitSpan,
} from './mdcModel.js';
import { SAMPLE_PROJECT } from './sampleProject.js';

/** Mirrors NetworkEditor addEnv / MessageEditor addGroup defaults (cantools-shaped). */
const EDITOR_DEFAULTS = {
  envVar: { name: 'NewEnvVar', env_type: 'integer', access_node: [], comment: '' },
  signalGroup: { name: 'NewGroup', repetitions: 1, signal_names: [] },
  containedMessage: { name: 'ContainedMsg', header_id: 0, length: 8, signals: [], senders: [] },
};

describe('SAMPLE_PROJECT v3 flat root', () => {
  it('has networks at root (no vehicles[])', () => {
    expect(Array.isArray(SAMPLE_PROJECT.networks)).toBe(true);
    expect(SAMPLE_PROJECT.networks.length).toBeGreaterThan(0);
    expect(SAMPLE_PROJECT.vehicles).toBeUndefined();
    expect(SAMPLE_PROJECT.schemaVersion).toBe('3.0.0');
    expect(SAMPLE_PROJECT.id).toBeTruthy();
  });

  it('networks use cantools bus field names', () => {
    const net = SAMPLE_PROJECT.networks[0];
    expect(net.baudrate).toBe(500000);
    expect(net.fd_baudrate).toBe(2000000);
    expect(net.protocol).toBeUndefined();
    expect(typeof net.comment).toBe('string');
  });

  it('messages and signals use cantools field names', () => {
    const { message } = [...iterMessages(SAMPLE_PROJECT)][0];
    const sig = message.signals[0];
    expect(message.frame_id).toBe(256);
    expect(message.is_extended_frame).toBe(false);
    expect(message.is_fd).toBe(true);
    expect(message.send_type).toBe('Cyclic');
    expect(message.cycle_time).toBe(100);
    expect(sig.start).toBe(0);
    expect(sig.length).toBe(16);
    expect(sig.byte_order).toBe('little_endian');
    expect(sig.is_signed).toBe(false);
    expect(sig.is_float).toBe(false);
    expect(sig.scale).toBe(0.01);
    expect(sig.offset).toBe(0);
  });
});

describe('editor default objects (CANdb++ parity)', () => {
  it('environment variable default has cantools-shaped keys', () => {
    const d = EDITOR_DEFAULTS.envVar;
    expect(d.name).toBeTruthy();
    expect(ENUMS.envType).toContain(d.env_type);
    expect(Array.isArray(d.access_node)).toBe(true);
  });

  it('signal group default matches contract §3.5 shape', () => {
    const d = EDITOR_DEFAULTS.signalGroup;
    expect(d.name).toBeTruthy();
    expect(d.repetitions).toBe(1);
    expect(Array.isArray(d.signal_names)).toBe(true);
  });

  it('contained message default matches contract §3.6 shape', () => {
    const d = EDITOR_DEFAULTS.containedMessage;
    expect(d.name).toBeTruthy();
    expect(d.header_id).toBe(0);
    expect(d.length).toBe(8);
    expect(Array.isArray(d.signals)).toBe(true);
  });
});

describe('resolveSelection / selectionPath (flat root)', () => {
  const sel = { kind: SELECTION_KINDS.MESSAGE, network: 0, message: 0 };

  it('resolves message without vehicles hop', () => {
    const msg = resolveSelection(SAMPLE_PROJECT, sel);
    expect(msg?.name).toBe('BMS_Status');
    expect(selectionPath(sel)).toEqual(['networks', 0, 'messages', 0]);
  });

  it('setIn updates nested v3 fields immutably', () => {
    const next = setIn(SAMPLE_PROJECT, ['networks', 0, 'messages', 0, 'frame_id'], 999);
    expect(next.networks[0].messages[0].frame_id).toBe(999);
    expect(SAMPLE_PROJECT.networks[0].messages[0].frame_id).toBe(256);
  });
});

describe('messageBitSpan (v3 start/length)', () => {
  it('uses start + length not legacy bit names', () => {
    const msg = { length: 4, signals: [{ start: 40, length: 16 }] };
    expect(messageBitSpan(msg)).toBe(56);
  });
});
