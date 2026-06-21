// J1939 29-bit CAN id layout (non-FD extended frames only).

export const J1939_PRIORITY_MASK = 0x7;
export const J1939_PGN_MASK = 0x3ffff;
export const J1939_SOURCE_MASK = 0xff;
export const J1939_PRIORITY_SHIFT = 26;
export const J1939_PGN_SHIFT = 8;

export function j1939FromId(id) {
  if (!Number.isInteger(id) || id < 0) return null;
  return {
    priority: (id >> J1939_PRIORITY_SHIFT) & J1939_PRIORITY_MASK,
    pgn: (id >> J1939_PGN_SHIFT) & J1939_PGN_MASK,
    sourceAddress: id & J1939_SOURCE_MASK,
  };
}

/** True when the message uses classic 29-bit J1939 framing (not CAN-FD). */
export function showJ1939Readout(message) {
  const vff = message.attributes?.VFrameFormat;
  if (message.is_fd || vff === 'StandardCAN_FD' || vff === 'ExtendedCAN_FD') return false;
  return message.protocol === 'j1939' || message.is_extended_frame || vff === 'J1939PG';
}
