// Routes the current selection to the matching detail editor and supplies a
// scoped `update(path, value)` that writes immutably into the project at the
// selected entity's document path.

import { SELECTION_KINDS, resolveSelection, selectionPath } from '../lib/mdcModel.js';
import ProjectEditor from './ProjectEditor.jsx';
import NetworkEditor from './NetworkEditor.jsx';
import NodeEditor from './NodeEditor.jsx';
import MessageEditor from './MessageEditor.jsx';
import SignalEditor from './SignalEditor.jsx';

const KIND_LABEL = {
  [SELECTION_KINDS.PROJECT]: 'Project',
  [SELECTION_KINDS.NETWORK]: 'Network',
  [SELECTION_KINDS.NODE]: 'Node',
  [SELECTION_KINDS.MESSAGE]: 'Message',
  [SELECTION_KINDS.SIGNAL]: 'Signal',
};

function entitySubtitle(entity, kind) {
  if (kind === SELECTION_KINDS.PROJECT) return entity.description;
  return entity.comment;
}

export default function DetailPanel({ project, selection, onChangeAt, networkForSelection }) {
  if (!selection || selection.kind === SELECTION_KINDS.PROJECT) {
    return <ProjectEditor project={project} update={onChangeAt} />;
  }

  const entity = resolveSelection(project, selection);
  if (!entity) return <div className="mdc-detail-empty">Selection no longer exists.</div>;

  const basePath = selectionPath(selection);
  const update = (relPath, value) => onChangeAt([...basePath, ...relPath], value);
  const subtitle = entitySubtitle(entity, selection.kind);

  return (
    <>
      <div className="mdc-title-row">
        <span className="mdc-kind">{KIND_LABEL[selection.kind]}</span>
        <h1>{entity.name ?? entity.id}</h1>
      </div>
      {subtitle && <p className="mdc-subtitle">{subtitle}</p>}

      {selection.kind === SELECTION_KINDS.NETWORK && (
        <NetworkEditor project={project} network={entity} update={update} />
      )}
      {selection.kind === SELECTION_KINDS.NODE && <NodeEditor project={project} node={entity} update={update} />}
      {selection.kind === SELECTION_KINDS.MESSAGE && (
        <MessageEditor project={project} message={entity} update={update} />
      )}
      {selection.kind === SELECTION_KINDS.SIGNAL && (
        <SignalEditor project={project} network={networkForSelection} signal={entity} update={update} />
      )}
    </>
  );
}
