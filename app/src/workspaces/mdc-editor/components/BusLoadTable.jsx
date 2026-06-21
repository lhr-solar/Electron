// Per-network bus-load sweep. Renders every standard speed plus the configured
// one; the configured speed is pinned to the TOP (busLoadForNetwork already
// sorts configured-first) and visually highlighted/bolded. Numbers come from the
// same formula as tools/mdc-busload.mjs.

import { useMemo } from 'react';
import { busLoadForNetwork, formatSpeed } from '../lib/busload.js';

function loadClass(loadPercent) {
  if (loadPercent >= 80) return 'over';
  if (loadPercent >= 50) return 'warn';
  return '';
}

export default function BusLoadTable({ network }) {
  const result = useMemo(() => busLoadForNetwork(network), [network]);
  const { speeds, bitrate, cyclicMessageCount, busType } = result;

  return (
    <div className="mdc-card">
      <h2>Bus-load sweep</h2>
      <p className="mdc-muted" style={{ marginTop: -6, marginBottom: 12 }}>
        {busType?.toUpperCase()} ·{' '}
        {bitrate != null ? `configured ${formatSpeed(bitrate)}` : 'no configured bitrate'} ·{' '}
        {cyclicMessageCount} cyclic message{cyclicMessageCount === 1 ? '' : 's'} (triggered excluded)
      </p>
      <table className="mdc-table">
        <thead>
          <tr>
            <th className="num">Speed</th>
            <th className="num">Load %</th>
            <th>Utilization</th>
            <th>Configured</th>
          </tr>
        </thead>
        <tbody>
          {speeds.map((row) => (
            <tr
              key={row.speed}
              className={row.isConfigured ? 'mdc-configured-row' : undefined}
            >
              <td className="num">{formatSpeed(row.speed)}</td>
              <td className="num">{row.loadPercent.toFixed(2)}</td>
              <td>
                <span
                  className={`mdc-load-bar ${loadClass(row.loadPercent)}`}
                  style={{ width: `${Math.min(100, row.loadPercent)}%`, minWidth: 2 }}
                />
              </td>
              <td>{row.isConfigured ? '◆ configured' : ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
