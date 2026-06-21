// Collapsible tree: root → network → node → message → signal. Selection is a path
// object ({ kind, network, node, message, signal }) lifted to the workspace.

import { useState } from 'react';
import { Network, Cpu, Mail, Activity } from 'lucide-react';
import { SELECTION_KINDS } from '../lib/mdcModel.js';
import { networkIsFd } from '../lib/v3compat.js';

const sameSel = (a, b) =>
  a &&
  b &&
  a.kind === b.kind &&
  a.network === b.network &&
  a.node === b.node &&
  a.message === b.message &&
  a.signal === b.signal;

function Twisty({ open, hasChildren }) {
  if (!hasChildren) return <span className="mdc-tree-twisty" />;
  return <span className="mdc-tree-twisty">{open ? '▼' : '▶'}</span>;
}

function TreeRow({ depth, icon, label, meta, sel, selected, onSelect, open, onToggle, hasChildren }) {
  return (
    <div
      className={`mdc-tree-node mdc-tree-d${depth}`}
      data-selected={sameSel(sel, selected) || undefined}
      onClick={() => onSelect(sel)}
    >
      <span
        onClick={(e) => {
          e.stopPropagation();
          if (hasChildren) onToggle();
        }}
      >
        <Twisty open={open} hasChildren={hasChildren} />
      </span>
      {icon}
      <span className="mdc-tree-label">{label}</span>
      {meta != null && <span className="mdc-tree-meta">{meta}</span>}
    </div>
  );
}

export default function TreeExplorer({ project, selected, onSelect }) {
  const [openKeys, setOpenKeys] = useState(() => {
    const keys = new Set();
    if ((project?.networks ?? []).length > 0) {
      keys.add('n0');
    }
    return keys;
  });
  const toggle = (key) =>
    setOpenKeys((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });

  return (
    <div>
      {(project?.networks ?? []).map((network, ni) => {
        const nKey = `n${ni}`;
        const nOpen = openKeys.has(nKey);
        const nodes = network.nodes ?? [];
        const messages = network.messages ?? [];
        const hasChildren = nodes.length > 0 || messages.length > 0;
        const busMeta = networkIsFd(network) ? 'CAN FD' : 'CAN';
        return (
          <div key={network.id ?? ni}>
            <TreeRow
              depth={0}
              icon={<Network size={13} className="mdc-tree-icon-net" />}
              label={network.name ?? network.id}
              meta={busMeta}
              sel={{ kind: SELECTION_KINDS.NETWORK, network: ni }}
              selected={selected}
              onSelect={onSelect}
              open={nOpen}
              onToggle={() => toggle(nKey)}
              hasChildren={hasChildren}
            />
            {nOpen && (
              <>
                {nodes.map((node, nodei) => (
                  <TreeRow
                    key={node.name ?? nodei}
                    depth={1}
                    icon={<Cpu size={12} className="mdc-tree-icon-msg" />}
                    label={node.name}
                    sel={{ kind: SELECTION_KINDS.NODE, network: ni, node: nodei }}
                    selected={selected}
                    onSelect={onSelect}
                    open={false}
                    onToggle={() => {}}
                    hasChildren={false}
                  />
                ))}
                {messages.map((m, mi) => {
                  const mKey = `${nKey}m${mi}`;
                  const mOpen = openKeys.has(mKey);
                  return (
                    <div key={m.name ?? mi}>
                      <TreeRow
                        depth={1}
                        icon={<Mail size={12} className="mdc-tree-icon-msg" />}
                        label={m.name}
                        meta={`0x${(m.frame_id ?? 0).toString(16).toUpperCase()}`}
                        sel={{ kind: SELECTION_KINDS.MESSAGE, network: ni, message: mi }}
                        selected={selected}
                        onSelect={onSelect}
                        open={mOpen}
                        onToggle={() => toggle(mKey)}
                        hasChildren={(m.signals ?? []).length > 0}
                      />
                      {mOpen &&
                        (m.signals ?? []).map((s, si) => (
                          <TreeRow
                            key={s.name ?? si}
                            depth={2}
                            icon={<Activity size={11} className="mdc-tree-icon-sig" />}
                            label={s.name}
                            meta={`${s.length}b`}
                            sel={{ kind: SELECTION_KINDS.SIGNAL, network: ni, message: mi, signal: si }}
                            selected={selected}
                            onSelect={onSelect}
                            open={false}
                            onToggle={() => {}}
                            hasChildren={false}
                          />
                        ))}
                    </div>
                  );
                })}
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}
