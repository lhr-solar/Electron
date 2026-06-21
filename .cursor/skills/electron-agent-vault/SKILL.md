---
name: electron-agent-vault
description: >-
  Project-specific Obsidian vault at electron-agent-vault/. Use when working in this
  repo and the user wants notes, memory, graph links, or vault operations tied to
  the Electron-grafana project.
---

# Electron Agent Vault

Vault location: `electron-agent-vault/` (relative to repo root).

## What's installed

| Package | Source | Role |
|---------|--------|------|
| ponytail | [DietrichGebert/ponytail](https://github.com/DietrichGebert/ponytail) | Simplicity/YAGNI coding rules + review skill |
| karpathy-guidelines | [multica-ai/andrej-karpathy-skills](https://github.com/multica-ai/andrej-karpathy-skills) | Surgical changes, clarity, goal-driven execution |
| obsidian-mind v6.2.1 | [breferrari/obsidian-mind](https://github.com/breferrari/obsidian-mind) | Vault structure, hooks, QMD, `/om-*` commands |
| obsidian-second-brain | [eugeniughelbur/obsidian-second-brain](https://github.com/eugeniughelbur/obsidian-second-brain) | Self-rewriting notes, research, `/obsidian-*` commands |
| graphify | [@sentropic/graphify](https://github.com/rhanka/graphify) | Codebase knowledge graph → `.graphify/` |

## First-time vault setup

1. Open `electron-agent-vault/` in Obsidian
2. Enable **Obsidian CLI** in Settings → General (Obsidian 1.12+)
3. Fill in `brain/North Star.md` with your goals
4. Run `/obsidian-init` (second-brain) to generate `_CLAUDE.md` if using second-brain workflows
5. Build QMD index:
   ```bash
   cd electron-agent-vault
   node --experimental-strip-types scripts/qmd-bootstrap.ts
   qmd --index obsidian-mind update && qmd --index obsidian-mind embed
   ```

## Graphify + vault integration

Build a knowledge graph of this repo and export to the vault:

```bash
export PATH="$HOME/.npm-global/bin:$PATH"
cd /Users/parthiv/Documents/LHR/Electron-grafana
graphify detect . --scope auto
# Full build via graphify skill, then:
graphify export obsidian --graph .graphify/graph.json \
  --out electron-agent-vault/reference/graphify
```

## Related skills

- `ponytail` / `ponytail-review` — simplicity and over-engineering review
- `karpathy-guidelines` — behavioral coding guidelines
- `obsidian-mind` — vault conventions and `/om-*` commands
- `obsidian-vault-graph` — wikilinks, graph view, canvas
- `obsidian-second-brain` — research and self-rewriting workflows
- `graphify` — build and query `.graphify/` knowledge graphs
