// Manage a list of value tables (network-local or project-shared). Each table is
// a name + entries[{ value, label, description? }]. Edits write back through the
// provided update/replace callbacks so the same component serves both scopes.

import { Trash2, Plus } from 'lucide-react';

export default function ValueTableManager({ title, tables, update, onReplace }) {
  const list = tables ?? [];

  const addTable = () => onReplace([...list, { name: 'NewTable', entries: [{ value: 0, label: '' }] }]);
  const removeTable = (ti) => onReplace(list.filter((_, i) => i !== ti));
  const addEntry = (ti) =>
    update([ti, 'entries'], [...(list[ti].entries ?? []), { value: 0, label: '' }]);
  const removeEntry = (ti, ei) =>
    update([ti, 'entries'], (list[ti].entries ?? []).filter((_, i) => i !== ei));

  return (
    <div className="mdc-card">
      <h2>{title}</h2>
      {list.length === 0 && <p className="mdc-muted">No value tables.</p>}
      {list.map((table, ti) => (
        <div key={ti} style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <input
              className="mdc-input"
              style={{ maxWidth: 220 }}
              value={table.name ?? ''}
              onChange={(e) => update([ti, 'name'], e.target.value)}
            />
            <button className="mdc-icon-btn" title="Remove table" onClick={() => removeTable(ti)}>
              <Trash2 size={14} />
            </button>
          </div>
          <table className="mdc-table">
            <thead>
              <tr>
                <th className="num">Value</th>
                <th>Label</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {(table.entries ?? []).map((entry, ei) => (
                <tr key={ei}>
                  <td className="num">
                    <input
                      className="mdc-input mono"
                      type="number"
                      style={{ maxWidth: 90 }}
                      value={entry.value}
                      onChange={(e) => update([ti, 'entries', ei, 'value'], Number(e.target.value))}
                    />
                  </td>
                  <td>
                    <input
                      className="mdc-input"
                      value={entry.label ?? ''}
                      onChange={(e) => update([ti, 'entries', ei, 'label'], e.target.value)}
                    />
                  </td>
                  <td>
                    <button className="mdc-icon-btn" title="Remove entry" onClick={() => removeEntry(ti, ei)}>
                      <Trash2 size={13} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <button className="mdc-btn mdc-list-add" onClick={() => addEntry(ti)}>
            <Plus size={12} style={{ verticalAlign: -2 }} /> Add entry
          </button>
        </div>
      ))}
      <button className="mdc-btn mdc-list-add" onClick={addTable}>
        + Add value table
      </button>
    </div>
  );
}
