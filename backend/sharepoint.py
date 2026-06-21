"""Git subprocess wrapper for Embedded-Sharepoint sparse checkout (contract §6)."""
from __future__ import annotations

import asyncio
import logging
import shutil
import subprocess
import threading
from collections.abc import Callable
from pathlib import Path
from typing import TypeVar

T = TypeVar("T")

from .paths import can_home, can_root
from .settings import get_settings

logger = logging.getLogger(__name__)

_lock = threading.Lock()


async def _git_op(work: Callable[[], T]) -> T:
    def locked() -> T:
        with _lock:
            return work()

    return await asyncio.to_thread(locked)


def proc_detail(proc: subprocess.CompletedProcess) -> str:
    return (proc.stderr or proc.stdout or f"exit {proc.returncode}").strip()


class SharepointError(Exception):
    def __init__(self, title: str, detail: str, *, status_code: int = 400):
        self.title = title
        self.detail = detail
        self.status_code = status_code
        super().__init__(detail)


def git_installed() -> bool:
    try:
        subprocess.run(
            ["git", "--version"],
            capture_output=True,
            check=True,
        )
        return True
    except (FileNotFoundError, subprocess.CalledProcessError):
        return False


def _sharepoint_cwd() -> Path:
    return can_home() / "sharepoint"


def _cloned() -> bool:
    return (_sharepoint_cwd() / ".git").exists()


def _run_git(args: list[str], *, cwd: Path | None = None) -> subprocess.CompletedProcess:
    cwd_path = cwd or _sharepoint_cwd()
    if not cwd_path.is_dir():
        raise SharepointError("Not cloned", f"working directory missing: {cwd_path}")
    return subprocess.run(
        ["git", *args],
        cwd=str(cwd_path),
        capture_output=True,
        text=True,
    )


def _require_cloned(title: str = "Not cloned") -> None:
    if not _cloned():
        raise SharepointError(title, "Embedded-Sharepoint checkout is not initialized.")


def _require_ok(proc: subprocess.CompletedProcess, title: str = "Git failed") -> str:
    if proc.returncode != 0:
        raise SharepointError(title, proc_detail(proc))
    return (proc.stdout or "").strip()


def _can_root_valid() -> bool:
    root = can_root()
    return root.is_dir() and (root / "vehicles").is_dir()


def _status_unlocked() -> dict:
    settings = get_settings()
    installed = git_installed()
    cloned = _cloned()
    branch: str | None = None
    dirty = False
    commit: str | None = None
    if installed and cloned:
        branch = _require_ok(_run_git(["rev-parse", "--abbrev-ref", "HEAD"]), "Git status failed")
        dirty = _is_dirty()
        commit = _require_ok(_run_git(["rev-parse", "--short", "HEAD"]), "Git status failed")
    return {
        "gitInstalled": installed,
        "cloned": cloned,
        "branch": branch,
        "dirty": dirty,
        "canRootExists": _can_root_valid(),
        "remoteUrl": settings["sharepoint"]["remoteUrl"],
        "commit": commit,
    }


async def status() -> dict:
    return await _git_op(_status_unlocked)


def _clone_sequence(remote_url: str, branch: str) -> None:
    home = can_home()
    home.mkdir(parents=True, exist_ok=True)
    dest = home / "sharepoint"
    if dest.exists():
        raise SharepointError("Clone failed", f"destination already exists: {dest}")
    _require_ok(
        _run_git(
            ["clone", "--filter=blob:none", "--no-checkout", remote_url, str(dest)],
            cwd=home,
        ),
        "Clone failed",
    )
    _require_ok(_run_git(["sparse-checkout", "init", "--cone"]), "Clone failed")
    _require_ok(_run_git(["sparse-checkout", "set", "can"]), "Clone failed")
    _require_ok(_run_git(["checkout", branch]), "Clone failed")


async def clone(remote_url: str | None = None, branch: str | None = None, *, repair: bool = False) -> dict:
    settings = get_settings()
    remote_url = remote_url or settings["sharepoint"]["remoteUrl"]
    branch = branch or settings["sharepoint"]["branch"]

    def work() -> dict:
        if repair and _sharepoint_cwd().exists():
            shutil.rmtree(_sharepoint_cwd())
        if not _cloned():
            _clone_sequence(remote_url, branch)
        return _status_unlocked()

    return await _git_op(work)


async def fetch() -> dict:
    def work() -> dict:
        _require_cloned("Fetch failed")
        _require_ok(_run_git(["fetch", "--all", "--prune"]), "Fetch failed")
        return _status_unlocked()

    return await _git_op(work)


async def pull() -> dict:
    def work() -> dict:
        _require_cloned("Pull failed")
        _require_ok(_run_git(["pull", "--ff-only"]), "Pull failed")
        return _status_unlocked()

    return await _git_op(work)


async def push(branch: str | None = None) -> dict:
    settings = get_settings()
    branch = branch or settings["sharepoint"]["branch"]

    def work() -> dict:
        _require_cloned("Push failed")
        proc = _run_git(["push", "-u", "origin", branch])
        stderr = (proc.stderr or "").strip()
        if proc.returncode != 0:
            raise SharepointError("Push failed", proc_detail(proc))
        return {"pushed": True, "branch": branch, "stderr": stderr}

    return await _git_op(work)


def _is_dirty_unlocked() -> bool:
    proc = _run_git(["status", "--porcelain", "--", "can"])
    return bool((proc.stdout or "").strip())


def _is_dirty() -> bool:
    return _is_dirty_unlocked()


async def checkout(branch: str, dirty: str | None = None) -> dict:
    def work() -> dict:
        _require_cloned("Checkout failed")
        if _is_dirty_unlocked():
            if dirty is None:
                raise SharepointError(
                    "Working tree dirty",
                    "Pass dirty=stash or dirty=discard.",
                    status_code=409,
                )
            if dirty == "stash":
                _require_ok(_run_git(["stash", "push", "-m", f"auto-stash before checkout {branch}"]), "Checkout failed")
            elif dirty == "discard":
                _discard_unlocked()
            else:
                raise SharepointError("Invalid request", f'unknown dirty option: {dirty!r}')
        _require_ok(_run_git(["checkout", branch]), "Checkout failed")
        return _status_unlocked()

    return await _git_op(work)


def _discard_unlocked() -> None:
    _require_ok(_run_git(["checkout", "--", "can"]), "Discard failed")
    _require_ok(_run_git(["clean", "-fd", "can"]), "Discard failed")


async def discard() -> dict:
    def work() -> dict:
        _require_cloned("Discard failed")
        _discard_unlocked()
        return _status_unlocked()

    return await _git_op(work)


async def create_branch(name: str, *, checkout: bool = True) -> dict:
    def work() -> dict:
        _require_cloned("Create branch failed")
        if checkout:
            _require_ok(_run_git(["checkout", "-b", name]), "Create branch failed")
        else:
            _require_ok(_run_git(["branch", name]), "Create branch failed")
        return _status_unlocked()

    return await _git_op(work)


async def branches() -> dict:
    def work() -> dict:
        _require_cloned("Branches failed")
        _require_ok(_run_git(["fetch", "--all", "--prune"]), "Branches failed")
        current = _require_ok(_run_git(["rev-parse", "--abbrev-ref", "HEAD"]), "Branches failed")
        out = _require_ok(
            _run_git(["branch", "-a", "--format=%(refname:short)"]),
            "Branches failed",
        )
        local: list[str] = []
        remote: list[str] = []
        for line in out.splitlines():
            name = line.strip()
            if not name:
                continue
            if name.startswith("origin/"):
                remote.append(name)
            else:
                local.append(name)
        return {"current": current, "local": local, "remote": remote}

    return await _git_op(work)


async def stash(op: str, message: str | None = None) -> dict:
    def work() -> dict:
        if op in ("save", "pop", "list"):
            _require_cloned("Stash failed")
        if op == "save":
            args = ["stash", "push"]
            if message:
                args.extend(["-m", message])
            _require_ok(_run_git(args), "Stash failed")
            return _status_unlocked()
        if op == "pop":
            _require_ok(_run_git(["stash", "pop"]), "Stash failed")
            return _status_unlocked()
        if op == "list":
            proc = _run_git(["stash", "list"])
            _require_ok(proc, "Stash failed")
            stashes = []
            for line in (proc.stdout or "").splitlines():
                line = line.strip()
                if not line:
                    continue
                ref, _, rest = line.partition(":")
                stashes.append({"ref": ref.strip(), "message": rest.strip()})
            return {"stashes": stashes}
        raise SharepointError("Invalid request", f'unknown stash op: {op!r}')

    return await _git_op(work)
