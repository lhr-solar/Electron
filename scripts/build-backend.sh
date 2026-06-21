#!/usr/bin/env bash
# Thin wrapper around backend/build_sidecar.py for CI and local packaging.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
exec python3 "$ROOT/backend/build_sidecar.py" "$@"
