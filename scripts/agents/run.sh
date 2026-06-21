#!/usr/bin/env bash
# Parallel multi-agent build runner (optional CLI path).
# Default build mechanism for this repo is in-session Task subagents; this script
# is the headless equivalent for running the same roster via cursor-agent.
#
# Model tiers (also set in .cursor/agents/*.md):
#   THINK = claude-opus-4-8-thinking-high  (architect, reviewers)
#   BUILD = composer-2.5                     (all implementation agents: builders, engine/app sub-tracks, refactorer, integrator, test-writer)
#
# Waves: 0) architect -> 1) builders/sub-tracks (parallel worktrees) -> 2) reviewers + test-writer (parallel, skip empty diffs)
#        -> 3) refactorer -> 4) integrator
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

THINK="claude-opus-4-8-thinking-high"
BUILD="composer-2.5"
REVIEWS="$(pwd)/reviews.jsonl"
: > "$REVIEWS"

build() {
  # $1 = agent name, $2 = task prompt
  cursor-agent -p --force --worktree --sandbox enabled --trust \
    --model "$BUILD" --output-format json "/$1 $2" | jq -r '.result'
}

review() {
  # $1 = worktree path, $2 = reviewer prefix (readability|deadcode|perf|dry)
  cursor-agent -p --workspace "$1" --model "$THINK" --output-format json \
    "/${2}-reviewer review the diff in this worktree" | jq -r '.result' >> "$REVIEWS"
}

echo "== Wave 0: architect (sequential) =="
cursor-agent -p --plan --model "$THINK" --output-format text \
  "/architect write task briefs for the current plan step"

echo "== Wave 1: builders (parallel, isolated worktrees) =="
build engine-builder "Implement the engine per contracts and engine.mdc" &
build app-builder    "Scaffold Tauri 2 + React on Vite 8/Rolldown + Tesla theme per app.mdc" &
build server-builder "Author deploy/ docker stack + TCP host listeners per deploy.mdc" &
build mdc-builder    "Write mdc.schema.json + dbc2mdc + validator per mdc.mdc" &
wait

echo "== Wave 2: readonly reviewers per worktree (skip empty diffs) =="
for WT in $(git worktree list --porcelain | awk '/^worktree /{print $2}'); do
  if git -C "$WT" diff --quiet HEAD 2>/dev/null; then
    echo "  skip $WT (no diff)"
    continue
  fi
  for r in readability deadcode perf dry; do
    review "$WT" "$r" &
  done
done
wait

echo "== Wave 3: refactor + integrate (sequential) =="
cursor-agent -p --force --model "$BUILD" \
  "/refactorer apply the consolidated findings in $REVIEWS"
cursor-agent -p --force --model "$BUILD" \
  "/integrator merge all worktrees, build, format, lint, and test"

echo "Done. Findings: $REVIEWS"
