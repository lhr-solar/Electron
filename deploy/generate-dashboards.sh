#!/usr/bin/env bash
# Generate Grafana dashboards from the MDC spec(s) via deploy/mdc2grafana.mjs —
# the dashboards are WIRED from the spec, never hand-maintained. Output lands in
# deploy/grafana-dashboards/, which docker-compose mounts into Grafana.
#
# Run once before `docker compose up` (and again whenever the MDC spec changes):
#   deploy/generate-dashboards.sh
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo="$(cd "$here/.." && pwd)"
mdc_vehicles="$repo/Embedded-Sharepoint/can/vehicles"
mdc_pkg="$repo/Embedded-Sharepoint/can/mdc"
out="$here/grafana-dashboards"
mkdir -p "$out"

if [ -f "$mdc_pkg/package.json" ] && [ ! -d "$mdc_pkg/node_modules" ]; then
  echo ">>> installing mdc tool deps in $mdc_pkg"
  (cd "$mdc_pkg" && (npm ci --no-audit --no-fund 2>/dev/null || npm install --no-audit --no-fund))
fi

shopt -s nullglob
generated=0
for proj in "$mdc_vehicles"/*/project.mdc.json; do
  name="$(basename "$(dirname "$proj")")"
  node "$here/mdc2grafana.mjs" "$proj" -o "$out/${name}.json"
  generated=$((generated + 1))
done

echo ">>> generated $generated dashboard(s) into $out"
