"""FastAPI app: REST config/MDC/lifecycle + WebSocket live feed.

Wire shapes are fixed by `backend/API_CONTRACT.md`. Every WS server->client frame
is the `{ "type", "payload" }` envelope; client->server messages are
`request_cache` / `reset_cache`.
"""
from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import Body, FastAPI, File, HTTPException, Query, Request, UploadFile, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .mdc_dbc import DbcToolError, export_dbc, import_dbc
from .schemas import EventStart, ValidationError, validate_config
from .events import events
from .settings import get_settings, update_settings
from .sharepoint import SharepointError, branches as sp_branches
from .sharepoint import checkout as sp_checkout
from .sharepoint import clone as sp_clone
from .sharepoint import create_branch as sp_create_branch
from .sharepoint import discard as sp_discard
from .sharepoint import fetch as sp_fetch
from .sharepoint import pull as sp_pull
from .sharepoint import push as sp_push
from .sharepoint import stash as sp_stash
from .sharepoint import status as sp_status
from .state import store
from .telemetry import telemetry
from .vehicles import create_vehicle, list_vehicles, validate_vehicle_name
from .webapp import mount_webapp

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    await events.refresh_active()
    yield
    if telemetry.running:
        await telemetry.stop()


app = FastAPI(title="CAN Backend", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"]
)


def _raise_bad_request(e: ValidationError) -> None:
    raise HTTPException(status_code=400, detail={"title": e.title, "detail": e.detail})


class ApiError(Exception):
    def __init__(self, status_code: int, title: str, detail: str):
        self.status_code = status_code
        self.title = title
        self.detail = detail


@app.exception_handler(ApiError)
async def _api_error_handler(_request: Request, exc: ApiError):
    return JSONResponse(
        status_code=exc.status_code,
        content={"error": {"title": exc.title, "detail": exc.detail}},
    )


@app.exception_handler(SharepointError)
async def _sharepoint_error_handler(_request: Request, exc: SharepointError):
    return JSONResponse(
        status_code=exc.status_code,
        content={"error": {"title": exc.title, "detail": exc.detail}},
    )


def _guard_ingest() -> None:
    if telemetry.running:
        raise ApiError(
            409,
            "Ingest active",
            "Stop CAN ingest before changing the data checkout.",
        )


# --- Config CRUD ---
@app.get("/api/config")
async def get_config():
    return store.get_config()


@app.put("/api/config")
async def put_config(config: dict = Body(...)):
    try:
        return store.put_config(config)
    except ValidationError as e:
        _raise_bad_request(e)


@app.patch("/api/config")
async def patch_config(patch: dict = Body(...)):
    try:
        return store.patch_config(patch)
    except ValidationError as e:
        _raise_bad_request(e)


# --- MDC CRUD ---
@app.get("/api/mdc")
async def list_mdc():
    return store.list_mdc()


@app.get("/api/mdc/{spec_id}")
async def get_mdc(spec_id: str):
    spec = store.get_mdc(spec_id)
    if spec is None:
        raise HTTPException(status_code=404, detail="MDC spec not found.")
    return spec


@app.put("/api/mdc/{spec_id}")
async def put_mdc(spec_id: str, spec: dict = Body(...)):
    try:
        store.put_mdc(spec_id, spec)
    except ValidationError as e:
        _raise_bad_request(e)
    return {"id": spec_id}


@app.delete("/api/mdc/{spec_id}")
async def delete_mdc(spec_id: str):
    if not store.delete_mdc(spec_id):
        raise HTTPException(status_code=404, detail="MDC spec not found.")
    return {"message": f"Deleted '{spec_id}'."}


@app.post("/api/mdc/import-dbc")
async def import_dbc_endpoint(
    file: UploadFile = File(...),
    vehicle_id: str | None = None,
):
    if not file.filename or not file.filename.lower().endswith(".dbc"):
        raise HTTPException(status_code=400, detail="Expected a .dbc file upload.")
    try:
        spec = import_dbc(await file.read(), vehicle_id)
    except ValidationError as e:
        _raise_bad_request(e)
    except DbcToolError as e:
        raise HTTPException(status_code=400, detail={"title": "DBC import failed", "detail": str(e)})
    return {"spec": spec}


@app.post("/api/mdc/export-dbc")
async def export_dbc_endpoint(
    spec: dict = Body(...),
    network_id: str | None = None,
):
    try:
        dbc, warnings = export_dbc(spec, network_id)
    except ValidationError as e:
        _raise_bad_request(e)
    except DbcToolError as e:
        raise HTTPException(status_code=400, detail={"title": "DBC export failed", "detail": str(e)})
    return {"dbc": dbc, "warnings": warnings}


# --- Lifecycle ---
@app.post("/api/start")
async def start():
    if telemetry.running:
        raise HTTPException(status_code=400, detail="Service is already running.")
    config = store.get_config()
    try:
        validate_config(config)
    except ValidationError as e:
        _raise_bad_request(e)
    await telemetry.start(config)
    return {"message": "Telemetry service started."}


@app.post("/api/stop")
async def stop():
    if not telemetry.running:
        raise HTTPException(status_code=400, detail="Service is not running.")
    await telemetry.stop()
    return {"message": "Telemetry service stopped."}


@app.get("/api/status")
async def status():
    return telemetry.status_payload()


# --- Named events ---
@app.post("/api/events")
async def start_event(body: EventStart):
    ev = await events.start(body.name, body.tags, body.note)
    await telemetry.broadcast_status()
    return ev


@app.post("/api/events/{event_id}/stop")
async def stop_event(event_id: str):
    try:
        ev = await events.stop(event_id)
    except KeyError:
        raise HTTPException(status_code=404, detail="Event not found.")
    await telemetry.broadcast_status()
    return ev


@app.get("/api/events")
async def list_events(
    from_: int | None = Query(None, alias="from"),
    to: int | None = None,
):
    return await events.list(from_, to)


@app.get("/api/events/active")
async def active_event():
    return await events.active()


# --- Local settings + Sharepoint sync (contract §4) ---
@app.get("/api/sharepoint/status")
async def sharepoint_status():
    return await sp_status()


@app.post("/api/sharepoint/clone")
async def sharepoint_clone(body: dict = Body(default_factory=dict)):
    _guard_ingest()
    return await sp_clone(
        body.get("remoteUrl"),
        body.get("branch"),
        repair=bool(body.get("repair")),
    )


@app.post("/api/sharepoint/fetch")
async def sharepoint_fetch():
    _guard_ingest()
    return await sp_fetch()


@app.post("/api/sharepoint/pull")
async def sharepoint_pull():
    _guard_ingest()
    return await sp_pull()


@app.post("/api/sharepoint/push")
async def sharepoint_push(body: dict = Body(default_factory=dict)):
    _guard_ingest()
    return await sp_push(body.get("branch"))


@app.post("/api/sharepoint/checkout")
async def sharepoint_checkout(body: dict = Body(...)):
    _guard_ingest()
    branch = body.get("branch")
    if not branch:
        raise ApiError(400, "Invalid request", "branch is required")
    return await sp_checkout(branch, body.get("dirty"))


@app.post("/api/sharepoint/discard")
async def sharepoint_discard():
    _guard_ingest()
    return await sp_discard()


@app.get("/api/sharepoint/branches")
async def sharepoint_branches():
    return await sp_branches()


@app.post("/api/sharepoint/branches")
async def sharepoint_create_branch(body: dict = Body(...)):
    _guard_ingest()
    name = body.get("name")
    if not name:
        raise ApiError(400, "Invalid request", "name is required")
    return await sp_create_branch(name, checkout=body.get("checkout", True))


@app.post("/api/sharepoint/stash")
async def sharepoint_stash(body: dict = Body(...)):
    op = body.get("op")
    if op in ("save", "pop"):
        _guard_ingest()
    if not op:
        raise ApiError(400, "Invalid request", "op is required")
    return await sp_stash(op, body.get("message"))


@app.get("/api/settings")
async def settings_get():
    return get_settings()


@app.put("/api/settings")
async def settings_put(patch: dict = Body(...)):
    try:
        return update_settings(patch)
    except ValueError as exc:
        raise ApiError(400, "Invalid settings", str(exc)) from exc


@app.get("/api/vehicles")
async def vehicles_get():
    return list_vehicles()


@app.post("/api/vehicles")
async def vehicles_post(body: dict = Body(...)):
    name = body.get("name", "")
    err = validate_vehicle_name(name)
    if err:
        raise ApiError(400, "Invalid vehicle name", err)
    try:
        return create_vehicle(name)
    except FileExistsError:
        raise ApiError(409, "Vehicle exists", f"Vehicle {name!r} already exists.") from None


# --- WebSocket ---
@app.websocket("/ws")
async def ws(websocket: WebSocket):
    await websocket.accept()

    async def send(envelope: dict) -> None:
        await websocket.send_json(envelope)

    telemetry.add_client(send)
    await send({"type": "status", "payload": telemetry.status_payload()})
    if telemetry.get_cache():
        await send({"type": "signal_cache", "payload": telemetry.get_cache()})
    try:
        while True:
            msg = await websocket.receive_json()
            kind = msg.get("type")
            if kind == "request_cache":
                await send({"type": "signal_cache", "payload": telemetry.get_cache()})
            elif kind == "reset_cache":
                telemetry.reset_cache()
                await send({"type": "signal_cache", "payload": telemetry.get_cache()})
    except WebSocketDisconnect:
        pass
    finally:
        telemetry.remove_client(send)


# Static web-app serving (server mode only) is registered LAST so the SPA
# catch-all never shadows the /api and /ws routes above. Desktop role: no-op.
mount_webapp(app, store.get_config())


if __name__ == "__main__":
    import uvicorn

    cfg = store.get_config().get("api", {})
    uvicorn.run(app, host=cfg.get("host", "127.0.0.1"), port=cfg.get("port", 8350))
