import React, { useMemo } from 'react';

/**
 * Lightweight SVG line chart: value vs time, Y autoscale.
 * @param {{ points: { t: string; v: number }[]; width?: number; height?: number; stroke?: string }} p
 */
export function SimpleLineChart({ points, width = 520, height = 200, stroke = '#a1a1aa' }) {
  const { pathD, minV, maxV } = useMemo(() => {
    const valid = (points || []).filter((p) => p && Number.isFinite(p.v) && p.t);
    if (!valid.length) return { pathD: '', minV: 0, maxV: 1 };
    const ts = valid.map((p) => Date.parse(p.t)).filter(Number.isFinite);
    const vs = valid.map((p) => p.v);
    const minT = Math.min(...ts);
    const maxT = Math.max(...ts) || minT + 1;
    let minV = Math.min(...vs);
    let maxV = Math.max(...vs);
    if (minV === maxV) {
      minV -= 1;
      maxV += 1;
    }
    const padY = (maxV - minV) * 0.08 || 0.01;
    minV -= padY;
    maxV += padY;
    const ml = 12;
    const mr = 12;
    const mt = 10;
    const mb = 22;
    const iw = width - ml - mr;
    const ih = height - mt - mb;
    const d = valid
      .map((p, i) => {
        const tx = Date.parse(p.t);
        const x = ml + ((tx - minT) / (maxT - minT || 1)) * iw;
        const y = mt + ih - ((p.v - minV) / (maxV - minV || 1)) * ih;
        return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join('');
    return { pathD: d, minV, maxV };
  }, [points, width, height]);

  if (!points?.length || !pathD) {
    return (
      <svg width={width} height={height} style={{ display: 'block' }}>
        <text x={12} y={24} fill="#71717a" fontSize="12">
          No numeric samples in range
        </text>
      </svg>
    );
  }

  return (
    <svg width={width} height={height} style={{ display: 'block', maxWidth: '100%' }}>
      <rect x={0} y={0} width={width} height={height} fill="#0a0a0b" rx={4} />
      <path d={pathD} fill="none" stroke={stroke} strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
      <text x={8} y={14} fill="#71717a" fontSize="10" fontFamily="monospace">
        max {maxV.toPrecision(4)}
      </text>
      <text x={8} y={height - 8} fill="#71717a" fontSize="10" fontFamily="monospace">
        min {minV.toPrecision(4)}
      </text>
    </svg>
  );
}
