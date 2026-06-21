#!/usr/bin/env bash
# Build the engine + Python backend + Tauri frontend into ONE desktop app.
#
# Stage 1  C++ engine  -> engine/build/binding/can_engine*.so   (the decode hot path)
# Stage 2  Nuitka      -> app/src-tauri/binaries/backend-<triple>  (Python API sidecar,
#                         a single native binary with the can_engine module bundled in)
# Stage 3  Tauri       -> app/src-tauri/target/release/bundle/...  (installer that ships
#                         the React UI + the sidecar; the app spawns the sidecar at runtime)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

PY="${PYTHON:-$ROOT/backend/.venv/bin/python}"

echo "==> [1/3] Engine (C++ can_engine module)"
cmake -S engine -B engine/build -DCMAKE_BUILD_TYPE=Release
cmake --build engine/build --config Release

echo "==> [2/3] Backend sidecar (Nuitka onefile; bundles can_engine)"
"$PY" backend/build_sidecar.py

echo "==> [3/3] Tauri bundle (frontend + sidecar -> native installer)"
npm --prefix app ci
npm --prefix app run tauri build

echo
echo "Done. Installers: app/src-tauri/target/release/bundle/"
