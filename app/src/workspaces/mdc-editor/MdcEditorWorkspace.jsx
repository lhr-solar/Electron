// MDC Editor workspace — an editor for one MDC project document.
//
// Layout: header (load/save/import/export + DBC import/export + status) · tree explorer
// (network → node → message → signal) · detail panel with live validation.
//
// Data flow: load via GET /api/mdc/{spec_id} when available, else fall back to the
// bundled lhr-ev1 sample and local file import. Saving uses saveSpec(specId).

import { useEffect, useMemo, useState } from 'react';
import { FolderOpen, Save, Upload, Download, FileInput, FileOutput } from 'lucide-react';
import { engineClient } from '../../lib/engineClient.js';
import VehicleSelect from '../../components/VehicleSelect.jsx';
import { useVehicles } from '../../lib/useVehicles.js';
import { SAMPLE_PROJECT } from './lib/sampleProject.js';
import { SELECTION_KINDS, setIn } from './lib/mdcModel.js';
import { validateProject, summarizeIssues } from './lib/validate.js';
import TreeExplorer from './components/TreeExplorer.jsx';
import DetailPanel from './components/DetailPanel.jsx';
import ValidationPanel from './components/ValidationPanel.jsx';
import './mdc-editor.css';

const PROJECT_SELECTION = { kind: SELECTION_KINDS.PROJECT };
const DEFAULT_SPEC_ID = 'default';

function clone(project) {
  return structuredClone(project);
}

function isV3Project(spec) {
  return spec && Array.isArray(spec.networks);
}

export default function MdcEditorWorkspace() {
  const { resolvedDefault } = useVehicles();
  const [vehicleId, setVehicleId] = useState(null);
  const [project, setProject] = useState(() => clone(SAMPLE_PROJECT));
  const [selection, setSelection] = useState(PROJECT_SELECTION);
  const [source, setSource] = useState('sample'); // 'sample' | 'backend' | 'file' | 'dbc'
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [dbcWarnings, setDbcWarnings] = useState(null);

  useEffect(() => {
    if (resolvedDefault && !vehicleId) setVehicleId(resolvedDefault);
  }, [resolvedDefault, vehicleId]);

  useEffect(() => {
    let cancelled = false;
    engineClient
      .getSpec(DEFAULT_SPEC_ID)
      .then((spec) => {
        if (!cancelled && isV3Project(spec)) {
          setProject(spec);
          setSource('backend');
        }
      })
      .catch((err) => {
        console.error('MDC editor: failed to load spec on mount', err);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const issues = useMemo(() => validateProject(project), [project]);
  const summary = useMemo(() => summarizeIssues(issues), [issues]);

  const networkForSelection =
    selection?.network != null ? project.networks?.[selection.network] : null;

  const changeAt = (path, value) => setProject((prev) => setIn(prev, path, value));

  const loadFromBackend = async () => {
    setBusy(true);
    setError(null);
    try {
      const spec = await engineClient.getSpec(DEFAULT_SPEC_ID);
      if (isV3Project(spec)) {
        setProject(spec);
        setSource('backend');
        setSelection(PROJECT_SELECTION);
      } else {
        const msg = 'Backend returned an invalid MDC document (expected v3 flat root with networks[])';
        console.error('MDC editor: load failed —', msg);
        setError(msg);
      }
    } catch (err) {
      const msg = err?.message ?? 'Failed to load from backend';
      console.error('MDC editor: load failed', err);
      setError(msg);
    } finally {
      setBusy(false);
    }
  };

  const saveToBackend = async () => {
    setBusy(true);
    setError(null);
    try {
      await engineClient.saveSpec(DEFAULT_SPEC_ID, project);
      setSource('backend');
    } catch (err) {
      const msg = err?.message ?? 'Failed to save to backend';
      console.error('MDC editor: save failed', err);
      setError(msg);
    } finally {
      setBusy(false);
    }
  };

  const importFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result));
        if (!isV3Project(parsed)) {
          setError('Import failed: document must be v3 (flat root with networks[])');
          return;
        }
        setProject(parsed);
        setSource('file');
        setSelection(PROJECT_SELECTION);
        setError(null);
        setDbcWarnings(null);
      } catch (err) {
        const msg = err?.message ?? 'Invalid JSON file';
        console.error('MDC editor: import failed', err);
        setError(`Import failed: ${msg}`);
      }
    };
    reader.onerror = () => {
      const msg = 'Could not read the selected file';
      console.error('MDC editor: import failed —', msg);
      setError(msg);
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const exportFile = () => {
    const blob = new Blob([JSON.stringify(project, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${project.id ?? 'project'}.mdc.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const importDbc = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setError(null);
    setDbcWarnings(null);
    try {
      const result = await engineClient.importDbc(file);
      if (!result) {
        setError('DBC import unavailable — backend /api/mdc/import-dbc not reachable');
        return;
      }
      const doc = result.mdc ?? result;
      if (!isV3Project(doc)) {
        setError('DBC import returned an invalid MDC document');
        return;
      }
      setProject(doc);
      setSource('dbc');
      setSelection(PROJECT_SELECTION);
      if (Array.isArray(result.warnings) && result.warnings.length > 0) {
        setDbcWarnings(result.warnings);
      }
    } catch (err) {
      const msg = err?.message ?? 'DBC import failed';
      console.error('MDC editor: DBC import failed', err);
      setError(msg);
    } finally {
      setBusy(false);
      e.target.value = '';
    }
  };

  const exportDbc = async () => {
    setBusy(true);
    setError(null);
    setDbcWarnings(null);
    try {
      const result = await engineClient.exportDbc(project);
      if (!result) {
        setError('DBC export unavailable — backend /api/mdc/export-dbc not reachable');
        return;
      }
      const dbcText = result.dbc ?? result.content ?? '';
      const warnings = result.warnings ?? [];
      const blob = new Blob([dbcText], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${project.id ?? 'project'}.dbc`;
      a.click();
      URL.revokeObjectURL(url);
      if (warnings.length > 0) setDbcWarnings(warnings);
    } catch (err) {
      const msg = err?.message ?? 'DBC export failed';
      console.error('MDC editor: DBC export failed', err);
      setError(msg);
    } finally {
      setBusy(false);
    }
  };

  const onVehicleChange = async (id) => {
    setVehicleId(id);
    try {
      const spec = await engineClient.getSpec(id);
      if (isV3Project(spec)) {
        setProject(spec);
        setSource('backend');
        setSelection(PROJECT_SELECTION);
      }
    } catch {
      // Vehicle may not have a saved backend spec yet — keep current editor state.
    }
  };

  const displayName = project?.name ?? project?.id ?? 'Untitled';

  return (
    <div className="mdc-editor">
      <header className="mdc-header">
        <h1>MDC Editor</h1>
        <span
          className="mdc-project-name"
          style={{ cursor: 'pointer' }}
          onClick={() => setSelection(PROJECT_SELECTION)}
        >
          {displayName} · <span>{source}</span>
        </span>
        <div className="mdc-spacer" />
        <div style={{ minWidth: 200 }}>
          <VehicleSelect value={vehicleId} onChange={onVehicleChange} size="xs" label="Vehicle" />
        </div>
        <div className="mdc-spacer" />
        <div className="mdc-status">
          <span className={`mdc-status-dot ${summary.valid ? 'ok' : 'err'}`} />
          {summary.errors} err · {summary.warnings} warn
        </div>
        {error && <span className="mdc-error-banner">{error}</span>}
        <button className="mdc-btn" onClick={loadFromBackend} disabled={busy}>
          <FolderOpen size={13} style={{ verticalAlign: -2 }} /> Load
        </button>
        <button className="mdc-btn primary" onClick={saveToBackend} disabled={busy}>
          <Save size={13} style={{ verticalAlign: -2 }} /> Save
        </button>
        <label className="mdc-btn" style={{ cursor: 'pointer' }}>
          <Upload size={13} style={{ verticalAlign: -2 }} /> Import JSON
          <input type="file" accept=".json,application/json" style={{ display: 'none' }} onChange={importFile} />
        </label>
        <button className="mdc-btn" onClick={exportFile}>
          <Download size={13} style={{ verticalAlign: -2 }} /> Export JSON
        </button>
        <label className="mdc-btn" style={{ cursor: 'pointer' }} title="Import DBC via backend dbc2mdc">
          <FileInput size={13} style={{ verticalAlign: -2 }} /> Import DBC
          <input
            type="file"
            accept=".dbc,text/plain"
            style={{ display: 'none' }}
            onChange={importDbc}
          />
        </label>
        <button className="mdc-btn" onClick={exportDbc} disabled={busy} title="Export DBC via backend mdc2dbc">
          <FileOutput size={13} style={{ verticalAlign: -2 }} /> Export DBC
        </button>
      </header>

      {dbcWarnings && dbcWarnings.length > 0 && (
        <div className="mdc-card" style={{ margin: '8px 12px', borderColor: 'var(--mdc-warn)' }}>
          <h2 style={{ marginTop: 0 }}>DBC export/import warnings</h2>
          <ul className="mdc-muted" style={{ margin: 0, paddingLeft: 18 }}>
            {dbcWarnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
          <button className="mdc-btn" style={{ marginTop: 8 }} onClick={() => setDbcWarnings(null)}>
            Dismiss
          </button>
        </div>
      )}

      <aside className="mdc-tree">
        <TreeExplorer project={project} selected={selection} onSelect={setSelection} />
      </aside>

      <main className="mdc-detail">
        <ValidationPanel issues={issues} summary={summary} onSelectIssue={setSelection} />
        <DetailPanel
          project={project}
          selection={selection}
          onChangeAt={changeAt}
          networkForSelection={networkForSelection}
        />
      </main>
    </div>
  );
}
