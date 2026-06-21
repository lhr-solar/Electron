"""Path resolver precedence and dev fallback (contract §1)."""
from __future__ import annotations

from pathlib import Path

import pytest

from backend import paths


def test_can_home_can_home_env(monkeypatch):
    monkeypatch.setenv("CAN_HOME", "/tmp/custom-electron")
    assert paths.can_home() == Path("/tmp/custom-electron")


def test_can_home_defaults_to_dot_electron(monkeypatch, tmp_path):
    monkeypatch.delenv("CAN_HOME", raising=False)
    monkeypatch.setattr(paths.Path, "home", staticmethod(lambda: tmp_path))
    assert paths.can_home() == tmp_path / ".electron"


def test_can_root_can_root_env_wins_even_if_missing(monkeypatch, tmp_path):
    missing = tmp_path / "nope" / "can"
    monkeypatch.setenv("CAN_ROOT", str(missing))
    assert paths.can_root() == missing


def test_can_root_prefers_sharepoint_checkout(monkeypatch, tmp_path):
    monkeypatch.delenv("CAN_ROOT", raising=False)
    monkeypatch.setenv("CAN_HOME", str(tmp_path / "electron"))
    checkout = tmp_path / "electron" / "sharepoint" / "can"
    checkout.mkdir(parents=True)
    assert paths.can_root() == checkout


def test_can_root_dev_fallback(monkeypatch):
    monkeypatch.delenv("CAN_ROOT", raising=False)
    monkeypatch.delenv("CAN_HOME", raising=False)
    root = paths.can_root()
    assert root.name == "can"
    assert root.parent.name == "Embedded-Sharepoint"
    assert root.exists()


def test_mdc_docs_dir_backend_data_dir(monkeypatch, tmp_path):
    monkeypatch.setenv("BACKEND_DATA_DIR", str(tmp_path / "data"))
    assert paths.mdc_docs_dir() == tmp_path / "data" / "mdc"


def test_mdc_docs_dir_can_home_when_set(monkeypatch, tmp_path):
    monkeypatch.delenv("BACKEND_DATA_DIR", raising=False)
    monkeypatch.setenv("CAN_HOME", str(tmp_path / "electron"))
    assert paths.mdc_docs_dir() == tmp_path / "electron" / "mdc-docs"


def test_mdc_docs_dir_dev_fallback_without_can_home(monkeypatch):
    monkeypatch.delenv("BACKEND_DATA_DIR", raising=False)
    monkeypatch.delenv("CAN_HOME", raising=False)
    root = paths.mdc_docs_dir()
    assert root.name == "mdc"
    assert root.parent.name == "data"
