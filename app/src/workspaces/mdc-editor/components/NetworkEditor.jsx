// Detail editor for a network: identity, baudrate/FD, environment variables,
// bus-load sweep, network-local value tables, computed signals, and attributes.

import { Trash2, Plus } from 'lucide-react';
import { ENUMS, findAttrDef, attrDisplayValue, makeAttrUpdate, parseCsvList } from '../lib/mdcModel.js';
import { networkIsFd } from '../lib/v3compat.js';
import { TextField, NumberField, SelectField } from './fields.jsx';
import BusLoadTable from './BusLoadTable.jsx';
import ValueTableManager from './ValueTableManager.jsx';
import ComputedSignalEditor from './ComputedSignalEditor.jsx';
import AttributeEditor, { AttributeRow } from './AttributeEditor.jsx';

export default function NetworkEditor({ project, network, update }) {
  const attrUpdate = makeAttrUpdate(update);
  const busTypeDef = findAttrDef(project, 'BusType');
  const envVars = network.environment_variables ?? [];
  const isFd = networkIsFd(network);

  const updateEnv = (i, key, value) => update(['environment_variables', i, key], value);
  const addEnv = () =>
    update(['environment_variables'], [
      ...envVars,
      { name: 'NewEnvVar', env_type: 'integer', access_node: [], comment: '' },
    ]);
  const removeEnv = (i) => update(['environment_variables'], envVars.filter((_, j) => j !== i));

  return (
    <>
      <div className="mdc-card">
        <h2>Network (bus)</h2>
        <div className="mdc-fields">
          <TextField label="Id" value={network.id} onChange={(v) => update(['id'], v)} />
          <TextField label="Name" value={network.name} onChange={(v) => update(['name'], v)} />
          <TextField label="Comment" value={network.comment} onChange={(v) => update(['comment'], v)} />
          <NumberField label="Baudrate (bps)" value={network.baudrate} step={1} onChange={(v) => update(['baudrate'], v)} />
          <NumberField
            label="FD baudrate (bps)"
            value={network.fd_baudrate}
            step={1}
            allowNull
            onChange={(v) => update(['fd_baudrate'], v)}
          />
          {isFd && <p className="mdc-muted" style={{ gridColumn: '1 / -1' }}>CAN FD implied by fd_baudrate.</p>}
          <NumberField label="Sample point (%)" value={network.samplePoint} allowNull onChange={(v) => update(['samplePoint'], v)} />
          {busTypeDef && (
            <AttributeRow
              def={busTypeDef}
              value={attrDisplayValue(busTypeDef, network.attributes)}
              onChange={(v) => attrUpdate(busTypeDef.name, v)}
              prominent
            />
          )}
          <label>Nodes</label>
          <span className="mdc-muted">{(network.nodes ?? []).length} (edit via tree)</span>
        </div>
      </div>

      <div className="mdc-card">
        <h2>Environment variables</h2>
        {envVars.length === 0 && <p className="mdc-muted">None defined (DBC EV_).</p>}
        {envVars.map((ev, i) => (
          <div key={i} style={{ marginBottom: 14, paddingBottom: 12, borderBottom: '1px solid var(--mdc-line-soft)' }}>
            <div className="mdc-fields" style={{ gridTemplateColumns: '140px 1fr 28px' }}>
              <label>Name</label>
              <input className="mdc-input" value={ev.name ?? ''} onChange={(e) => updateEnv(i, 'name', e.target.value)} />
              <button className="mdc-icon-btn" title="Remove" onClick={() => removeEnv(i)}>
                <Trash2 size={14} />
              </button>

              <label>Type</label>
              <select
                className="mdc-select"
                value={ev.env_type ?? 'integer'}
                onChange={(e) => updateEnv(i, 'env_type', e.target.value)}
              >
                {ENUMS.envType.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
              <span />

              <label>Min / Max</label>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  className="mdc-input mono"
                  type="number"
                  placeholder="min"
                  value={ev.minimum ?? ''}
                  onChange={(e) => updateEnv(i, 'minimum', e.target.value === '' ? null : Number(e.target.value))}
                />
                <input
                  className="mdc-input mono"
                  type="number"
                  placeholder="max"
                  value={ev.maximum ?? ''}
                  onChange={(e) => updateEnv(i, 'maximum', e.target.value === '' ? null : Number(e.target.value))}
                />
              </div>
              <span />

              <label>Unit</label>
              <input className="mdc-input" value={ev.unit ?? ''} onChange={(e) => updateEnv(i, 'unit', e.target.value)} />
              <span />

              <label>Initial</label>
              <input
                className="mdc-input mono"
                type="number"
                value={ev.initial_value ?? ''}
                onChange={(e) => updateEnv(i, 'initial_value', e.target.value === '' ? null : Number(e.target.value))}
              />
              <span />

              <label>Access</label>
              <input
                className="mdc-input"
                value={ev.access_type ?? ''}
                placeholder="DUMMY_NODE_VECTOR0"
                onChange={(e) => updateEnv(i, 'access_type', e.target.value)}
              />
              <span />

              <label>Access nodes</label>
              <input
                className="mdc-input mono"
                value={(ev.access_node ?? []).join(', ')}
                onChange={(e) => updateEnv(i, 'access_node', parseCsvList(e.target.value))}
              />
              <span />

              <label>Comment</label>
              <input className="mdc-input" value={ev.comment ?? ''} onChange={(e) => updateEnv(i, 'comment', e.target.value)} />
              <span />
            </div>
          </div>
        ))}
        <button className="mdc-btn mdc-list-add" onClick={addEnv}>
          <Plus size={12} style={{ verticalAlign: -2 }} /> Add environment variable
        </button>
      </div>

      <BusLoadTable network={network} />

      <ValueTableManager
        title="Value tables (network)"
        tables={network.valueTables}
        update={(path, value) => update(['valueTables', ...path], value)}
        onReplace={(value) => update(['valueTables'], value)}
      />

      <ComputedSignalEditor
        computedSignals={network.computedSignals}
        update={(path, value) => update(['computedSignals', ...path], value)}
        onReplace={(value) => update(['computedSignals'], value)}
      />

      <AttributeEditor
        project={project}
        scope="network"
        attributes={network.attributes}
        update={attrUpdate}
        exclude={['BusType']}
      />
    </>
  );
}
