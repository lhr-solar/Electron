// Attribute editor driven by the project's attributeDefinitions. Only definitions
// whose `scopes` include the current entity scope are shown; the widget type is
// chosen from the definition `type` (enum→select, int/float/hex→number, bool→checkbox,
// string→text), with min/max/enumValues applied. Values write into the entity's
// `attributes` map keyed by definition name.

import { formatHex, parseHexInt, attrDisplayValue } from '../lib/mdcModel.js';
import { TextField, NumberField, SelectField, CheckField } from './fields.jsx';

export default function AttributeEditor({ project, scope, attributes, update, exclude = [] }) {
  const skip = new Set(exclude);
  const defs = (project?.attributeDefinitions ?? []).filter(
    (d) => !skip.has(d.name) && (!d.scopes || d.scopes.includes(scope)),
  );
  if (defs.length === 0) return null;
  const values = attributes ?? {};

  return (
    <div className="mdc-card">
      <h2>Attributes</h2>
      <div className="mdc-fields">
        {defs.map((def) => (
          <AttributeRow
            key={def.name}
            def={def}
            value={attrDisplayValue(def, values)}
            onChange={(v) => update(def.name, v)}
          />
        ))}
      </div>
    </div>
  );
}

/** Single prominent attribute row (entity editors place these inline in their field grid). */
export function AttributeRow({ def, value, onChange, prominent }) {
  const label = (
    <label title={def.description}>
      {def.name}
      {!prominent && <span className="mdc-muted"> · {def.type}</span>}
    </label>
  );

  switch (def.type) {
    case 'enum':
      return (
        <SelectField
          label={
            <>
              {def.name}
              {!prominent && <span className="mdc-muted"> · {def.type}</span>}
            </>
          }
          value={value}
          options={def.enumValues ?? []}
          includeEmpty
          onChange={onChange}
        />
      );
    case 'bool':
      return <CheckField label={def.name} value={value} onChange={onChange} />;
    case 'int':
    case 'float':
      return (
        <NumberField
          label={
            <>
              {def.name}
              {!prominent && <span className="mdc-muted"> · {def.type}</span>}
            </>
          }
          value={value}
          step={def.type === 'int' ? 1 : 'any'}
          min={def.min}
          max={def.max}
          onChange={onChange}
        />
      );
    case 'hex':
      return (
        <>
          {label}
          <input
            className="mdc-input mono"
            value={formatHex(value)}
            placeholder="0x0"
            onChange={(e) => onChange(parseHexInt(e.target.value, def.min, def.max))}
          />
        </>
      );
    default:
      return <TextField label={def.name} value={value} onChange={onChange} />;
  }
}
