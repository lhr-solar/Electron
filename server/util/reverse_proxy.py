import logging
import os
import re
from urllib.parse import urljoin, urlparse

import httpx
from fastapi import Request
from fastapi.responses import HTMLResponse, Response

from server.config import settings

logger = logging.getLogger(__name__)

HOP_BY_HOP_HEADERS = {
    "connection",
    "keep-alive",
    "proxy-authenticate",
    "proxy-authorization",
    "te",
    "trailers",
    "transfer-encoding",
    "upgrade",
    "content-length",
    "content-encoding",
}

GRAFANA_UPSTREAM = os.environ.get("GRAFANA_URL", "http://127.0.0.1:3000").rstrip("/")
INFLUX_UPSTREAM = str(settings.INFLUX_CONFIG.get("INFLUX_URL", "http://localhost:8086")).rstrip("/")

GRAFANA_PUBLIC_PREFIX = "/grafana"
INFLUX_PUBLIC_PREFIX = "/influx"

_REWRITE_CONTENT_TYPES = ("text/html", "application/javascript", "text/javascript", "text/css")


def _disconnected_page(title: str, service: str, hint: str) -> str:
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
  <title>{title}</title>
  <style>
    body {{
      margin: 0;
      min-height: 100vh;
      display: grid;
      place-items: center;
      background: #0a0a0b;
      color: #e4e4e7;
      font-family: Inter, system-ui, sans-serif;
    }}
    .card {{
      max-width: 420px;
      padding: 32px;
      border: 1px solid #1f1f23;
      border-radius: 8px;
      background: #0f0f11;
      text-align: center;
    }}
    h1 {{ margin: 0 0 8px; font-size: 1.25rem; }}
    p {{ margin: 0; color: #a1a1aa; line-height: 1.5; }}
    .badge {{
      display: inline-block;
      margin-bottom: 16px;
      padding: 4px 10px;
      border-radius: 999px;
      background: #3f1d1d;
      color: #fca5a5;
      font-size: 0.75rem;
      font-weight: 600;
      letter-spacing: 0.04em;
      text-transform: uppercase;
    }}
    a {{ color: #93c5fd; }}
  </style>
</head>
<body>
  <div class="card">
    <div class="badge">Not connected</div>
    <h1>{service} unavailable</h1>
    <p>{hint}</p>
    <p style="margin-top: 16px;"><a href="/">Open Electron manage UI</a></p>
  </div>
</body>
</html>"""


def grafana_disconnected() -> HTMLResponse:
    return HTMLResponse(
        _disconnected_page(
            "Grafana unavailable",
            "Grafana",
            "Start the Grafana service (for example via grafana/docker-compose.yml) and open /grafana/.",
        ),
        status_code=503,
    )


def influx_disconnected() -> HTMLResponse:
    return HTMLResponse(
        _disconnected_page(
            "InfluxDB unavailable",
            "InfluxDB",
            "Start InfluxDB (for example via grafana/docker-compose.yml) and open /influx/.",
        ),
        status_code=503,
    )


def _filtered_request_headers(request: Request) -> dict[str, str]:
    headers: dict[str, str] = {}
    for key, value in request.headers.items():
        lower = key.lower()
        if lower in HOP_BY_HOP_HEADERS:
            continue
        if lower == "host":
            continue
        headers[key] = value
    return headers


def _rewrite_public_path(path: str, public_prefix: str) -> str:
    prefix = public_prefix.rstrip("/") or ""
    if not path.startswith("/"):
        path = "/" + path
    if prefix and (path == prefix or path.startswith(prefix + "/")):
        return path
    if prefix:
        return prefix + path if path != "/" else prefix + "/"
    return path


def _rewrite_location(value: str, upstream_base: str, public_prefix: str) -> str:
    if not value:
        return value
    upstream = upstream_base.rstrip("/")
    parsed = urlparse(value)
    if parsed.scheme and parsed.netloc:
        upstream_parsed = urlparse(upstream)
        if parsed.netloc == upstream_parsed.netloc:
            path = _rewrite_public_path(parsed.path or "/", public_prefix)
            query = f"?{parsed.query}" if parsed.query else ""
            fragment = f"#{parsed.fragment}" if parsed.fragment else ""
            return path + query + fragment
        return value
    if value.startswith("/"):
        return _rewrite_public_path(value, public_prefix)
    return value


def _rewrite_body_paths(content: bytes, public_prefix: str) -> bytes:
    prefix = public_prefix.rstrip("/")
    if not prefix:
        return content
    try:
        text = content.decode("utf-8")
    except UnicodeDecodeError:
        return content

    prefix_name = prefix.lstrip("/")
    # Influx UI hard-codes root paths; remap under the public prefix once.
    text = re.sub(
        rf'(src|href)="/(?!/|{re.escape(prefix_name)}/)',
        rf'\1="{prefix}/',
        text,
    )
    text = text.replace('<base href="/">', f'<base href="{prefix}/">')
    text = text.replace('<base href="">', '')
    text = text.replace('data-basepath=""', f'data-basepath="{prefix}"')
    # Webpack chunk publicPath (e.g. o.p="/").
    text = text.replace('.p="/"', f'.p="{prefix}/"')
    # Bust browsers that cached the unrewwritten boot JS under the same URL.
    text = re.sub(
        rf'(src="{re.escape(prefix)}/[^"]+\.js)(")',
        rf'\1?p={prefix_name}\2',
        text,
    )
    # API calls must stay under the proxy prefix, not the Electron /api routes.
    text = text.replace(f'{prefix}/api/', '\0INFLUX_API\0')
    text = text.replace('/api/', f'{prefix}/api/')
    text = text.replace('\0INFLUX_API\0', f'{prefix}/api/')
    return text.encode("utf-8")


def _rewrite_set_cookie(value: str, public_prefix: str) -> str:
    prefix = public_prefix.rstrip("/") or ""
    if not prefix:
        return value
    if not re.search(r"(?i)Path=", value):
        return f"{value}; Path={prefix}/"

    def _rewrite_path(match: re.Match[str]) -> str:
        path = match.group(1) or "/"
        if path == prefix or path.startswith(prefix + "/"):
            return f"Path={path}"
        if path == "/":
            return f"Path={prefix}/"
        return f"Path={prefix}{path}"

    return re.sub(r"(?i)Path=([^;]*)", _rewrite_path, value, count=1)


_CACHE_VALIDATOR_HEADERS = {
    "etag",
    "last-modified",
    "cache-control",
    "expires",
    "age",
}


def _filtered_response_headers(
    headers: httpx.Headers,
    *,
    upstream_base: str = "",
    public_prefix: str = "",
    body_rewritten: bool = False,
) -> tuple[dict[str, str], list[str]]:
    out: dict[str, str] = {}
    cookies: list[str] = []
    for key, value in headers.multi_items():
        lower = key.lower()
        if lower in HOP_BY_HOP_HEADERS:
            continue
        # Rewritten bodies must not reuse upstream validators or the browser
        # will 304-cache the original root-path JS and break /influx/.
        if body_rewritten and lower in _CACHE_VALIDATOR_HEADERS:
            continue
        if lower == "location" and public_prefix:
            value = _rewrite_location(value, upstream_base, public_prefix)
        elif lower == "set-cookie":
            if public_prefix:
                value = _rewrite_set_cookie(value, public_prefix)
            cookies.append(value)
            continue
        out[key] = value
    if body_rewritten:
        out["Cache-Control"] = "no-store"
    return out, cookies


def _upstream_path(request_path: str, strip_prefix: str) -> str:
    if not strip_prefix:
        return request_path
    normalized = strip_prefix.rstrip("/")
    if request_path == normalized or request_path == normalized + "/":
        return "/"
    if request_path.startswith(strip_prefix):
        remainder = request_path[len(strip_prefix) :].lstrip("/")
        return "/" + remainder if remainder else "/"
    return request_path


async def proxy_to_upstream(
    request: Request,
    upstream_base: str,
    *,
    strip_prefix: str = "",
    public_prefix: str = "",
    rewrite_body_paths: bool = False,
) -> Response:
    path = _upstream_path(request.url.path, strip_prefix)
    query = request.url.query
    upstream_url = urljoin(upstream_base + "/", path.lstrip("/"))
    if query:
        upstream_url = f"{upstream_url}?{query}"

    body = await request.body()
    headers = _filtered_request_headers(request)
    # Always fetch a full body when we plan to rewrite paths.
    if rewrite_body_paths:
        headers.pop("If-None-Match", None)
        headers.pop("if-none-match", None)
        headers.pop("If-Modified-Since", None)
        headers.pop("if-modified-since", None)

    try:
        async with httpx.AsyncClient(follow_redirects=False, timeout=30.0) as client:
            upstream_response = await client.request(
                request.method,
                upstream_url,
                headers=headers,
                content=body if body else None,
            )
    except httpx.RequestError as exc:
        logger.warning("Proxy request failed for %s: %s", upstream_url, exc)
        raise

    content = upstream_response.content
    content_type = upstream_response.headers.get("content-type", "")
    body_rewritten = False
    if rewrite_body_paths and public_prefix and any(ct in content_type for ct in _REWRITE_CONTENT_TYPES):
        content = _rewrite_body_paths(content, public_prefix)
        body_rewritten = True

    response_headers, cookies = _filtered_response_headers(
        upstream_response.headers,
        upstream_base=upstream_base,
        public_prefix=public_prefix,
        body_rewritten=body_rewritten,
    )
    response = Response(
        content=content,
        status_code=upstream_response.status_code,
        headers=response_headers,
    )
    for cookie in cookies:
        response.raw_headers.append((b"set-cookie", cookie.encode("latin-1")))
    return response
