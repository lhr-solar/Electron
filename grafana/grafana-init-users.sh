#!/bin/sh
# Create default Grafana user on first startup (idempotent).
set -eu

GRAFANA_URL="${GRAFANA_URL:-http://127.0.0.1:3000/grafana}"
ADMIN_USER="${GF_SECURITY_ADMIN_USER:-admin}"
ADMIN_PASSWORD="${GF_SECURITY_ADMIN_PASSWORD:-lhrs2025!}"
DEFAULT_LOGIN="${GF_DEFAULT_USER_LOGIN:-solar}"
DEFAULT_PASSWORD="${GF_DEFAULT_USER_PASSWORD:-lhrs}"
DEFAULT_NAME="${GF_DEFAULT_USER_NAME:-Solar}"
DEFAULT_EMAIL="${GF_DEFAULT_USER_EMAIL:-solar@localhost}"
DEFAULT_ROLE="${GF_DEFAULT_USER_ROLE:-Viewer}"

api() {
  method="$1"
  path="$2"
  body="${3:-}"
  if [ -n "$body" ]; then
    curl -sfS -u "${ADMIN_USER}:${ADMIN_PASSWORD}" \
      -H "Content-Type: application/json" \
      -X "$method" \
      -d "$body" \
      "${GRAFANA_URL}${path}"
  else
    curl -sfS -u "${ADMIN_USER}:${ADMIN_PASSWORD}" \
      -H "Content-Type: application/json" \
      -X "$method" \
      "${GRAFANA_URL}${path}"
  fi
}

echo ">>> Waiting for Grafana API at ${GRAFANA_URL}..."
for i in $(seq 1 90); do
  if curl -sfS "${GRAFANA_URL}/api/health" >/dev/null 2>&1; then
    break
  fi
  sleep 2
done

if ! curl -sfS "${GRAFANA_URL}/api/health" >/dev/null 2>&1; then
  echo "ERROR: Grafana API not ready"
  exit 1
fi

echo ">>> Ensuring Grafana user '${DEFAULT_LOGIN}' exists..."
if api GET "/api/users/lookup?loginOrEmail=${DEFAULT_LOGIN}" >/dev/null 2>&1; then
  echo ">>> User '${DEFAULT_LOGIN}' already exists — skipping create"
  exit 0
fi

api POST "/api/admin/users" "$(cat <<EOF
{
  "name": "${DEFAULT_NAME}",
  "email": "${DEFAULT_EMAIL}",
  "login": "${DEFAULT_LOGIN}",
  "password": "${DEFAULT_PASSWORD}"
}
EOF
)"

user_id="$(api GET "/api/users/lookup?loginOrEmail=${DEFAULT_LOGIN}" | sed -n 's/.*"id":\([0-9]*\).*/\1/p' | head -1)"
if [ -z "$user_id" ]; then
  echo "ERROR: Created user but could not resolve id"
  exit 1
fi

api PATCH "/api/org/users/${user_id}" "$(cat <<EOF
{
  "role": "${DEFAULT_ROLE}"
}
EOF
)"

echo ">>> Created Grafana user '${DEFAULT_LOGIN}' (${DEFAULT_ROLE})"
