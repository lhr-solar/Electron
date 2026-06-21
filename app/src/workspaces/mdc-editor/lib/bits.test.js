import { describe, it, expect } from 'vitest';
import { signalBitIndices } from './bitLayout.js';
import { legacyMessageForValidation } from './v3compat.js';
import { validateBitOverlaps } from '@mdc-lib/mdc-validate-shared.mjs';
import { occupiedBits } from '@mdc-lib/mdc-bits.mjs';

describe('mdc-bits Motorola sawtooth (v3 field names via adapter)', () => {
  it('walks non-contiguous bit indices for big_endian', () => {
    const bits = signalBitIndices({ start: 7, length: 12, byte_order: 'big_endian' });
    expect(bits).toEqual([7, 6, 5, 4, 3, 2, 1, 0, 15, 14, 13, 12]);
  });

  it('occupiedBits matches signalBitIndices for v3 fields', () => {
    const sig = { start: 0, length: 8, byte_order: 'little_endian' };
    expect(signalBitIndices(sig)).toEqual(occupiedBits(sig));
  });
});

describe('validateBitOverlaps detects Motorola overlap (v3 mux fields)', () => {
  it('flags overlap that sorted-range checks miss', () => {
    const message = {
      length: 8,
      signals: [
        { name: 'A', start: 7, length: 12, byte_order: 'big_endian' },
        { name: 'B', start: 0, length: 8, byte_order: 'little_endian' },
      ],
    };
    const findings = [];
    validateBitOverlaps(legacyMessageForValidation(message), (_sev, msg) => findings.push(msg), {
      includeMultiplexed: false,
    });
    expect(findings.some((f) => f.includes('overlap'))).toBe(true);
  });
});
