#!/usr/bin/env python3
"""Local smoke test: Influx UI via Electron /influx proxy + bare /api/v2/query."""

from __future__ import annotations

import base64
import http.cookiejar
import json
import re
import sys
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BASE = "http://127.0.0.1:4000"


def load_env() -> dict[str, str]:
    env: dict[str, str] = {}
    path = ROOT / ".env"
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        env[k.strip()] = v.strip().strip('"').strip("'")
    return env


def main() -> int:
    env = load_env()
    influx_token = env.get("INFLUX_TOKEN", "")
    org = env.get("INFLUX_ORG", "LHRS")
    print(f"token_len={len(influx_token)} org={org}")

    with urllib.request.urlopen(f"{BASE}/api/health", timeout=5) as r:
        health = json.loads(r.read().decode())
    st = health.get("status") or {}
    print("health influx_connected=", st.get("influx_connected"), "url=", st.get("influx_url"))

    with urllib.request.urlopen(f"{BASE}/influx/", timeout=10) as r:
        html = r.read().decode("utf-8", "replace")
    print("ui /influx/ ok basepath=", re.findall(r'data-basepath="[^"]*"', html)[:1])

    auth = base64.b64encode(b"admin:lhrs2025!").decode()
    cj = http.cookiejar.CookieJar()
    opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cj))

    def call(url: str, data: bytes | None = None, headers: dict | None = None, method: str | None = None):
        req = urllib.request.Request(url, data=data, headers=headers or {}, method=method)
        try:
            with opener.open(req, timeout=15) as resp:
                return resp.status, resp.read(), resp.headers
        except urllib.error.HTTPError as e:
            return e.code, e.read(), e.headers

    status, _body, hdrs = call(
        f"{BASE}/influx/api/v2/signin",
        data=b"{}",
        headers={"Authorization": f"Basic {auth}", "Content-Type": "application/json"},
        method="POST",
    )
    print("signin", status, "set-cookie=", hdrs.get("Set-Cookie") if hdrs else None)
    print("cookies", [(c.name, c.path) for c in cj])

    status, body, _ = call(f"{BASE}/influx/api/v2/me")
    print("me", status, (body or b"")[:80])

    flux = 'import "influxdata/influxdb/schema"\nschema.tagKeys(bucket: "telemetry_main")'
    qbody = json.dumps({"query": flux, "type": "flux"}).encode()
    ok = True
    for path in (f"/api/v2/query?org={org}", f"/influx/api/v2/query?org={org}"):
        status, body, _ = call(
            BASE + path,
            data=qbody,
            headers={"Content-Type": "application/json", "Accept": "application/csv"},
            method="POST",
        )
        preview = (body or b"")[:100].replace(b"\r", b"")
        print(f"QUERY {path} -> {status} {preview!r}")
        if status != 200:
            ok = False

    status, body, _ = call(f"{BASE}/influx/api/v2/buckets?org={org}")
    text = (body or b"").decode()
    bare = len(re.findall(r'(?<!/influx)"/api/v2/', text))
    prefixed = len(re.findall(r'"/influx/api/v2/', text))
    print(f"buckets {status} bare_links={bare} prefixed_links={prefixed}")
    if status != 200 or bare:
        ok = False

    # Token auth on bare path (no session)
    req = urllib.request.Request(
        f"{BASE}/api/v2/query?org={org}",
        data=qbody,
        headers={
            "Authorization": f"Token {influx_token}",
            "Content-Type": "application/json",
            "Accept": "application/csv",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            print("token bare /api/v2/query", r.status, r.read()[:80])
    except urllib.error.HTTPError as e:
        print("token bare /api/v2/query ERR", e.code, e.read()[:200])
        ok = False

    print("PASS" if ok else "FAIL")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
