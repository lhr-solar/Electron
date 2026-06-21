// Detail editor for a network node (BU_): identity + scoped attributes.

import { TextField } from './fields.jsx';
import AttributeEditor from './AttributeEditor.jsx';

export default function NodeEditor({ project, node, update }) {
  return (
    <>
      <div className="mdc-card">
        <h2>Node</h2>
        <div className="mdc-fields">
          <TextField label="Name" value={node.name} onChange={(v) => update(['name'], v)} />
          <TextField label="Comment" value={node.comment} onChange={(v) => update(['comment'], v)} />
        </div>
      </div>

      <AttributeEditor
        project={project}
        scope="node"
        attributes={node.attributes}
        update={(name, value) => update(['attributes', name], value)}
      />
    </>
  );
}
