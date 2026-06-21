// Live MDC validation for the editor.
//
// We deliberately do NOT bundle ajv + the schema here: the canonical schema
// (Embedded-Sharepoint/can/mdc/schema/mdc.schema.bundle.json) lives outside app/ and can't be imported
// by the Vite build, and a generic ajv error path ("/networks/1/...
// must be string") is poor UX inside an editor. Instead we mirror the schema's
// closed enums and structural constraints as targeted checks that carry a
// selection path, so each finding can deep-link to the offending entity.
//
// This is a faithful-but-partial check of mdc.schema.bundle.json: required
// fields, enum membership, numeric ranges, bit-layout overlap/overflow, and
// cross-reference integrity (value tables, multiplexors, array signals). If the
// schema gains constraints, add them here.

import { ENUMS, resolveValueEntries, SELECTION_KINDS } from './mdcModel.js';
import { legacyMessageForValidation } from './v3compat.js';
import { validateArrayBlock, validateBitOverlaps } from '@mdc-lib/mdc-validate-shared.mjs';

const SEVERITY = { ERROR: 'error', WARNING: 'warning' };

function issue(severity, path, sel, message) {
  return { severity, path, sel, message };
}

const inEnum = (value, list) => value == null || list.includes(value);

/** Validate one signal's bit field and conversion. */
function validateSignal(signal, ctx, out) {
  const { path, sel } = ctx;
  const where = `${path} ${signal.name ?? '(unnamed)'}`;
  if (!signal.name) out.push(issue(SEVERITY.ERROR, where, sel, 'signal is missing a name'));
  if (!inEnum(signal.byte_order, ENUMS.byte_order))
    out.push(issue(SEVERITY.ERROR, where, sel, `byte_order must be one of ${ENUMS.byte_order.join(', ')}`));
  if (signal.is_signed != null && typeof signal.is_signed !== 'boolean')
    out.push(issue(SEVERITY.ERROR, where, sel, 'is_signed must be a boolean'));
  if (signal.is_float != null && typeof signal.is_float !== 'boolean')
    out.push(issue(SEVERITY.ERROR, where, sel, 'is_float must be a boolean'));

  const start = signal.start;
  const len = signal.length;
  if (!Number.isInteger(start) || start < 0 || start > 511)
    out.push(issue(SEVERITY.ERROR, where, sel, 'start must be an integer in 0..511'));
  if (!Number.isInteger(len) || len < 1 || len > 64)
    out.push(issue(SEVERITY.ERROR, where, sel, 'length must be an integer in 1..64'));

  if (signal.is_float && Number.isInteger(len) && ![16, 32, 64].includes(len))
    out.push(issue(SEVERITY.ERROR, where, sel, 'float signals must be 16, 32, or 64 bits wide'));

  if (signal.scale != null && typeof signal.scale !== 'number')
    out.push(issue(SEVERITY.ERROR, where, sel, 'scale must be a number'));
  if (signal.offset != null && typeof signal.offset !== 'number')
    out.push(issue(SEVERITY.ERROR, where, sel, 'offset must be a number'));

  const ck = signal.conversion?.kind;
  if (ck != null && !inEnum(ck, ENUMS.conversionKind))
    out.push(issue(SEVERITY.ERROR, where, sel, `conversion.kind must be one of ${ENUMS.conversionKind.join(', ')}`));
  if (ck === 'rational' && (!Array.isArray(signal.conversion.numerator) || !Array.isArray(signal.conversion.denominator)))
    out.push(issue(SEVERITY.ERROR, where, sel, 'rational conversion requires numerator and denominator arrays'));

  if (signal.is_multiplexer != null && typeof signal.is_multiplexer !== 'boolean')
    out.push(issue(SEVERITY.ERROR, where, sel, 'is_multiplexer must be a boolean'));
  if (signal.multiplexer_signal && !Array.isArray(signal.multiplexer_ids))
    out.push(issue(SEVERITY.ERROR, where, sel, 'multiplexed signals require multiplexer_ids[]'));
}

/** Detect overlapping bits among always-present (non-multiplexed) signals. */
function validateBitOverlap(message, ctx, out) {
  const { path, sel } = ctx;
  validateBitOverlaps(
    legacyMessageForValidation(message),
    (severity, msg) => {
      out.push(issue(severity === 'error' ? SEVERITY.ERROR : SEVERITY.WARNING, path, sel, msg));
    },
    { includeMultiplexed: false },
  );
}

/** Validate the message-level array block against its own signals. */
function validateArray(message, ctx, out) {
  const { path, sel } = ctx;
  if (!message.array) return;
  validateArrayBlock(
    legacyMessageForValidation(message),
    (severity, msg) => {
      out.push(issue(severity === 'error' ? SEVERITY.ERROR : SEVERITY.WARNING, path, sel, msg));
    },
  );
  const arr = message.array;
  if (arr.storage != null && !inEnum(arr.storage, ENUMS.arrayStorage))
    out.push(issue(SEVERITY.ERROR, path, sel, `array.storage must be one of ${ENUMS.arrayStorage.join(', ')}`));
  if (arr.size != null && (!Number.isInteger(arr.size) || arr.size < 1))
    out.push(issue(SEVERITY.ERROR, path, sel, 'array.size must be a positive integer or null'));
}

function validateMessage(project, network, message, ctx, out) {
  const { path, sel } = ctx;
  if (!message.name) out.push(issue(SEVERITY.ERROR, path, sel, 'message is missing a name'));
  if (!Number.isInteger(message.frame_id) || message.frame_id < 0)
    out.push(issue(SEVERITY.ERROR, path, sel, 'frame_id must be a non-negative integer'));
  if (message.length != null && (!Number.isInteger(message.length) || message.length < 0 || message.length > 64))
    out.push(issue(SEVERITY.ERROR, path, sel, 'length (DLC) must be an integer in 0..64'));
  if (!inEnum(message.transport, ENUMS.transport))
    out.push(issue(SEVERITY.ERROR, path, sel, `transport must be one of ${ENUMS.transport.join(', ')}`));
  if (message.protocol != null && !inEnum(message.protocol, ENUMS.messageProtocol))
    out.push(issue(SEVERITY.ERROR, path, sel, `protocol must be "j1939" or omitted`));
  if (message.cycle_time != null && (typeof message.cycle_time !== 'number' || message.cycle_time < 0))
    out.push(issue(SEVERITY.ERROR, path, sel, 'cycle_time must be >= 0 or null'));

  for (const [i, signal] of (message.signals ?? []).entries()) {
    validateSignal(signal, { path, sel: { ...sel, kind: SELECTION_KINDS.SIGNAL, signal: i } }, out);
    if (signal.valueTableRef && resolveValueEntries(project, network, signal).length === 0) {
      out.push(
        issue(
          SEVERITY.WARNING,
          `${path} ${signal.name}`,
          { ...sel, kind: SELECTION_KINDS.SIGNAL, signal: i },
          `valueTableRef "${signal.valueTableRef}" resolves to no entries`,
        ),
      );
    }
  }
  validateBitOverlap(message, ctx, out);
  validateArray(message, ctx, out);
}

/** Validate an entire project document. Returns a flat list of issues. */
export function validateProject(project) {
  const out = [];
  if (!project || typeof project !== 'object') {
    return [issue(SEVERITY.ERROR, 'project', null, 'document is empty or not an object')];
  }
  if (!project.id) out.push(issue(SEVERITY.ERROR, 'project', null, 'project is missing an id'));
  if (!Array.isArray(project.networks) || project.networks.length === 0)
    out.push(issue(SEVERITY.ERROR, 'project', null, 'project must define at least one network'));

  for (const [di, def] of (project.attributeDefinitions ?? []).entries()) {
    const dPath = `attributeDefinitions[${di}]`;
    if (!def.name) out.push(issue(SEVERITY.ERROR, dPath, null, 'attribute definition is missing a name'));
    if (!inEnum(def.type, ENUMS.attributeType))
      out.push(issue(SEVERITY.ERROR, dPath, null, `type must be one of ${ENUMS.attributeType.join(', ')}`));
    for (const scope of def.scopes ?? []) {
      if (!inEnum(scope, ENUMS.attributeScope))
        out.push(issue(SEVERITY.ERROR, dPath, null, `scope "${scope}" is not valid`));
    }
  }

  for (const [ni, network] of (project.networks ?? []).entries()) {
    const sel = { kind: SELECTION_KINDS.NETWORK, network: ni };
    const nPath = network.id ?? `network[${ni}]`;
    if (!network.id) out.push(issue(SEVERITY.ERROR, nPath, sel, 'network is missing an id'));
    if (network.baudrate != null && (typeof network.baudrate !== 'number' || network.baudrate <= 0))
      out.push(issue(SEVERITY.ERROR, nPath, sel, 'baudrate must be a positive number'));
    const ids = new Set();
    for (const [mi, message] of (network.messages ?? []).entries()) {
      const mSel = { kind: SELECTION_KINDS.MESSAGE, network: ni, message: mi };
      const mPath = `${nPath}/${message.name ?? `message[${mi}]`}`;
      if (Number.isInteger(message.frame_id)) {
        if (ids.has(message.frame_id))
          out.push(issue(SEVERITY.WARNING, mPath, mSel, `duplicate frame_id ${message.frame_id} on this network`));
        ids.add(message.frame_id);
      }
      validateMessage(project, network, message, { path: mPath, sel: mSel }, out);
    }
  }
  return out;
}

export function summarizeIssues(issues) {
  let errors = 0;
  let warnings = 0;
  for (const i of issues) {
    if (i.severity === SEVERITY.ERROR) errors++;
    else warnings++;
  }
  return { errors, warnings, valid: errors === 0 };
}

export { SEVERITY };
