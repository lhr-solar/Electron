"""settings.json load/seed/save (contract §3)."""
from __future__ import annotations

import json

import pytest

from backend import settings


@pytest.fixture
def settings_home(monkeypatch, tmp_path):
    monkeypatch.setenv("CAN_HOME", str(tmp_path / "electron"))
    for key in (
        "CAN_DEV_DEFAULT_VEHICLE",
        "CAN_DEV_DEFAULT_BITRATE",
        "CAN_DEV_SHAREPOINT_REMOTE",
        "CAN_DEV_SHAREPOINT_BRANCH",
    ):
        monkeypatch.delenv(key, raising=False)
    return tmp_path / "electron"


def test_seed_defaults_on_missing_file(settings_home):
    data = settings.get_settings()
    assert data["defaultVehicle"] is None
    assert data["defaultReadBitrate"] == 500000
    assert data["sharepoint"]["branch"] == "custom_mdc"
    path = settings_home / "settings.json"
    assert path.is_file()
    assert json.loads(path.read_text()) == data


def test_dev_flags_fill_unset_keys(settings_home, monkeypatch):
    monkeypatch.setenv("CAN_DEV_DEFAULT_VEHICLE", "Daybreak")
    monkeypatch.setenv("CAN_DEV_DEFAULT_BITRATE", "250000")
    monkeypatch.setenv("CAN_DEV_SHAREPOINT_BRANCH", "feature-x")
    data = settings.get_settings()
    assert data["defaultVehicle"] == "Daybreak"
    assert data["defaultReadBitrate"] == 250000
    assert data["sharepoint"]["branch"] == "feature-x"


def test_persisted_values_win_over_flags(settings_home, monkeypatch):
    path = settings_home / "settings.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(
            {
                "defaultVehicle": "Persisted",
                "defaultReadBitrate": 123,
                "sharepoint": {"remoteUrl": "https://example.com/r.git", "branch": "main"},
            }
        )
    )
    monkeypatch.setenv("CAN_DEV_DEFAULT_VEHICLE", "FlagVehicle")
    monkeypatch.setenv("CAN_DEV_DEFAULT_BITRATE", "999")
    data = settings.get_settings()
    assert data["defaultVehicle"] == "Persisted"
    assert data["defaultReadBitrate"] == 123
    assert data["sharepoint"]["remoteUrl"] == "https://example.com/r.git"
    assert data["sharepoint"]["branch"] == "main"


def test_corrupt_file_reseeds(settings_home):
    path = settings_home / "settings.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("{not json")
    data = settings.get_settings()
    assert data["defaultReadBitrate"] == 500000
    assert json.loads(path.read_text())["sharepoint"]["branch"] == "custom_mdc"


def test_update_settings_merges_patch(settings_home):
    settings.get_settings()
    merged = settings.update_settings({"defaultReadBitrate": 750000})
    assert merged["defaultReadBitrate"] == 750000
    assert settings.get_settings()["defaultReadBitrate"] == 750000


def test_effective_default_vehicle_fallback(settings_home, monkeypatch):
    settings.update_settings({"defaultVehicle": "Missing"})
    warned: list[str] = []
    got = settings.effective_default_vehicle(["Alpha", "Beta"], warn=warned.append)
    assert got == "Alpha"
    assert warned and "Missing" in warned[0]
