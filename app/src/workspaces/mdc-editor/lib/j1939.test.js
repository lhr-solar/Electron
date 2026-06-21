import { describe, it, expect } from 'vitest';
import { j1939FromId, showJ1939Readout } from './j1939.js';

describe('J1939 readout math (MessageEditor parity)', () => {
  it('derives priority, PGN, and source address from a 29-bit id', () => {
    const id = 0x18fef100;
    expect(j1939FromId(id)).toEqual({
      priority: 6,
      pgn: 0xfef1,
      sourceAddress: 0x00,
    });
  });

  it('shows readout for extended framing and hides it for standard 11-bit ids', () => {
    const extended = { frame_id: 0x18fef100, is_extended_frame: true };
    const standard = { frame_id: 0x123, is_extended_frame: false };

    expect(showJ1939Readout(extended)).toBe(true);
    expect(showJ1939Readout(extended) ? j1939FromId(extended.frame_id) : null).not.toBeNull();

    expect(showJ1939Readout(standard)).toBe(false);
    expect(showJ1939Readout(standard) ? j1939FromId(standard.frame_id) : null).toBeNull();
  });

  it('shows readout when protocol is j1939', () => {
    const message = { frame_id: 0x18fef100, is_extended_frame: false, protocol: 'j1939' };
    expect(showJ1939Readout(message)).toBe(true);
    expect(j1939FromId(message.frame_id)).toEqual({ priority: 6, pgn: 0xfef1, sourceAddress: 0x00 });
  });

  it('shows readout when VFrameFormat is J1939PG even if is_extended_frame is false', () => {
    const message = {
      frame_id: 0x18fef100,
      is_extended_frame: false,
      attributes: { VFrameFormat: 'J1939PG' },
    };
    expect(showJ1939Readout(message)).toBe(true);
    expect(j1939FromId(message.frame_id)).toEqual({ priority: 6, pgn: 0xfef1, sourceAddress: 0x00 });
  });

  it('hides readout for CAN-FD frames (29-bit J1939 layout does not apply)', () => {
    const fdExtended = { frame_id: 0x18fef100, is_extended_frame: true, is_fd: true };
    expect(showJ1939Readout(fdExtended)).toBe(false);

    const fdByAttr = {
      frame_id: 0x18fef100,
      is_extended_frame: true,
      is_fd: false,
      attributes: { VFrameFormat: 'ExtendedCAN_FD' },
    };
    expect(showJ1939Readout(fdByAttr)).toBe(false);
  });
});
