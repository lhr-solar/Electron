/** Search / filter helpers for DBC schema from API (aligned with canspec-ui search behavior). */

export const ECU_NONE = '__none__';

export function formatCanIdHex(id) {
  if (id === null || id === undefined) return '';
  const s = String(id).trim();
  if (!s) return '';

  let n = null;
  if (s.startsWith('0x') || s.startsWith('0X')) {
    const parsed = parseInt(s, 16);
    if (Number.isFinite(parsed)) n = parsed;
  } else if (/^\d+$/.test(s)) {
    const parsed = parseInt(s, 10);
    if (Number.isFinite(parsed)) n = parsed;
  } else if (/^[0-9a-fA-F]+$/.test(s)) {
    const parsed = parseInt(s, 16);
    if (Number.isFinite(parsed)) n = parsed;
  }

  if (n === null) return s;
  return `0x${n.toString(16).toUpperCase().padStart(3, '0')}`;
}

/** @typedef {{ ids: boolean; ecus: boolean; msgNames: boolean; sigNames: boolean }} SearchFields */

/** @param {{ id?: number; id_hex?: string; ecu?: string | null; name?: string; signals?: unknown[] }} m */
function frameIdSearchTokens(m, idFormat) {
  const id = m.id;
  if (idFormat === 'decimal') {
    return [String(id ?? '')];
  }
  const full = formatCanIdHex(m.id_hex ?? id).toLowerCase();
  const digits = full.replace(/^0x/i, '');
  return [full, digits];
}

/**
 * @param {Record<string, unknown>} m - API message
 * @param {string} q
 * @param {SearchFields} fields
 * @param {'hex' | 'decimal'} idFormat
 */
export function messageMatchesSearch(m, q, fields, idFormat = 'hex') {
  const needle = q.trim().toLowerCase();
  if (!needle) return true;

  const hay = [];

  if (fields.ids) {
    hay.push(...frameIdSearchTokens(m, idFormat));
  }
  if (fields.ecus) {
    if (m.ecu) hay.push(String(m.ecu));
    else hay.push('no sender');
  }
  if (fields.msgNames) {
    hay.push(m.name || '');
  }
  if (fields.sigNames) {
    const signals = Array.isArray(m.signals) ? m.signals : [];
    for (const s of signals) {
      if (s && typeof s === 'object' && s.name != null) hay.push(String(s.name));
      const choices = s?.choices;
      if (choices && typeof choices === 'object' && !Array.isArray(choices)) {
        for (const [k, v] of Object.entries(choices)) {
          hay.push(String(k), String(v));
        }
      }
    }
  }

  return hay.join(' ').toLowerCase().includes(needle);
}

/** @param {unknown[]} messages */
export function buildEcuOptions(messages) {
  const set = new Set();
  for (const m of messages) {
    if (!m || typeof m !== 'object') continue;
    const ecu = /** @type {{ ecu?: string }} */ (m).ecu;
    if (!ecu) set.add(ECU_NONE);
    else set.add(ecu);
  }
  const list = Array.from(set);
  list.sort((a, b) => {
    if (a === ECU_NONE) return 1;
    if (b === ECU_NONE) return -1;
    return a.localeCompare(b);
  });
  return list;
}

/** @typedef {'id-asc' | 'id-desc' | 'name-asc' | 'name-desc'} MessageSort */

/** @param {unknown[]} messages @param {MessageSort} sort */
export function sortMessages(messages, sort) {
  const arr = [...messages].filter((m) => m && typeof m === 'object');
  const getId = (m) => Number(/** @type {{ id?: number }} */ (m).id) || 0;
  const getName = (m) => String(/** @type {{ name?: string }} */ (m).name || '');
  switch (sort) {
    case 'id-asc':
      arr.sort((a, b) => getId(a) - getId(b));
      break;
    case 'id-desc':
      arr.sort((a, b) => getId(b) - getId(a));
      break;
    case 'name-asc':
      arr.sort((a, b) => getName(a).localeCompare(getName(b)));
      break;
    case 'name-desc':
      arr.sort((a, b) => getName(b).localeCompare(getName(a)));
      break;
    default:
      break;
  }
  return arr;
}

/**
 * @param {unknown} m
 * @param {Set<string>} selectedEcus
 */
export function messageMatchesEcuFilter(m, selectedEcus) {
  const ecu = m && typeof m === 'object' ? /** @type {{ ecu?: string }} */ (m).ecu : undefined;
  if (ecu) return selectedEcus.has(ecu);
  return selectedEcus.has(ECU_NONE);
}
