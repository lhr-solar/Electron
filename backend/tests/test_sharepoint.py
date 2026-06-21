"""Sharepoint git wrapper smoke tests (contract §6)."""
from __future__ import annotations

import asyncio

import pytest

from backend import sharepoint
from backend.paths import can_home


@pytest.fixture
def isolated_home(monkeypatch, tmp_path):
    monkeypatch.setenv("CAN_HOME", str(tmp_path / "electron"))
    monkeypatch.delenv("CAN_ROOT", raising=False)
    return tmp_path / "electron"


def test_status_not_cloned_uses_dev_fallback_can_root(isolated_home):
    if not sharepoint.git_installed():
        pytest.skip("git not installed")
    result = asyncio.run(sharepoint.status())
    assert result["gitInstalled"] is True
    assert result["cloned"] is False
    assert result["branch"] is None
    assert result["dirty"] is False
    assert result["commit"] is None
    assert result["canRootExists"] is True
    assert (can_home() / "sharepoint" / ".git").exists() is False


@pytest.mark.skipif(not sharepoint.git_installed(), reason="git not installed")
def test_fetch_requires_clone(isolated_home):
    with pytest.raises(sharepoint.SharepointError, match="not initialized"):
        asyncio.run(sharepoint.fetch())
