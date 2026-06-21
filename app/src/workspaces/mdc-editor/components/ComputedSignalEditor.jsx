// Editor for a list of computed/virtual signals (expr + dependsOn).

import { Trash2 } from 'lucide-react';
import { parseCsvList } from '../lib/mdcModel.js';

export default function ComputedSignalEditor({ computedSignals, update, onReplace }) {
  const list = computedSignals ?? [];

  const addOne = () =>
    onReplace([
      ...list,
      { name: 'NewComputed', expr: '', dependsOn: [], is_signed: false, is_float: true, unit: '' },
    ]);

  const removeAt = (i) => onReplace(list.filter((_, idx) => idx !== i));

  return (
    <div className="mdc-card">
      <h2>Computed signals</h2>
      {list.length === 0 && <p className="mdc-muted">None defined.</p>}
      {list.map((cs, i) => (
        <div key={i} className="mdc-fields" style={{ marginBottom: 14, gridTemplateColumns: '140px 1fr 28px' }}>
          <label>Name</label>
          <input className="mdc-input" value={cs.name ?? ''} onChange={(e) => update([i, 'name'], e.target.value)} />
          <button className="mdc-icon-btn" title="Remove" onClick={() => removeAt(i)}>
            <Trash2 size={14} />
          </button>

          <label>Comment</label>
          <input className="mdc-input" value={cs.comment ?? ''} onChange={(e) => update([i, 'comment'], e.target.value)} />
          <span />

          <label>Expression</label>
          <input
            className="mdc-input mono"
            value={cs.expr ?? ''}
            placeholder="e.g. Torque * MotorRPM * 0.10472"
            onChange={(e) => update([i, 'expr'], e.target.value)}
          />
          <span />

          <label>Depends on</label>
          <input
            className="mdc-input mono"
            value={(cs.dependsOn ?? []).join(', ')}
            placeholder="Torque, MotorRPM"
            onChange={(e) => update([i, 'dependsOn'], parseCsvList(e.target.value))}
          />
          <span />

          <label>Signed</label>
          <div className="mdc-checkbox-row">
            <input
              type="checkbox"
              checked={Boolean(cs.is_signed)}
              onChange={(e) => update([i, 'is_signed'], e.target.checked)}
            />
          </div>
          <span />

          <label>Float</label>
          <div className="mdc-checkbox-row">
            <input
              type="checkbox"
              checked={cs.is_float ?? true}
              onChange={(e) => update([i, 'is_float'], e.target.checked)}
            />
          </div>
          <span />

          <label>Unit</label>
          <input className="mdc-input" value={cs.unit ?? ''} onChange={(e) => update([i, 'unit'], e.target.value)} />
          <span />
        </div>
      ))}
      <button className="mdc-btn mdc-list-add" onClick={addOne}>
        + Add computed signal
      </button>
    </div>
  );
}
