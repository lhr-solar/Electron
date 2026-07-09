"""Password-only manage auth for ELECTRON_MODE=server."""
from __future__ import annotations

import hashlib
import hmac
import os
import time
from typing import Optional

from fastapi import HTTPException, Request, Response

COOKIE_NAME = "electron_manage"
SESSION_TTL_SEC = 12 * 60 * 60

ELECTRON_MODE = (os.environ.get("ELECTRON_MODE") or "client").strip().lower()
IS_SERVER_MODE = ELECTRON_MODE == "server"
MANAGE_PASSWORD = os.environ.get("MANAGE_PASSWORD") or ""


def _secret() -> bytes:
    raw = MANAGE_PASSWORD or "electron-manage-dev"
    return hashlib.sha256(f"electron-manage:{raw}".encode("utf-8")).digest()


def _sign(payload: str) -> str:
    return hmac.new(_secret(), payload.encode("utf-8"), hashlib.sha256).hexdigest()


def create_session_token() -> str:
    exp = int(time.time()) + SESSION_TTL_SEC
    payload = f"{exp}"
    return f"{payload}.{_sign(payload)}"


def verify_session_token(token: str | None) -> bool:
    if not token or "." not in token:
        return False
    payload, sig = token.rsplit(".", 1)
    if not hmac.compare_digest(sig, _sign(payload)):
        return False
    try:
        exp = int(payload)
    except ValueError:
        return False
    return exp >= int(time.time())


def password_ok(password: str) -> bool:
    if not MANAGE_PASSWORD:
        return False
    return hmac.compare_digest(password or "", MANAGE_PASSWORD)


def is_authenticated(request: Request) -> bool:
    if not IS_SERVER_MODE:
        return True
    return verify_session_token(request.cookies.get(COOKIE_NAME))


def require_manage_auth(request: Request) -> None:
    if not IS_SERVER_MODE:
        return
    if not MANAGE_PASSWORD:
        raise HTTPException(status_code=503, detail="MANAGE_PASSWORD is not configured.")
    if not is_authenticated(request):
        raise HTTPException(status_code=401, detail="Manage login required.")


def set_session_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        key=COOKIE_NAME,
        value=token,
        httponly=True,
        samesite="lax",
        max_age=SESSION_TTL_SEC,
        path="/",
    )


def clear_session_cookie(response: Response) -> None:
    response.delete_cookie(key=COOKIE_NAME, path="/")


# Mutating HTTP routes that require manage auth in server mode.
_PROTECTED_EXACT = {
    ("POST", "/api/start"),
    ("POST", "/api/stop"),
    ("POST", "/api/restart"),
    ("POST", "/api/config"),
    ("POST", "/api/tcp/configs"),
    ("PUT", "/api/tcp/auto"),
    ("POST", "/api/tcp/test"),
    ("POST", "/api/dbc/vehicles"),
    ("POST", "/api/events/decode-csv"),
    ("POST", "/api/influx/buckets"),
}


def path_requires_manage_auth(method: str, path: str) -> bool:
    if not IS_SERVER_MODE:
        return False
    method = method.upper()
    if method not in {"POST", "PUT", "DELETE", "PATCH"}:
        return False
    path = path.rstrip("/") or path
    if (method, path) in _PROTECTED_EXACT:
        return True
    if path.startswith("/api/tcp/configs/"):
        return True
    if path.startswith("/api/files/"):
        return True
    if path.startswith("/api/dbc/vehicles/") and "/schema" not in path:
        return True
    if path.startswith("/api/influx/buckets"):
        return True
    return False


def socket_manage_authenticated(environ: dict, auth: Optional[dict] = None) -> bool:
    """Best-effort cookie check for Socket.IO events (server mode)."""
    if not IS_SERVER_MODE:
        return True
    # Prefer explicit token from client auth payload if provided.
    if isinstance(auth, dict):
        token = auth.get("manage_token") or auth.get("token")
        if token and verify_session_token(str(token)):
            return True
    cookie_header = ""
    if environ:
        cookie_header = environ.get("HTTP_COOKIE") or ""
    for part in cookie_header.split(";"):
        part = part.strip()
        if part.startswith(f"{COOKIE_NAME}="):
            return verify_session_token(part.split("=", 1)[1])
    return False
