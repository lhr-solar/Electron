import React, { useMemo } from 'react';

/**
 * Lightweight SVG line chart: value vs time, Y autoscale.
 * @param {{ points: { t: string; v: number }[]; width?: number; height?: number; stroke?: string }} p
 */
export function SimpleLineChart({ points, width = 520, height = 200, stroke = 'var(--chart-1)' }) {
  const { pathD, lastV, minV, maxV } = useMemo(() => {
    const valid = (points || []).filter((p) => p && Number.isFinite(p.v) && p.t);
    if (!valid.length) return { pathD: '', minV: 0, maxV: 1, lastV: null };
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
    const last = valid[valid.length - 1];
    const lastV = last && Number.isFinite(last.v) ? last.v : null;
    return { pathD: d, minV, maxV, lastV };
  }, [points, width, height]);

  const ml = 12;
  const mr = 12;
  const mt = 10;
  const mb = 22;
  const iw = width - ml - mr;
  const ih = height - mt - mb;

  if (!points?.length || !pathD) {
    return (
      <svg width={width} height={height} className="block max-w-full">
        <rect x={0} y={0} width={width} height={height} fill="var(--card)" rx={6} />
        <text x={12} y={24} fill="var(--muted-foreground)" fontSize="12">
          No numeric samples in range
        </text>
      </svg>
    );
  }

  const gridLines = [];
  const gridCount = 4;
  for (let i = 0; i <= gridCount; i++) {
    const y = mt + (ih / gridCount) * i;
    gridLines.push(
      <line
        key={`h-${i}`}
        x1={ml}
        y1={y}
        x2={width - mr}
        y2={y}
        stroke="var(--border)"
        strokeOpacity={0.6}
        strokeWidth={1}
      />
    );
  }
  for (let i = 0; i <= 4; i++) {
    const x = ml + (iw / 4) * i;
    gridLines.push(
      <line
        key={`v-${i}`}
        x1={x}
        y1={mt}
        x2={x}
        y2={height - mb}
        stroke="var(--border)"
        strokeOpacity={0.35}
        strokeWidth={1}
      />
    );
  }

  const yLabels = [maxV, (maxV + minV) / 2, minV];

  return (
    <svg width={width} height={height} className="block max-w-full">
      <rect x={0} y={0} width={width} height={height} fill="var(--card)" rx={6} />
      {gridLines}
      <path d={pathD} fill="none" stroke={stroke} strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
      {yLabels.map((v, i) => {
        const y = mt + (ih / 2) * i;
        return (
          <text
            key={i}
            x={4}
            y={y + 3}
            fill="var(--muted-foreground)"
            fontSize="10"
            className="tabular"
          >
            {Number.isFinite(v) ? v.toPrecision(3) : ''}
          </text>
        );
      })}
      <text
        x={8}
        y={height - 8}
        fill="var(--muted-foreground)"
        fontSize="11"
        className="tabular"
      >
        current {lastV != null && Number.isFinite(lastV) ? lastV.toPrecision(4) : '—'}
      </text>
    </svg>
  );
}
