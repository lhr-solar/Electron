// Byte-grid view of a message's bit layout. Rows are bytes (top = byte 0),
// columns are bits 7..0 within each byte — the canonical CAN frame picture.
// Each signal gets a stable color; cells show the owning signal and outline its
// start bit. Endianness is handled in buildBitGrid (Intel vs Motorola walk).

import { useMemo, useState } from 'react';
import { buildBitGrid, signalBitIndices } from '../lib/bitLayout.js';
import { BYTE_ORDER_LABEL } from '../lib/mdcModel.js';

// Distinct, dark-theme-friendly hues; cycles for messages with many signals.
const PALETTE = [
  '#3fb6e6', '#e0a83a', '#6cc070', '#d977b5', '#b58cf0',
  '#e2554f', '#5ec8c0', '#d68a4a', '#8a9be0', '#c0c060',
];
const colorFor = (i) => PALETTE[i % PALETTE.length];

export default function BitLayoutGrid({ message }) {
  const [hovered, setHovered] = useState(null);
  const { rows } = useMemo(() => buildBitGrid(message, colorFor), [message]);
  const signals = message?.signals ?? [];

  if (signals.length === 0) {
    return <p className="mdc-muted">No signals to lay out.</p>;
  }

  return (
    <div className="mdc-bitgrid">
      <div className="mdc-bitgrid-head">
        <div className="mdc-bitgrid-corner">bit</div>
        {[7, 6, 5, 4, 3, 2, 1, 0].map((b) => (
          <div key={b} className="mdc-bitgrid-colhead">{b}</div>
        ))}
      </div>
      {rows.map((row) => (
        <div key={row.byte} className="mdc-bitgrid-row">
          <div className="mdc-bitgrid-rowhead">B{row.byte}</div>
          {row.cells.map((cell) => {
            const filled = Boolean(cell.signal);
            const dim = hovered != null && filled && cell.signalIndex !== hovered;
            return (
              <div
                key={cell.bit}
                className="mdc-bit"
                data-filled={filled}
                data-start={cell.isStart || undefined}
                data-dim={dim || undefined}
                style={filled ? { background: cell.color } : undefined}
                title={
                  filled
                    ? `${cell.signal.name} · bit ${cell.bit}${cell.isStart ? ' (start)' : ''}`
                    : `bit ${cell.bit} (unused)`
                }
                onMouseEnter={() => filled && setHovered(cell.signalIndex)}
                onMouseLeave={() => setHovered(null)}
              >
                {cell.isStart && (
                  <span className="mdc-bit-label">{cell.signal.name}</span>
                )}
              </div>
            );
          })}
        </div>
      ))}

      <div className="mdc-bitgrid-legend">
        {signals.map((s, i) => (
          <span
            key={s.name ?? i}
            className="mdc-legend-item"
            onMouseEnter={() => setHovered(i)}
            onMouseLeave={() => setHovered(null)}
          >
            <span className="mdc-legend-swatch" style={{ background: colorFor(i) }} />
            {s.name} <span className="mdc-muted">
              [{s.start}:{(s.start ?? 0) + (s.length ?? 1) - 1}] ·{' '}
              {BYTE_ORDER_LABEL[s.byte_order] ?? s.byte_order} ·{' '}
              {signalBitIndices(s).length}b
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}
