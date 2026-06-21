#!/usr/bin/env python3
"""Nuitka sidecar build for the Tauri desktop shell.

Output contract (``bundle.externalBin`` in ``app/src-tauri/tauri.conf.json``)::

    app/src-tauri/binaries/backend-<rust-target-triple>[.exe]

Tauri resolves ``sidecar("backend")`` by appending the host triple to the
``binaries/backend`` base name.

Prerequisites
-------------
1. C++ engine with the nanobind binding::

       cmake -B engine/build -S engine -DCMAKE_BUILD_TYPE=Release
       cmake --build engine/build

   Produces ``engine/build/binding/can_engine*.so`` (``.pyd`` on Windows).

2. Lean backend runtime + Nuitka onefile compression (no ``backend[analytics]``)::

       pip install -e backend "nuitka[onefile]" ordered-set

   ``nuitka[onefile]`` pulls ``zstandard`` so ``--onefile`` output is compressed.

Nuitka flags (reference)
------------------------
``--standalone --onefile``
    Single native executable for the sidecar bundle.

``--include-module=can_engine``
    Bundles the nanobind extension. The module must import successfully during
    the build (we stage ``engine/build/binding/can_engine*`` on ``PYTHONPATH``).

``--nofollow-import-to=pandas,numpy,pytest,backend.tests``
    Keeps the desktop bundle lean — analytics extras and test harness are excluded.

Entry shim
----------
``backend_sidecar.py`` at the repo root (outside the ``backend`` package) imports
``backend.main`` with absolute imports so relative imports in ``main.py`` resolve.
Do not point Nuitka at ``backend/main.py`` — it compiles as ``__main__`` and breaks
``from .schemas import ...``.

``--include-package=backend`` / ``--include-package=backend.sinks``
    Pull in the FastAPI app and sink implementations.

``--include-data-files`` / ``--include-data-dir``
    Ship JSON schemas and MDC data the runtime validates/reads
    (``engine/config.schema.json``, ``Embedded-Sharepoint/can/mdc/schema/``,
    ``Embedded-Sharepoint/can/vehicles/lhr-ev1/``).

can_engine inclusion
--------------------
We glob ``engine/build/binding/can_engine.{so,pyd}``, copy into a staging dir on
``PYTHONPATH``, verify ``import can_engine``, then pass ``--include-module=can_engine``
so Nuitka copies the extension into the standalone dist.
"""
from __future__ import annotations

import argparse
import glob
import os
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ENTRY = ROOT / "backend_sidecar.py"
BINDING_DIR = ROOT / "engine" / "build" / "binding"
TAURI_BIN_DIR = ROOT / "app" / "src-tauri" / "binaries"
STAGING = ROOT / "build" / "sidecar-staging"
BUILD_DIR = ROOT / "build" / "sidecar-nuitka"


def _target_triple(explicit: str | None) -> str:
    if explicit:
        return explicit
    for key in ("TAURI_ENV_TARGET_TRIPLE", "CARGO_CFG_TARGET_TRIPLE"):
        if os.environ.get(key):
            return os.environ[key]
    try:
        out = subprocess.check_output(["rustc", "-vV"], text=True, stderr=subprocess.DEVNULL)
        for line in out.splitlines():
            if line.startswith("host:"):
                return line.split()[1]
    except (FileNotFoundError, subprocess.CalledProcessError):
        pass
    raise SystemExit(
        "Rust target triple unknown. Pass --target-triple or install rustc "
        "(``rustc -vV`` prints ``host: <triple>``)."
    )


def _find_can_engine() -> Path:
    patterns = [
        str(BINDING_DIR / "can_engine*.so"),
        str(BINDING_DIR / "can_engine*.pyd"),
    ]
    for pattern in patterns:
        for path in sorted(glob.glob(pattern)):
            return Path(path)
    raise SystemExit(
        f"can_engine not built — run cmake in engine/ first. Looked in {BINDING_DIR}"
    )


def _stage_can_engine(module_path: Path) -> Path:
    STAGING.mkdir(parents=True, exist_ok=True)
    dest = STAGING / module_path.name
    shutil.copy2(module_path, dest)
    return STAGING


def _verify_import(staging: Path) -> None:
    env = os.environ.copy()
    env["PYTHONPATH"] = os.pathsep.join([str(staging), env.get("PYTHONPATH", "")])
    subprocess.run(
        [sys.executable, "-c", "import can_engine; print(can_engine)"],
        env=env,
        check=True,
    )


def _data_args() -> list[str]:
    args: list[str] = []
    mdc = ROOT / "Embedded-Sharepoint" / "can" / "mdc"
    pairs = [
        (ROOT / "engine" / "config.schema.json", "engine/config.schema.json"),
        (
            mdc / "schema" / "mdc.schema.bundle.json",
            "Embedded-Sharepoint/can/mdc/schema/mdc.schema.bundle.json",
        ),
    ]
    for src, dest in pairs:
        if src.is_file():
            args.append(f"--include-data-files={src}={dest}")
    lhr_ev1 = ROOT / "Embedded-Sharepoint" / "can" / "vehicles" / "lhr-ev1"
    if lhr_ev1.is_dir():
        args.append(f"--include-data-dir={lhr_ev1}=Embedded-Sharepoint/can/vehicles/lhr-ev1")
    return args


def _nuitka_cmd(triple: str, staging: Path) -> list[str]:
    out_name = f"backend-{triple}"
    cmd = [
        sys.executable,
        "-m",
        "nuitka",
        "--standalone",
        "--onefile",
        "--assume-yes-for-downloads",
        f"--output-filename={out_name}",
        f"--output-dir={BUILD_DIR}",
        "--include-module=can_engine",
        "--include-package=backend",
        "--include-package=backend.sinks",
        "--nofollow-import-to=pandas",
        "--nofollow-import-to=numpy",
        "--nofollow-import-to=pytest",
        "--nofollow-import-to=backend.tests",
        *_data_args(),
        str(ENTRY),
    ]
    return cmd


def _sidecar_filename(triple: str) -> str:
    name = f"backend-{triple}"
    if os.name == "nt":
        name += ".exe"
    return name


def build(*, target_triple: str | None, skip_verify: bool) -> Path:
    try:
        import nuitka  # noqa: F401
    except ImportError as exc:
        raise SystemExit(
            'Nuitka is required: pip install "nuitka[onefile]" ordered-set'
        ) from exc

    triple = _target_triple(target_triple)
    module_path = _find_can_engine()
    staging = _stage_can_engine(module_path)
    if not skip_verify:
        _verify_import(staging)

    env = os.environ.copy()
    env["PYTHONPATH"] = os.pathsep.join([str(staging), env.get("PYTHONPATH", "")])
    BUILD_DIR.mkdir(parents=True, exist_ok=True)
    subprocess.run(_nuitka_cmd(triple, staging), env=env, cwd=ROOT, check=True)

    built = BUILD_DIR / _sidecar_filename(triple)
    if not built.is_file():
        # Nuitka on some platforms omits .exe in output-filename handling.
        candidates = list(BUILD_DIR.glob(f"backend-{triple}*"))
        if not candidates:
            raise SystemExit(f"Nuitka finished but no binary found in {BUILD_DIR}")
        built = candidates[0]

    TAURI_BIN_DIR.mkdir(parents=True, exist_ok=True)
    dest = TAURI_BIN_DIR / _sidecar_filename(triple)
    shutil.copy2(built, dest)
    return dest


def main() -> None:
    parser = argparse.ArgumentParser(description="Nuitka-compile the backend Tauri sidecar.")
    parser.add_argument(
        "--target-triple",
        help="Rust host triple (default: TAURI_ENV_TARGET_TRIPLE or rustc -vV host:)",
    )
    parser.add_argument(
        "--skip-verify",
        action="store_true",
        help="Skip the pre-build ``import can_engine`` smoke check.",
    )
    args = parser.parse_args()
    dest = build(target_triple=args.target_triple, skip_verify=args.skip_verify)
    print(f"Sidecar ready for Tauri externalBin: {dest}")


if __name__ == "__main__":
    main()
