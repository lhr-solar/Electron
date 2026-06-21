// Detail editor for one message: identity/framing, cycle time + send_type,
// signal groups, container/contained messages, array block, bit grid, computed
// signals, and attributes.

import { Trash2, Plus } from 'lucide-react';
import {
  ENUMS,
  DEFAULT_CYCLE_TIME_MS,
  formatHex,
  parseHexInt,
  findAttrDef,
  attrDisplayValue,
  makeAttrUpdate,
  parseCsvList,
} from '../lib/mdcModel.js';
import { isCyclicMessage } from '../lib/v3compat.js';
import { j1939FromId, showJ1939Readout } from '../lib/j1939.js';
import { TextField, NumberField, SelectField, CheckField, TagList } from './fields.jsx';
import BitLayoutGrid from './BitLayoutGrid.jsx';
import ComputedSignalEditor from './ComputedSignalEditor.jsx';
import AttributeEditor, { AttributeRow } from './AttributeEditor.jsx';

export default function MessageEditor({ project, message, update }) {
  const signalNames = (message.signals ?? []).map((s) => s.name);
  const arr = message.array;
  const cyclic = isCyclicMessage(message);
  const j1939 = showJ1939Readout(message) ? j1939FromId(message.frame_id) : null;
  const attrUpdate = makeAttrUpdate(update);
  const vffDef = findAttrDef(project, 'VFrameFormat');
  const groups = message.signal_groups ?? [];
  const contained = message.contained_messages ?? [];
  const showContainer = message.transport === 'isotp' || contained.length > 0;

  const setArrayField = (key, value) => {
    const base = arr ?? { indexSignal: '', elementSignals: [], storage: 'series_per_index' };
    update(['array'], { ...base, [key]: value });
  };

  const updateGroup = (i, key, value) => update(['signal_groups', i, key], value);
  const addGroup = () =>
    update(['signal_groups'], [...groups, { name: 'NewGroup', repetitions: 1, signal_names: [] }]);
  const removeGroup = (i) => update(['signal_groups'], groups.filter((_, j) => j !== i));

  const updateContained = (i, key, value) => update(['contained_messages', i, key], value);
  const addContained = () =>
    update(['contained_messages'], [
      ...contained,
      { name: 'ContainedMsg', header_id: 0, length: 8, signals: [], senders: [] },
    ]);
  const removeContained = (i) => update(['contained_messages'], contained.filter((_, j) => j !== i));

  return (
    <>
      <div className="mdc-card">
        <h2>Message</h2>
        <div className="mdc-fields">
          <TextField label="Name" value={message.name} onChange={(v) => update(['name'], v)} />
          <TextField label="Comment" value={message.comment} onChange={(v) => update(['comment'], v)} />
          <label>Frame id</label>
          <input
            className="mdc-input mono"
            value={formatHex(message.frame_id)}
            placeholder="0x0"
            onChange={(e) => update(['frame_id'], parseHexInt(e.target.value, 0, 0x1fffffff) ?? 0)}
          />
          <NumberField label="Length (DLC)" value={message.length} step={1} onChange={(v) => update(['length'], v)} />
          <CheckField
            label="Extended frame"
            value={message.is_extended_frame}
            onChange={(v) => update(['is_extended_frame'], v)}
          />
          <CheckField label="CAN FD" value={message.is_fd} onChange={(v) => update(['is_fd'], v)} />
          <SelectField
            label="Protocol"
            value={message.protocol ?? ''}
            options={[{ value: '', label: 'none' }, ...ENUMS.messageProtocol.map((p) => ({ value: p, label: p }))]}
            onChange={(v) => update(['protocol'], v || null)}
          />
          <SelectField
            label="Transport"
            value={message.transport ?? ''}
            options={[
              { value: 'single', label: 'Single frame' },
              { value: 'isotp', label: 'ISO-TP (multi-frame)' },
              { value: 'multiframe', label: 'Multi-frame (MDC)' },
            ]}
            includeEmpty
            onChange={(v) => update(['transport'], v || undefined)}
          />
          {vffDef && (
            <AttributeRow
              def={vffDef}
              value={attrDisplayValue(vffDef, message.attributes)}
              onChange={(v) => attrUpdate(vffDef.name, v)}
              prominent
            />
          )}
          <label>Senders</label>
          <TagList items={message.senders} />
        </div>
        {j1939 && (
          <div className="mdc-j1939-readout" style={{ marginTop: 10 }}>
            <div className="mdc-facet-label">J1939 (derived from 29-bit frame_id)</div>
            <table className="mdc-table" style={{ maxWidth: 360 }}>
              <tbody>
                <tr>
                  <td className="mdc-muted">Priority</td>
                  <td className="num">{j1939.priority}</td>
                </tr>
                <tr>
                  <td className="mdc-muted">PGN</td>
                  <td className="num">
                    0x{j1939.pgn.toString(16).toUpperCase()} ({j1939.pgn})
                  </td>
                </tr>
                <tr>
                  <td className="mdc-muted">Source address</td>
                  <td className="num">
                    0x{j1939.sourceAddress.toString(16).toUpperCase().padStart(2, '0')} ({j1939.sourceAddress})
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="mdc-card">
        <h2>Timing & transmission</h2>
        <div className="mdc-fields">
          <TextField
            label="Send type"
            value={message.send_type}
            placeholder="Cyclic, Event, Triggered, …"
            onChange={(v) => update(['send_type'], v || undefined)}
          />
          <NumberField
            label={`Cycle time (ms)${cyclic ? ` · default ${DEFAULT_CYCLE_TIME_MS}` : ''}`}
            value={message.cycle_time}
            step={1}
            allowNull
            onChange={(v) => update(['cycle_time'], v)}
          />
        </div>
        {!cyclic && (
          <p className="mdc-muted" style={{ marginTop: 8 }}>
            Triggered/event send types are excluded from the bus-load sweep.
          </p>
        )}
      </div>

      <div className="mdc-card">
        <h2>Signal groups</h2>
        {groups.length === 0 && <p className="mdc-muted">None defined (DBC SIG_GROUP_).</p>}
        {groups.map((g, i) => (
          <div key={i} style={{ marginBottom: 12, paddingBottom: 12, borderBottom: '1px solid var(--mdc-line-soft)' }}>
            <div className="mdc-fields">
              <TextField label="Name" value={g.name} onChange={(v) => updateGroup(i, 'name', v)} />
              <NumberField
                label="Repetitions"
                value={g.repetitions ?? 1}
                step={1}
                onChange={(v) => updateGroup(i, 'repetitions', v)}
              />
              <label>Member signals</label>
              <div>
                {signalNames.map((n) => {
                  const active = (g.signal_names ?? []).includes(n);
                  return (
                    <span
                      key={n}
                      className="mdc-chip"
                      data-active={active}
                      onClick={() => {
                        const set = new Set(g.signal_names ?? []);
                        active ? set.delete(n) : set.add(n);
                        updateGroup(i, 'signal_names', [...set]);
                      }}
                    >
                      {n}
                    </span>
                  );
                })}
              </div>
            </div>
            <button className="mdc-icon-btn" title="Remove group" onClick={() => removeGroup(i)}>
              <Trash2 size={14} />
            </button>
          </div>
        ))}
        <button className="mdc-btn mdc-list-add" onClick={addGroup}>
          <Plus size={12} style={{ verticalAlign: -2 }} /> Add signal group
        </button>
      </div>

      {showContainer && (
        <div className="mdc-card">
          <h2>Container / contained messages</h2>
          {contained.length === 0 && <p className="mdc-muted">No contained sub-PDUs.</p>}
          {contained.map((cm, i) => (
            <div key={i} style={{ marginBottom: 12, paddingBottom: 12, borderBottom: '1px solid var(--mdc-line-soft)' }}>
              <div className="mdc-fields">
                <TextField label="Name" value={cm.name} onChange={(v) => updateContained(i, 'name', v)} />
                <label>Header id</label>
                <input
                  className="mdc-input mono"
                  value={formatHex(cm.header_id)}
                  onChange={(e) => updateContained(i, 'header_id', parseHexInt(e.target.value, 0, 0x1fffffff) ?? 0)}
                />
                <NumberField label="Length" value={cm.length} step={1} onChange={(v) => updateContained(i, 'length', v)} />
                <TextField label="Comment" value={cm.comment} onChange={(v) => updateContained(i, 'comment', v)} />
                <TextField
                  label="Senders"
                  value={(cm.senders ?? []).join(', ')}
                  onChange={(v) => updateContained(i, 'senders', parseCsvList(v))}
                />
              </div>
              <button className="mdc-icon-btn" title="Remove contained message" onClick={() => removeContained(i)}>
                <Trash2 size={14} />
              </button>
            </div>
          ))}
          <button className="mdc-btn mdc-list-add" onClick={addContained}>
            <Plus size={12} style={{ verticalAlign: -2 }} /> Add contained message
          </button>
        </div>
      )}

      <div className="mdc-card">
        <h2>Bit layout</h2>
        <BitLayoutGrid message={message} />
      </div>

      <div className="mdc-card">
        <h2>Array / indexed message</h2>
        {arr ? (
          <>
            <div className="mdc-fields">
              <SelectField
                label="Index signal"
                value={arr.indexSignal}
                options={signalNames}
                includeEmpty
                onChange={(v) => setArrayField('indexSignal', v ?? '')}
              />
              <SelectField
                label="Storage"
                value={arr.storage ?? 'series_per_index'}
                options={ENUMS.arrayStorage}
                onChange={(v) => setArrayField('storage', v)}
              />
              <NumberField
                label="Size (elements)"
                value={arr.size}
                step={1}
                allowNull
                onChange={(v) => setArrayField('size', v)}
              />
              <label>Element signals</label>
              <div>
                {signalNames
                  .filter((n) => n !== arr.indexSignal)
                  .map((n) => {
                    const active = (arr.elementSignals ?? []).includes(n);
                    return (
                      <span
                        key={n}
                        className="mdc-chip"
                        data-active={active}
                        onClick={() => {
                          const set = new Set(arr.elementSignals ?? []);
                          active ? set.delete(n) : set.add(n);
                          setArrayField('elementSignals', [...set]);
                        }}
                      >
                        {n}
                      </span>
                    );
                  })}
              </div>
            </div>
            <button className="mdc-btn" style={{ marginTop: 10 }} onClick={() => update(['array'], undefined)}>
              Remove array block
            </button>
          </>
        ) : (
          <>
            <p className="mdc-muted">This message is not an indexed/array message.</p>
            <button
              className="mdc-btn mdc-list-add"
              onClick={() =>
                update(['array'], {
                  indexSignal: signalNames[0] ?? '',
                  elementSignals: signalNames.slice(1),
                  size: null,
                  storage: 'series_per_index',
                })
              }
            >
              + Add array block
            </button>
          </>
        )}
      </div>

      <ComputedSignalEditor
        computedSignals={message.computedSignals}
        update={(path, value) => update(['computedSignals', ...path], value)}
        onReplace={(value) => update(['computedSignals'], value)}
      />

      <AttributeEditor
        project={project}
        scope="message"
        attributes={message.attributes}
        update={attrUpdate}
        exclude={['VFrameFormat']}
      />
    </>
  );
}
