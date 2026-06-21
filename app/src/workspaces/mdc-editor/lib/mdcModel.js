// Editor-local model helpers for an MDC project document.
//
// The canonical model is Embedded-Sharepoint/can/mdc/schema/mdc.schema.bundle.json (read-only, outside
// app/). These helpers mirror the parts of that contract the editor needs:
// traversal (root/network→node→message→signal), enum vocabularies for form
// widgets, and immutable update helpers keyed by a path through the document.
//
// Why enums live here instead of importing the schema: the schema bundle sits
// outside app/ and can't be imported by the Vite build. We keep a small, clearly
// labeled copy of the closed enums; if the schema changes, this list and the
// editor's validation move together.

/** Closed enum vocabularies, mirroring mdc.schema.bundle.json (MDC v3 contract §3). */
export const ENUMS = {
  byte_order: ['little_endian', 'big_endian'],
  conversionKind: ['rational', 'table'],
  transport: ['single', 'isotp', 'multiframe'],
  messageProtocol: ['j1939'],
  envType: ['integer', 'float', 'string', 'data'],
  arrayStorage: ['series_per_index', 'array_column', 'snapshot'],
  attributeType: ['enum', 'int', 'float', 'string', 'bool', 'hex'],
  attributeScope: ['project', 'vehicle', 'network', 'node', 'message', 'signal'],
};

export const DEFAULT_CYCLE_TIME_MS = 1000;

export const BYTE_ORDER_LABEL = {
  little_endian: 'Intel (little-endian)',
  big_endian: 'Motorola (big-endian)',
};

export const BYTE_ORDER_OPTIONS = Object.entries(BYTE_ORDER_LABEL).map(([value, label]) => ({
  value,
  label,
}));

/** `(name, value) => update(['attributes', name], value)` — shared by entity editors. */
export function makeAttrUpdate(update) {
  return (name, value) => update(['attributes', name], value);
}

/** Split comma/newline/space-separated text; optional numeric coercion. */
export function parseCsvList(text, { asNumber = false } = {}) {
  const items = String(text)
    .split(/[,\n\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  return asNumber ? items.map(Number).filter((n) => !Number.isNaN(n)) : items;
}

export function formatHex(n) {
  if (n == null || n === '' || !Number.isFinite(Number(n))) return '';
  return `0x${Number(n).toString(16).toUpperCase()}`;
}

export function parseHexInt(text, min, max) {
  const s = String(text).trim();
  if (!s) return undefined;
  const raw = s.startsWith('0x') || s.startsWith('0X') ? s.slice(2) : s;
  const n = parseInt(raw, 16);
  if (Number.isNaN(n)) return undefined;
  if (min != null && n < min) return min;
  if (max != null && n > max) return max;
  return n;
}

/** A node selected in the tree, identified by its path through the document. */
export const SELECTION_KINDS = {
  PROJECT: 'project',
  NETWORK: 'network',
  NODE: 'node',
  MESSAGE: 'message',
  SIGNAL: 'signal',
};

/** Iterate every (network, message) tuple on the flat v3 root. */
export function* iterMessages(project) {
  for (const network of project?.networks ?? []) {
    for (const message of network.messages ?? []) {
      yield { network, message };
    }
  }
}

/** Value-table helper — re-export from @mdc-lib; canonical implementation is in Embedded-Sharepoint/can/mdc/lib/model.mjs. */
export { resolveValueEntries } from '@mdc-lib/model.mjs';

/** Find a project-level attribute definition by name. */
export function findAttrDef(project, name) {
  return (project?.attributeDefinitions ?? []).find((d) => d.name === name);
}

/** Resolve the displayed value for an attribute definition on an entity. */
export function attrDisplayValue(def, attributes) {
  const fallback = def.type === 'bool' ? false : '';
  return (attributes ?? {})[def.name] ?? def.default ?? fallback;
}

/** Resolve a selection path to the concrete entity it points at. */
export function resolveSelection(project, sel) {
  if (!project || !sel) return null;
  if (sel.kind === SELECTION_KINDS.PROJECT) return project;
  const network = project.networks?.[sel.network];
  if (sel.kind === SELECTION_KINDS.NETWORK) return network ?? null;
  const node = network?.nodes?.[sel.node];
  if (sel.kind === SELECTION_KINDS.NODE) return node ?? null;
  const message = network?.messages?.[sel.message];
  if (sel.kind === SELECTION_KINDS.MESSAGE) return message ?? null;
  const signal = message?.signals?.[sel.signal];
  if (sel.kind === SELECTION_KINDS.SIGNAL) return signal ?? null;
  return null;
}

/**
 * Immutable update of a deeply nested value addressed by a key path.
 * Returns a new project with structural sharing for untouched branches.
 */
export function setIn(obj, path, value) {
  if (path.length === 0) return value;
  const [head, ...rest] = path;
  const clone = Array.isArray(obj) ? [...obj] : { ...obj };
  clone[head] = setIn(obj?.[head], rest, value);
  return clone;
}

/** Build the document path (array of keys) to a selected entity. */
export function selectionPath(sel) {
  if (!sel) return [];
  if (sel.kind === SELECTION_KINDS.PROJECT) return [];
  const p = ['networks', sel.network];
  if (sel.kind === SELECTION_KINDS.NETWORK) return p;
  if (sel.kind === SELECTION_KINDS.NODE) {
    p.push('nodes', sel.node);
    return p;
  }
  p.push('messages', sel.message);
  if (sel.kind === SELECTION_KINDS.MESSAGE) return p;
  p.push('signals', sel.signal);
  return p;
}

/** Highest used bit + 1 across a message's signals (for grid sizing). */
export function messageBitSpan(message) {
  let maxBit = (message?.length ?? 0) * 8;
  for (const s of message?.signals ?? []) {
    maxBit = Math.max(maxBit, (s.start ?? 0) + (s.length ?? 0));
  }
  return maxBit;
}
