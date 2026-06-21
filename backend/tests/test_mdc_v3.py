"""MDC v3 schema validation, mdc_io round-trip, CRUD, and DBC import/export."""
from __future__ import annotations

import copy
import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from backend.main import app
from backend.mdc_dbc import DbcToolError, export_dbc, import_dbc
from backend.mdc_io import load_mdc_project
from backend.schemas import ValidationError, validate_mdc

from backend.paths import can_root

_REPO = Path(__file__).resolve().parents[2]
_V3_EXAMPLE = can_root() / "vehicles" / "lhr-ev1" / "project.mdc.json"
_SAMPLE_DBC = _REPO / "Embedded-Sharepoint" / "can" / "vehicles" / "HighNoon" / "ElconCAN.dbc"


@pytest.fixture
def v3_spec() -> dict:
    return json.loads(_V3_EXAMPLE.read_text())


def test_v3_example_validates(v3_spec: dict):
    validate_mdc(v3_spec)
    assert v3_spec["schemaVersion"] == "3.0.0"
    assert v3_spec["networks"]
    assert "vehicles" not in v3_spec


@pytest.mark.parametrize(
    "mutator,needle",
    [
        (lambda s: s.update({"vehicles": [{"id": "x", "networks": []}]}), "vehicles"),
        (
            lambda s: s["networks"][0]["messages"][0]["signals"][0].update({"startBit": 0}),
            "startBit",
        ),
    ],
    ids=["root-vehicles", "signal-startBit"],
)
def test_reject_v2_shaped_field(v3_spec: dict, mutator, needle: str):
    bad = copy.deepcopy(v3_spec)
    mutator(bad)
    with pytest.raises(ValidationError, match=needle):
        validate_mdc(bad)


def test_mdc_io_read_write_read_roundtrip(v3_spec: dict, tmp_path: Path):
    out = tmp_path / "project.mdc.json"
    out.write_text(json.dumps(v3_spec, indent=2), encoding="utf-8")
    again = load_mdc_project(out)
    validate_mdc(again)
    assert again["id"] == v3_spec["id"]
    assert again["networks"][0]["messages"][0]["signals"][0]["start"] == (
        v3_spec["networks"][0]["messages"][0]["signals"][0]["start"]
    )


def test_mdc_crud_endpoints(v3_spec: dict, monkeypatch, tmp_path: Path):
    mdc_dir = tmp_path / "mdc"
    mdc_dir.mkdir()
    monkeypatch.setattr("backend.state._MDC_DIR", mdc_dir)
    spec_id = "lhr_ev1_test"

    with TestClient(app) as client:
        assert client.get("/api/mdc").json() == []

        put = client.put(f"/api/mdc/{spec_id}", json=v3_spec)
        assert put.status_code == 200, put.text
        assert put.json() == {"id": spec_id}

        listed = client.get("/api/mdc").json()
        assert len(listed) == 1
        assert listed[0]["id"] == spec_id

        got = client.get(f"/api/mdc/{spec_id}").json()
        assert got["schemaVersion"] == "3.0.0"
        assert got["id"] == v3_spec["id"]

        missing = client.get("/api/mdc/no-such-spec")
        assert missing.status_code == 404

        deleted = client.delete(f"/api/mdc/{spec_id}")
        assert deleted.status_code == 200
        assert client.get(f"/api/mdc/{spec_id}").status_code == 404

        assert client.delete(f"/api/mdc/{spec_id}").status_code == 404


def test_put_mdc_rejects_invalid_spec(v3_spec: dict, monkeypatch, tmp_path: Path):
    monkeypatch.setattr("backend.state._MDC_DIR", tmp_path / "mdc")
    bad = copy.deepcopy(v3_spec)
    bad["vehicles"] = []
    with TestClient(app) as client:
        resp = client.put("/api/mdc/bad", json=bad)
    assert resp.status_code == 400
    assert resp.json()["detail"]["title"] == "Invalid MDC spec"


def test_import_dbc_produces_valid_v3():
    if not _SAMPLE_DBC.is_file():
        pytest.skip(f"missing sample DBC: {_SAMPLE_DBC}")
    try:
        spec = import_dbc(_SAMPLE_DBC.read_bytes(), vehicle_id="elcon")
    except DbcToolError as exc:
        pytest.skip(f"dbc2mdc unavailable: {exc}")
    validate_mdc(spec)
    assert spec["schemaVersion"] == "3.0.0"
    assert spec.get("networks")


def test_export_dbc_returns_dropped_feature_warnings(v3_spec: dict):
    dbc, warnings = export_dbc(v3_spec, network_id="powertrain")
    assert "BO_" in dbc
    assert warnings
    assert all(w.startswith("mdc2dbc: warning:") for w in warnings)
    joined = "\n".join(warnings)
    assert "computedSignals" in joined or "display" in joined


def test_import_dbc_endpoint():
    if not _SAMPLE_DBC.is_file():
        pytest.skip(f"missing sample DBC: {_SAMPLE_DBC}")
    with TestClient(app) as client:
        with _SAMPLE_DBC.open("rb") as fh:
            resp = client.post(
                "/api/mdc/import-dbc",
                files={"file": ("ElconCAN.dbc", fh, "application/octet-stream")},
                params={"vehicle_id": "elcon"},
            )
        if resp.status_code == 400 and "dbc2mdc" in resp.text:
            pytest.skip("dbc2mdc unavailable in this environment")
        assert resp.status_code == 200, resp.text
        validate_mdc(resp.json()["spec"])


def test_export_dbc_endpoint(v3_spec: dict):
    with TestClient(app) as client:
        resp = client.post(
            "/api/mdc/export-dbc",
            params={"network_id": "powertrain"},
            json=v3_spec,
        )
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert "BO_" in body["dbc"]
        assert body["warnings"]
        assert all(w.startswith("mdc2dbc: warning:") for w in body["warnings"])
