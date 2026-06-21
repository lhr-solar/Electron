// Project-level detail: root/vehicle identity, metadata, attributeDefinitions CRUD,
// root attributes, and project-shared value tables.

import { Trash2, Plus } from 'lucide-react';
import { ENUMS, parseCsvList, parseHexInt } from '../lib/mdcModel.js';
import { PREDEFINED_CAN_ATTRIBUTES } from '../lib/predefinedAttributes.js';
import { TextField, NumberField, SelectField } from './fields.jsx';
import ValueTableManager from './ValueTableManager.jsx';
import AttributeEditor from './AttributeEditor.jsx';

export default function ProjectEditor({ project, update }) {
  const meta = project.metadata ?? {};
  const defs = project.attributeDefinitions ?? [];

  const replaceDefs = (value) => update(['attributeDefinitions'], value);
  const updateDef = (i, key, value) => update(['attributeDefinitions', i, key], value);

  const addDef = () =>
    replaceDefs([...defs, { name: 'NewAttribute', type: 'string', scopes: [], description: '' }]);

  const removeDef = (i) => replaceDefs(defs.filter((_, j) => j !== i));

  const loadPredefined = () => {
    const existing = new Set(defs.map((d) => d.name));
    const merged = [...defs];
    for (const attr of PREDEFINED_CAN_ATTRIBUTES) {
      if (!existing.has(attr.name)) merged.push({ ...attr });
    }
    replaceDefs(merged);
  };

  const toggleScope = (i, scope) => {
    const scopes = new Set(defs[i].scopes ?? []);
    scopes.has(scope) ? scopes.delete(scope) : scopes.add(scope);
    updateDef(i, 'scopes', [...scopes]);
  };

  const updateEnumValues = (i, text) => updateDef(i, 'enumValues', parseCsvList(text));

  return (
    <>
      <div className="mdc-card">
        <h2>Vehicle / project</h2>
        <div className="mdc-fields">
          <TextField label="Id" value={project.id} onChange={(v) => update(['id'], v)} />
          <TextField label="Name" value={project.name} onChange={(v) => update(['name'], v)} />
          <TextField label="Description" value={project.description} onChange={(v) => update(['description'], v)} />
          <label>Networks</label>
          <span className="mdc-muted">{(project.networks ?? []).length} (edit via tree)</span>
          <TextField label="Schema version" value={project.schemaVersion} onChange={(v) => update(['schemaVersion'], v)} />
        </div>
      </div>

      <div className="mdc-card">
        <h2>Provenance metadata</h2>
        <div className="mdc-fields">
          <TextField label="Metadata name" value={meta.name} onChange={(v) => update(['metadata', 'name'], v)} />
          <TextField
            label="Metadata description"
            value={meta.description}
            onChange={(v) => update(['metadata', 'description'], v)}
          />
          <TextField label="Author" value={meta.author} onChange={(v) => update(['metadata', 'author'], v)} />
          <TextField label="Revision" value={meta.revision} onChange={(v) => update(['metadata', 'revision'], v)} />
        </div>
      </div>

      <AttributeEditor
        project={project}
        scope="vehicle"
        attributes={project.attributes}
        update={(name, value) => update(['attributes', name], value)}
      />

      <div className="mdc-card">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <h2 style={{ margin: 0, flex: 1 }}>Attribute definitions</h2>
          <button className="mdc-btn" onClick={loadPredefined}>
            Load predefined CANdb++ attributes
          </button>
        </div>
        {defs.length === 0 ? (
          <p className="mdc-muted">None defined.</p>
        ) : (
          defs.map((d, i) => (
            <div key={d.name ?? i} style={{ marginBottom: 16, paddingBottom: 12, borderBottom: '1px solid var(--mdc-line-soft)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <input
                  className="mdc-input"
                  style={{ maxWidth: 180 }}
                  value={d.name ?? ''}
                  onChange={(e) => updateDef(i, 'name', e.target.value)}
                  placeholder="Name"
                />
                <select
                  className="mdc-select"
                  style={{ maxWidth: 100 }}
                  value={d.type ?? 'string'}
                  onChange={(e) => updateDef(i, 'type', e.target.value)}
                >
                  {ENUMS.attributeType.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
                <button className="mdc-icon-btn" title="Remove definition" onClick={() => removeDef(i)}>
                  <Trash2 size={14} />
                </button>
              </div>
              <div className="mdc-fields">
                <TextField label="Description" value={d.description} onChange={(v) => updateDef(i, 'description', v)} />
                <label>Scopes (empty = all)</label>
                <div>
                  {ENUMS.attributeScope.map((scope) => (
                    <span
                      key={scope}
                      className="mdc-chip"
                      data-active={(d.scopes ?? []).includes(scope)}
                      onClick={() => toggleScope(i, scope)}
                    >
                      {scope}
                    </span>
                  ))}
                </div>
                {(d.type === 'int' || d.type === 'float' || d.type === 'hex') && (
                  <>
                    <NumberField label="Min" value={d.min} allowNull onChange={(v) => updateDef(i, 'min', v)} />
                    <NumberField label="Max" value={d.max} allowNull onChange={(v) => updateDef(i, 'max', v)} />
                  </>
                )}
                {d.type === 'enum' && (
                  <TextField
                    label="Enum values (comma-separated)"
                    value={(d.enumValues ?? []).join(', ')}
                    onChange={(v) => updateEnumValues(i, v)}
                  />
                )}
                <TextField
                  label="Default"
                  value={d.default ?? ''}
                  onChange={(v) => {
                    let val = v;
                    if (v === '') val = undefined;
                    else if (d.type === 'int' || d.type === 'float') val = Number(v);
                    else if (d.type === 'hex') val = parseHexInt(v, d.min, d.max);
                    else if (d.type === 'bool') val = v === 'true';
                    updateDef(i, 'default', val);
                  }}
                />
              </div>
            </div>
          ))
        )}
        <button className="mdc-btn mdc-list-add" onClick={addDef}>
          <Plus size={12} style={{ verticalAlign: -2 }} /> Add attribute definition
        </button>
      </div>

      <ValueTableManager
        title="Value tables (project-shared)"
        tables={project.valueTables}
        update={(path, value) => update(['valueTables', ...path], value)}
        onReplace={(value) => update(['valueTables'], value)}
      />
    </>
  );
}
