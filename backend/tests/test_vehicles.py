"""Vehicle discovery and POST /api/vehicles (contract §5)."""
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from backend.main import app
from backend.vehicles import create_vehicle, list_vehicles


@pytest.fixture
def vehicles_root(monkeypatch, tmp_path):
    root = tmp_path / "can" / "vehicles"
    root.mkdir(parents=True)
    monkeypatch.setenv("CAN_ROOT", str(tmp_path / "can"))
    return root


def test_list_vehicles_dbc_only(vehicles_root):
    (vehicles_root / "Daybreak").mkdir()
    (vehicles_root / "Daybreak" / "bus.dbc").write_text("VERSION \"\"")
    out = list_vehicles()
    assert out == [{"id": "Daybreak", "hasDbc": True, "hasMdc": False}]


def test_list_vehicles_mdc_only(vehicles_root):
    (vehicles_root / "lhr-ev1").mkdir()
    (vehicles_root / "lhr-ev1" / "project.mdc.json").write_text("{}")
    out = list_vehicles()
    assert out == [{"id": "lhr-ev1", "hasDbc": False, "hasMdc": True}]


def test_list_vehicles_skips_empty_dirs(vehicles_root):
    (vehicles_root / "Empty").mkdir()
    (vehicles_root / "Real").mkdir()
    (vehicles_root / "Real" / "x.dbc").write_text("VERSION \"\"")
    assert [v["id"] for v in list_vehicles()] == ["Real"]


def test_create_vehicle_api(vehicles_root):
    with TestClient(app) as client:
        resp = client.post("/api/vehicles", json={"name": "NewCar"})
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body == {"id": "NewCar", "hasDbc": False, "hasMdc": False}
        assert (vehicles_root / "NewCar").is_dir()


def test_create_vehicle_rejects_bad_name(vehicles_root):
    with TestClient(app) as client:
        resp = client.post("/api/vehicles", json={"name": "../evil"})
        assert resp.status_code == 400
        assert resp.json()["error"]["title"] == "Invalid vehicle name"


def test_create_vehicle_rejects_duplicate(vehicles_root):
    (vehicles_root / "Dup").mkdir()
    with TestClient(app) as client:
        resp = client.post("/api/vehicles", json={"name": "Dup"})
        assert resp.status_code == 409
        assert resp.json()["error"]["title"] == "Vehicle exists"


def test_create_vehicle_direct(vehicles_root):
    entry = create_vehicle("Direct")
    assert entry["id"] == "Direct"
    assert (vehicles_root / "Direct").is_dir()
