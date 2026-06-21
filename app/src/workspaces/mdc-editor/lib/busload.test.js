import { describe, it, expect } from 'vitest';
import {
  STANDARD_SPEEDS,
  bitsPerFrame,
  loadPercentAt,
  networkSpeeds,
  busLoadForNetwork,
  computeBusLoad,
  formatSpeed,
} from './busload.js';
import { SAMPLE_PROJECT } from './sampleProject.js';

describe('busload formula (v3 send_type / cycle_time)', () => {
  it('matches the documented 8B standard frame self-check', () => {
    expect(bitsPerFrame({ length: 8 })).toBe(136);
    expect(loadPercentAt([{ length: 8, cycle_time: 100, send_type: 'Cyclic' }], 500000)).toBeCloseTo(0.272, 6);
  });

  it('excludes triggered send_type messages from bus load', () => {
    const msgs = [{ length: 8, cycle_time: 100, send_type: 'triggered' }];
    expect(loadPercentAt(msgs, 500000)).toBe(0);
  });
});

describe('networkSpeeds row ordering and content', () => {
  const messages = [{ length: 8, cycle_time: 100, send_type: 'Cyclic' }];

  it('pins the configured speed to the top and flags it', () => {
    const rows = networkSpeeds(messages, 500000);
    expect(rows[0].isConfigured).toBe(true);
    expect(rows[0].speed).toBe(500000);
    expect(rows.filter((r) => r.isConfigured)).toHaveLength(1);
  });

  it('orders the remaining (non-configured) speeds ascending', () => {
    const rows = networkSpeeds(messages, 500000);
    const rest = rows.slice(1).map((r) => r.speed);
    expect(rest).toEqual([...rest].sort((a, b) => a - b));
  });

  it('includes every standard speed exactly once', () => {
    const rows = networkSpeeds(messages, 500000);
    const speeds = rows.map((r) => r.speed).sort((a, b) => a - b);
    const expected = [...new Set(STANDARD_SPEEDS)].sort((a, b) => a - b);
    expect(speeds).toEqual(expected);
  });

  it('adds a non-standard configured speed as an extra top row', () => {
    const rows = networkSpeeds(messages, 666000);
    expect(rows[0].speed).toBe(666000);
    expect(rows[0].isConfigured).toBe(true);
    expect(rows).toHaveLength(STANDARD_SPEEDS.length + 1);
  });

  it('leaves no configured row when baudrate is unset', () => {
    const rows = networkSpeeds(messages, undefined);
    expect(rows.some((r) => r.isConfigured)).toBe(false);
  });
});

describe('computeBusLoad over the lhr-ev1 sample', () => {
  it('produces a sweep per network with the configured speed on top', () => {
    const { networks } = computeBusLoad(SAMPLE_PROJECT);
    expect(networks.length).toBeGreaterThan(0);
    for (const net of networks) {
      if (net.bitrate != null) {
        expect(net.speeds[0].isConfigured).toBe(true);
        expect(net.speeds[0].speed).toBe(net.bitrate);
      }
    }
  });

  it('busLoadForNetwork matches the per-network slice of computeBusLoad', () => {
    const network = SAMPLE_PROJECT.networks[0];
    const single = busLoadForNetwork(network);
    const fromAll = computeBusLoad(SAMPLE_PROJECT).networks.find((n) => n.network === network.id);
    expect(single.speeds).toEqual(fromAll.speeds);
  });
});

describe('formatSpeed', () => {
  it('renders kbit/s and Mbit/s compactly', () => {
    expect(formatSpeed(125000)).toBe('125 kbit/s');
    expect(formatSpeed(500000)).toBe('500 kbit/s');
    expect(formatSpeed(1000000)).toBe('1 Mbit/s');
    expect(formatSpeed(2000000)).toBe('2 Mbit/s');
  });
});
