import { describe, expect, it } from 'vitest';
import { mergeBatchIntoCache, parseCacheKey } from './signalCache.js';
import { teslaTokens } from '../../theme/teslaTheme.js';

describe('parseCacheKey', () => {
  it('splits vehicle and sender', () => {
    expect(parseCacheKey('Mcqueen::ECU1')).toEqual({ vehicle: 'Mcqueen', sender: 'ECU1' });
  });

  it('handles sender-only keys', () => {
    expect(parseCacheKey('ECU1')).toEqual({ vehicle: '', sender: 'ECU1' });
  });
});

describe('mergeBatchIntoCache', () => {
  it('merges scalar messages by vehicle::sender and can id', () => {
    const prev = {};
    const msgs = [
      {
        sender: 'ECU1',
        vehicle: 'Mcqueen',
        can_id_hex: '0x100',
        message_name: 'Speed',
        signals: { rpm: 1200 },
        timestamp_ns: 1,
      },
    ];
    const next = mergeBatchIntoCache(prev, msgs);
    expect(next['Mcqueen::ECU1']['0x100'].signals.rpm).toBe(1200);
  });

  it('accumulates array-indexed signals', () => {
    const prev = mergeBatchIntoCache({}, [
      {
        sender: 'ECU1',
        vehicle: 'v',
        can_id_hex: '0x200',
        message_name: 'Arr',
        array_index: 0,
        signals: { val: 1 },
        timestamp_ns: 1,
      },
    ]);
    const next = mergeBatchIntoCache(prev, [
      {
        sender: 'ECU1',
        vehicle: 'v',
        can_id_hex: '0x200',
        message_name: 'Arr',
        array_index: 1,
        signals: { val: 2 },
        timestamp_ns: 2,
      },
    ]);
    const entry = next['v::ECU1']['0x200'];
    expect(entry.is_array).toBe(true);
    expect(entry.indices).toEqual([0, 1]);
    expect(entry.signals.val[0]).toBe(1);
    expect(entry.signals.val[1]).toBe(2);
  });
});

describe('teslaTokens', () => {
  it('uses zinc base background', () => {
    expect(teslaTokens.bg).toBe('#0a0a0b');
  });
});
