// Small controlled form primitives shared by every detail editor. Each calls
// onChange with the parsed value; numeric inputs coerce to number|null so the
// document stays schema-shaped. Kept dependency-free (plain inputs styled by
// mdc-editor.css) to match the editor's hairline aesthetic.

export function TextField({ label, value, onChange, mono, placeholder }) {
  return (
    <>
      <label>{label}</label>
      <input
        className={`mdc-input${mono ? ' mono' : ''}`}
        value={value ?? ''}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    </>
  );
}

export function NumberField({ label, value, onChange, step, mono = true, allowNull, min, max }) {
  return (
    <>
      <label>{label}</label>
      <input
        className={`mdc-input${mono ? ' mono' : ''}`}
        type="number"
        step={step ?? 'any'}
        min={min}
        max={max}
        value={value ?? ''}
        onChange={(e) => {
          const raw = e.target.value;
          if (raw === '') return onChange(allowNull ? null : undefined);
          const n = Number(raw);
          onChange(Number.isNaN(n) ? raw : n);
        }}
      />
    </>
  );
}

export function SelectField({ label, value, options, onChange, includeEmpty }) {
  return (
    <>
      <label>{label}</label>
      <select className="mdc-select" value={value ?? ''} onChange={(e) => onChange(e.target.value || undefined)}>
        {includeEmpty && <option value="">—</option>}
        {options.map((opt) => {
          const o = typeof opt === 'string' ? { value: opt, label: opt } : opt;
          return (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          );
        })}
      </select>
    </>
  );
}

export function CheckField({ label, value, onChange }) {
  return (
    <>
      <label>{label}</label>
      <div className="mdc-checkbox-row">
        <input type="checkbox" checked={Boolean(value)} onChange={(e) => onChange(e.target.checked)} />
      </div>
    </>
  );
}

export function TagList({ items }) {
  if (!items || items.length === 0) return <span className="mdc-muted">—</span>;
  return (
    <span>
      {items.map((t) => (
        <span key={t} className="mdc-tag-pill">
          {t}
        </span>
      ))}
    </span>
  );
}
