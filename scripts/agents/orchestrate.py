#!/usr/bin/env python3
"""SDK-based parallel multi-agent build runner (optional path).

The default build mechanism for this repo is in-session Task subagents; the
headless equivalents are this script and its bash sibling ``run.sh``. This
runner mirrors ``run.sh``'s wave structure but uses the Cursor Python SDK
(``cursor-sdk``) to add what bash can't do cleanly:

  * bounded concurrency (asyncio.Semaphore) instead of unbounded ``&`` fan-out,
  * per-agent retries with exponential backoff on *retryable startup* failures,
  * structured error handling that fails the whole wave loudly,
  * reviewer outputs collected into a findings file the refactorer consumes.

Waves (sequential between, parallel within), matching run.sh:
  0. architect   (think tier, readonly)      -- sequential, single
  1. builders    (build tier)                -- parallel
  2. reviewers   (think tier, readonly)      -- parallel, per *changed* track
  3. refactorer  -> integrator (build tier)  -- sequential

Install the dev dependency (NOT a backend runtime dep):
    pip install cursor-sdk
Auth: export CURSOR_API_KEY="cursor_..."  (or pass --api-key)

ponytail: the SDK import is deferred so ``--help`` and ``--dry-run`` work even
when cursor-sdk is not installed.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import subprocess
import sys
from dataclasses import dataclass, field

# Model tiers (also set in .cursor/agents/*.md frontmatter; CLI --model wins).
THINK = "claude-opus-4-8-thinking-high"  # architect + reviewers
BUILD = "composer-2.5"  # builders, refactorer, integrator

REVIEWERS = ("readability", "deadcode", "perf", "dry")


@dataclass(frozen=True)
class Builder:
    name: str  # slash-agent name in .cursor/agents/
    prompt: str
    dirs: tuple[str, ...]  # repo-relative dirs that signal this track changed


# Mirrors run.sh Wave 1. dirs are used to skip reviewers for untouched tracks.
BUILDERS = (
    Builder("engine-builder", "Implement the engine per contracts and engine.mdc", ("engine",)),
    Builder("app-builder", "Scaffold Tauri 2 + React on Vite 8/Rolldown + Tesla theme per app.mdc", ("app",)),
    Builder("server-builder", "Author backend/ + deploy/ stack and TCP host listeners per deploy.mdc", ("backend", "deploy")),
    Builder("mdc-builder", "Write mdc.schema.json + dbc2mdc + validator per mdc.mdc", ("mdc", "tools")),
)


@dataclass(frozen=True)
class AgentSpec:
    """One agent invocation: a slash-agent name + a model tier + the prompt."""

    name: str
    model: str
    prompt: str
    label: str = ""  # for findings grouping (e.g. "engine"); defaults to name


@dataclass
class WaveError(RuntimeError):
    """A wave failed and must stop the pipeline loudly."""

    message: str
    details: list[str] = field(default_factory=list)

    def __str__(self) -> str:  # noqa: D105
        return self.message + ("\n  - " + "\n  - ".join(self.details) if self.details else "")


def repo_root() -> str:
    out = subprocess.run(
        ["git", "rev-parse", "--show-toplevel"], capture_output=True, text=True, check=True
    )
    return out.stdout.strip()


def track_changed(cwd: str, dirs: tuple[str, ...]) -> bool:
    """True if any of ``dirs`` has uncommitted changes (incl. untracked files).

    ponytail: uses ``git status --porcelain`` so untracked files count too; a
    git worktree-per-builder layout (as in run.sh) would instead diff each
    worktree, but the SDK runs against a single cwd here.
    """
    out = subprocess.run(
        ["git", "status", "--porcelain", "--", *dirs], cwd=cwd, capture_output=True, text=True
    )
    return bool(out.stdout.strip())


async def _run_one(client, sem, spec: AgentSpec, args) -> str:
    """Run a single agent with bounded concurrency + retry on startup failures.

    Distinguishes the SDK's two failure modes (see the sdk skill):
      * thrown CursorAgentError  -> run never started; retry if is_retryable.
      * result.status == "error" -> run executed but failed; fail loudly, no retry.
    """
    from cursor_sdk import CursorAgentError, LocalAgentOptions  # deferred import

    async with sem:
        for attempt in range(args.retries + 1):
            try:
                async with await client.agents.create(
                    model=spec.model,
                    api_key=args.api_key,
                    # setting_sources="all" so the agent loads AGENTS.md, .cursor/rules,
                    # and .cursor/agents (the slash-agent definitions). Default is inline-only.
                    local=LocalAgentOptions(cwd=args.cwd, setting_sources="all"),
                ) as agent:
                    run = await agent.send(f"/{spec.name} {spec.prompt}")
                    print(f"[{spec.name}] agent={agent.agent_id} run={run.id}", file=sys.stderr)
                    result = await run.wait()
                    if result.status != "finished":
                        raise WaveError(f"{spec.name} run did not finish (status={result.status}, run={run.id})")
                    return result.result or ""
            except CursorAgentError as err:
                retry_after = getattr(err, "retry_after", None)
                if err.is_retryable and attempt < args.retries:
                    delay = float(retry_after) if isinstance(retry_after, (int, float)) else args.backoff * (2**attempt)
                    print(f"[{spec.name}] startup failed (retryable), retry in {delay:.1f}s: {err.message}", file=sys.stderr)
                    await asyncio.sleep(delay)
                    continue
                raise WaveError(f"{spec.name} startup failed: {err.message}") from err
        raise WaveError(f"{spec.name} exhausted {args.retries} retries")


async def _run_wave(client, sem, specs: list[AgentSpec], args) -> list[tuple[AgentSpec, str]]:
    """Run a wave in parallel; first failure cancels siblings and stops the pipeline."""
    tasks = [asyncio.create_task(_run_one(client, sem, s, args)) for s in specs]
    try:
        outputs = await asyncio.gather(*tasks)
    except WaveError:
        for t in tasks:
            t.cancel()
        raise
    return list(zip(specs, outputs))


def plan_waves(cwd: str, only_changed: bool) -> tuple[list[list[AgentSpec]], list[Builder]]:
    """Build the wave plan. Returns (waves, reviewed_builders)."""
    architect = [AgentSpec("architect", THINK, "write task briefs for the current plan step")]
    builders = [AgentSpec(b.name, BUILD, b.prompt, b.name.split("-")[0]) for b in BUILDERS]

    changed = [b for b in BUILDERS if not only_changed or track_changed(cwd, b.dirs)]
    reviewers: list[AgentSpec] = []
    for b in changed:
        track = b.name.split("-")[0]
        for r in REVIEWERS:
            reviewers.append(
                AgentSpec(f"{r}-reviewer", THINK, f"review the diff for the {track} track", track)
            )

    refactor = [
        AgentSpec("refactorer", BUILD, "apply the consolidated findings in the findings file"),
        AgentSpec("integrator", BUILD, "merge worktrees, build, format, lint, and test"),
    ]
    return [architect, builders, reviewers, refactor], changed


def write_findings(path: str, results: list[tuple[AgentSpec, str]]) -> None:
    with open(path, "w") as f:
        for spec, output in results:
            f.write(json.dumps({"track": spec.label or spec.name, "reviewer": spec.name, "output": output}) + "\n")


async def orchestrate(args) -> int:
    from cursor_sdk import AsyncClient  # deferred import

    waves, reviewed = plan_waves(args.cwd, only_changed=not args.all_tracks)
    architect, builders, reviewers, refactor = waves
    sem = asyncio.Semaphore(args.concurrency)

    async with await AsyncClient.launch_bridge(workspace=args.cwd) as client:
        print("== Wave 0: architect (sequential) ==", file=sys.stderr)
        await _run_wave(client, sem, architect, args)

        print(f"== Wave 1: builders (parallel, x{len(builders)}) ==", file=sys.stderr)
        await _run_wave(client, sem, builders, args)

        if not reviewers:
            print("== Wave 2: reviewers SKIPPED (no changed tracks) ==", file=sys.stderr)
        else:
            tracks = ", ".join(b.name.split("-")[0] for b in reviewed)
            print(f"== Wave 2: reviewers (parallel, x{len(reviewers)}; tracks: {tracks}) ==", file=sys.stderr)
            review_results = await _run_wave(client, sem, reviewers, args)
            write_findings(args.findings, review_results)
            print(f"   findings -> {args.findings}", file=sys.stderr)

        # refactorer + integrator are a true dependency chain -> sequential.
        print("== Wave 3: refactorer -> integrator (sequential) ==", file=sys.stderr)
        for spec in refactor:
            await _run_wave(client, sem, [spec], args)

    print("Done.", file=sys.stderr)
    return 0


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    p = argparse.ArgumentParser(
        description="SDK-based parallel multi-agent build runner (waves: architect -> builders -> reviewers -> refactor/integrate).",
        epilog="Requires `pip install cursor-sdk` and CURSOR_API_KEY (or --api-key). Use --dry-run to preview without the SDK.",
        formatter_class=argparse.ArgumentDefaultsHelpFormatter,
    )
    p.add_argument("--api-key", default=os.environ.get("CURSOR_API_KEY"), help="Cursor API key (defaults to $CURSOR_API_KEY)")
    p.add_argument("--cwd", default=None, help="workspace dir the agents run against (default: git repo root)")
    p.add_argument("--concurrency", type=int, default=4, help="max agents running at once")
    p.add_argument("--retries", type=int, default=2, help="retries per agent on retryable startup failures")
    p.add_argument("--backoff", type=float, default=2.0, help="base seconds for exponential backoff")
    p.add_argument("--findings", default=None, help="reviewer findings file (default: <repo>/reviews.jsonl)")
    p.add_argument("--all-tracks", action="store_true", help="review every track, not just changed ones")
    p.add_argument("--dry-run", action="store_true", help="print the wave plan and exit (no SDK, no agents)")
    return p.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    root = repo_root()
    args.cwd = args.cwd or root
    args.findings = args.findings or os.path.join(root, "reviews.jsonl")

    if args.dry_run:
        waves, _ = plan_waves(args.cwd, only_changed=not args.all_tracks)
        names = ["architect", "builders", "reviewers", "refactor/integrate"]
        for label, specs in zip(names, waves):
            members = ", ".join(f"/{s.name}({s.model.split('-')[0]})" for s in specs) or "(none)"
            print(f"wave {label}: {members}")
        return 0

    if not args.api_key:
        print("error: no API key (set CURSOR_API_KEY or pass --api-key)", file=sys.stderr)
        return 1
    try:
        return asyncio.run(orchestrate(args))
    except WaveError as err:
        print(f"WAVE FAILED: {err}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
