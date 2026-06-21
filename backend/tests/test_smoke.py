"""Smoke test: the backend boots with the FakeEngine, /api/status answers, and a
WS client receives a `live_message_batch` frame after /api/start.

Run from repo root: `pytest backend/tests`
"""
import os
import tempfile

import pytest
from fastapi.testclient import TestClient

from backend.engine import engine_is_native
from backend.events import events
from backend.main import app


def test_status_and_live_batch():
    if engine_is_native():
        pytest.skip("FakeEngine-only: native engine emits no batch without sources")

    with TestClient(app) as client:
        status = client.get("/api/status").json()
        assert status["service_running"] is False
        assert "vehicle" in status and "dbc_errors" in status
        assert status.get("active_event") is None

        assert client.post("/api/start").status_code == 200

        with client.websocket_connect("/ws") as ws:
            # First frame on connect is a status envelope.
            first = ws.receive_json()
            assert first["type"] in {"status", "signal_cache"}

            for _ in range(20):
                frame = ws.receive_json()
                if frame["type"] == "live_message_batch":
                    break
            else:
                raise AssertionError("no live_message_batch frame received")

            assert frame["type"] == "live_message_batch"
            payload = frame["payload"]
            assert isinstance(payload, list) and payload
            msg = payload[0]
            for field in ("timestamp_ns", "can_id_hex", "signals", "vehicle"):
                assert field in msg

        client.post("/api/stop")


def test_named_events_lifecycle():
    with tempfile.TemporaryDirectory() as tmp:
        os.environ["BACKEND_DATA_DIR"] = tmp
        events._store = None
        events._active_event = None
        with TestClient(app) as client:
            started = client.post(
                "/api/events",
                json={"name": "Hot lap", "tags": ["session"], "note": "qualifying"},
            )
            assert started.status_code == 200
            ev = started.json()
            assert ev["name"] == "Hot lap"
            assert ev["end_ts_ns"] is None
            assert ev["tags"] == ["session"]
            assert ev["note"] == "qualifying"
            event_id = ev["id"]

            status = client.get("/api/status").json()
            assert status["active_event"] is not None
            assert status["active_event"]["id"] == event_id

            active = client.get("/api/events/active").json()
            assert active is not None
            assert active["id"] == event_id

            stopped = client.post(f"/api/events/{event_id}/stop")
            assert stopped.status_code == 200
            assert stopped.json()["end_ts_ns"] is not None

            status = client.get("/api/status").json()
            assert status["active_event"] is None

            listed = client.get("/api/events").json()
            assert len(listed) == 1
            assert listed[0]["id"] == event_id
            assert listed[0]["end_ts_ns"] is not None
