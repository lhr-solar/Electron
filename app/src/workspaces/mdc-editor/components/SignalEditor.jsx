// Detail editor for one signal: bit field, numeric interpretation, conversion
// (scale/offset + optional rational/table), unit/range, multiplexer fields, and
// resolved value-table entries.

import {
  ENUMS,
  BYTE_ORDER_OPTIONS,
  formatHex,
  parseHexInt,
  makeAttrUpdate,
  parseCsvList,
  resolveValueEntries,
} from '../lib/mdcModel.js';
import { TextField, NumberField, SelectField, CheckField } from './fields.jsx';
import AttributeEditor from './AttributeEditor.jsx';

function defaultConversion(kind) {
  switch (kind) {
    case 'rational':
      return { kind: 'rational', numerator: [1, 0], denominator: [1], offset: 0 };
    case 'table':
      return { kind: 'table' };
    default:
      return undefined;
  }
}

export default function SignalEditor({ project, network, signal, update }) {
  const conv = signal.conversion;
  const entries = resolveValueEntries(project, network, signal);
  const attrUpdate = makeAttrUpdate(update);

  return (
    <>
      <div className="mdc-card">
        <h2>Bit field</h2>
        <div className="mdc-fields">
          <TextField label="Name" value={signal.name} onChange={(v) => update(['name'], v)} />
          <TextField label="Comment" value={signal.comment} onChange={(v) => update(['comment'], v)} />
          <NumberField label="Start bit" value={signal.start} step={1} onChange={(v) => update(['start'], v)} />
          <NumberField label="Length (bits)" value={signal.length} step={1} onChange={(v) => update(['length'], v)} />
          <SelectField
            label="Byte order"
            value={signal.byte_order}
            options={BYTE_ORDER_OPTIONS}
            onChange={(v) => update(['byte_order'], v)}
          />
          <CheckField label="Signed" value={signal.is_signed} onChange={(v) => update(['is_signed'], v)} />
          <CheckField label="Float" value={signal.is_float} onChange={(v) => update(['is_float'], v)} />
          <TextField label="Unit" value={signal.unit} onChange={(v) => update(['unit'], v)} />
          <NumberField label="Minimum" value={signal.minimum} allowNull onChange={(v) => update(['minimum'], v)} />
          <NumberField label="Maximum" value={signal.maximum} allowNull onChange={(v) => update(['maximum'], v)} />
          <label>SPN</label>
          <input
            className="mdc-input mono"
            value={formatHex(signal.spn)}
            placeholder="0x0"
            onChange={(e) => update(['spn'], parseHexInt(e.target.value, 0, 524287) ?? null)}
          />
        </div>
      </div>

      <div className="mdc-card">
        <h2>Conversion (raw → physical)</h2>
        <div className="mdc-fields">
          <NumberField
            label="Scale"
            value={signal.scale ?? 1}
            onChange={(v) => update(['scale'], v)}
          />
          <NumberField
            label="Offset"
            value={signal.offset ?? 0}
            onChange={(v) => update(['offset'], v)}
          />
          <p className="mdc-muted" style={{ gridColumn: '1 / -1' }}>
            Default: physical = scale × raw + offset. Use advanced conversion only for rational or table math.
          </p>
          <SelectField
            label="Advanced conversion"
            value={conv?.kind ?? ''}
            options={[
              { value: '', label: '— (use scale/offset)' },
              ...ENUMS.conversionKind.map((k) => ({ value: k, label: k })),
            ]}
            onChange={(v) => update(['conversion'], v ? defaultConversion(v) : undefined)}
          />
          {conv?.kind === 'rational' && (
            <>
              <TextField
                label="Numerator"
                mono
                value={(conv.numerator ?? []).join(', ')}
                onChange={(v) => update(['conversion', 'numerator'], parseCsvList(v, { asNumber: true }))}
              />
              <TextField
                label="Denominator"
                mono
                value={(conv.denominator ?? []).join(', ')}
                onChange={(v) => update(['conversion', 'denominator'], parseCsvList(v, { asNumber: true }))}
              />
              <NumberField label="Offset" value={conv.offset} onChange={(v) => update(['conversion', 'offset'], v)} />
            </>
          )}
          {conv?.kind === 'table' && (
            <TextField
              label="Value table ref"
              value={signal.valueTableRef}
              onChange={(v) => update(['valueTableRef'], v || undefined)}
            />
          )}
        </div>
      </div>

      <div className="mdc-card">
        <h2>Multiplexing & values</h2>
        <div className="mdc-fields" style={{ marginBottom: 12 }}>
          <CheckField
            label="Is multiplexer"
            value={signal.is_multiplexer}
            onChange={(v) => update(['is_multiplexer'], v)}
          />
          {!signal.is_multiplexer && (
            <>
              <TextField
                label="Multiplexer signal"
                value={signal.multiplexer_signal}
                onChange={(v) => update(['multiplexer_signal'], v || undefined)}
              />
              <TextField
                label="Multiplexer ids"
                mono
                value={(signal.multiplexer_ids ?? []).join(', ')}
                onChange={(v) => update(['multiplexer_ids'], parseCsvList(v, { asNumber: true }))}
              />
            </>
          )}
        </div>
        {entries.length > 0 && (
            <table className="mdc-table">
              <thead>
                <tr>
                  <th className="num">Value</th>
                  <th>Label</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((e) => (
                  <tr key={e.value}>
                    <td className="num">{e.value}</td>
                    <td>{e.label}</td>
                  </tr>
                ))}
              </tbody>
            </table>
        )}
      </div>

      <AttributeEditor project={project} scope="signal" attributes={signal.attributes} update={attrUpdate} />
    </>
  );
}
