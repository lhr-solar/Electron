// Bit-layout math for the message bit grid — v3 field names (start/length/byte_order).

function littleEndianBits(start, length) {
  const bits = [];
  for (let i = 0; i < length; i++) bits.push(start + i);
  return bits;
}

function bigEndianBits(start, length) {
  const bits = [];
  let bit = start;
  for (let i = 0; i < length; i++) {
    bits.push(bit);
    if (bit % 8 === 0) bit += 15;
    else bit -= 1;
  }
  return bits;
}

/** Absolute bit indices a signal occupies, endianness-aware. */
export function signalBitIndices(signal) {
  const start = signal.start ?? 0;
  const len = signal.length ?? 0;
  return signal.byte_order === 'big_endian'
    ? bigEndianBits(start, len)
    : littleEndianBits(start, len);
}

/**
 * Build a grid model: rows of bytes, each cell tagged with the owning signal
 * (or null) plus whether it is the field's start bit.
 */
export function buildBitGrid(message, palette) {
  const signals = message?.signals ?? [];
  const owner = new Map();
  let maxBit = (message?.length ?? 0) * 8 - 1;

  signals.forEach((signal, signalIndex) => {
    const color = palette(signalIndex);
    const bits = signalBitIndices(signal);
    bits.forEach((bit, k) => {
      maxBit = Math.max(maxBit, bit);
      if (!owner.has(bit)) owner.set(bit, { signal, signalIndex, isStart: k === 0, color });
    });
  });

  const byteCount = Math.max(message?.length ?? 0, Math.floor(maxBit / 8) + 1);
  const rows = [];
  for (let byte = 0; byte < byteCount; byte++) {
    const cells = [];
    for (let col = 7; col >= 0; col--) {
      const bit = byte * 8 + col;
      const cell = owner.get(bit) ?? null;
      cells.push({ bit, byte, col, ...(cell ?? { signal: null }) });
    }
    rows.push({ byte, cells });
  }
  return { rows, byteCount };
}
