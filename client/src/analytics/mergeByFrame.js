/**
 * Best-effort alignment per primary row: same frame id, closest time within maxSkewMs.
 *
 * @param {Array<Record<string, unknown>>} primaryRows
 * @param {string} primaryValueKey
 * @param {string} primaryFrameKey
 * @param {Array<Record<string, unknown>>} secondaryRows
 * @param {string} secondaryValueKey
 * @param {string} secondaryFrameKey
 * @param {number} [maxSkewMs=150]
 */
export function mergeSamplesByFrameId(
  primaryRows,
  primaryValueKey,
  primaryFrameKey,
  secondaryRows,
  secondaryValueKey,
  secondaryFrameKey,
  maxSkewMs = 150
) {
  const sec = (secondaryRows || [])
    .map((r) => ({
      t: Date.parse(String(r.t)),
      frame: Number(r[secondaryFrameKey]),
      v: toNum(r[secondaryValueKey]),
    }))
    .filter((r) => Number.isFinite(r.t) && Number.isFinite(r.frame) && r.v != null);

  return (primaryRows || []).map((r) => {
    const t0 = Date.parse(String(r.t));
    const frame = Number(r[primaryFrameKey]);
    const pv = toNum(r[primaryValueKey]);
    if (!Number.isFinite(t0) || !Number.isFinite(frame)) {
      return { t: r.t, frameId: frame, primary: pv, secondary: null };
    }
    let best = null;
    let bestDt = Infinity;
    for (const s of sec) {
      if (s.frame !== frame) continue;
      const dt = Math.abs(s.t - t0);
      if (dt <= maxSkewMs && dt < bestDt) {
        bestDt = dt;
        best = s.v;
      }
    }
    return { t: r.t, frameId: frame, primary: pv, secondary: best };
  });
}

/**
 * Align multiple pivot streams by the same DBC frame signal (rolling counter).
 * First stream is the timeline; each row finds matching frame value + closest time in other streams.
 *
 * @param {Array<{ messageId: number, messageName: string, rows: Array<Record<string, unknown>> }>} streams
 * @param {string} frameSignalName - exact signal name on every message (e.g. FrameID_Foo)
 * @param {number} [maxSkewMs=150]
 * @returns {Array<{ t: unknown, frameId: number | null, byMessage: Array<{ messageId: number, messageName: string, row: Record<string, unknown> | null }> }>}
 */
export function mergePivotByFrameSignal(streams, frameSignalName, maxSkewMs = 150) {
  if (!streams?.length || !frameSignalName) return [];
  const primary = streams[0];
  const priRows = primary.rows || [];
  const others = streams.slice(1);
  const out = [];

  for (const pr of priRows) {
    const t0 = Date.parse(String(pr.t));
    const frameVal = toNum(pr[frameSignalName]);
    if (!Number.isFinite(t0) || frameVal == null || !Number.isFinite(Number(frameVal))) {
      continue;
    }
    const fv = Number(frameVal);
    const byMessage = [
      {
        messageId: primary.messageId,
        messageName: primary.messageName,
        row: pr && typeof pr === 'object' ? { ...pr } : null,
      },
    ];
    for (const sec of others) {
      const match = findBestPivotRow(sec.rows || [], frameSignalName, fv, t0, maxSkewMs);
      byMessage.push({
        messageId: sec.messageId,
        messageName: sec.messageName,
        row: match ? { ...match } : null,
      });
    }
    out.push({
      t: pr.t,
      frameId: fv,
      byMessage,
    });
  }
  return out;
}

function findBestPivotRow(rows, frameKey, frameVal, t0, maxSkewMs) {
  let best = null;
  let bestDt = Infinity;
  for (const r of rows) {
    const fv = toNum(r[frameKey]);
    if (fv == null || Number(fv) !== frameVal) continue;
    const t = Date.parse(String(r.t));
    if (!Number.isFinite(t)) continue;
    const dt = Math.abs(t - t0);
    if (dt <= maxSkewMs && dt < bestDt) {
      bestDt = dt;
      best = r;
    }
  }
  return best;
}

function toNum(v) {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
