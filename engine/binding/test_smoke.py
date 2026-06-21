"""Smoke test for the `can_engine` in-process binding.

Builds an EngineHandle from a `file` source + the lhr-ev1 MDC project, starts it,
and asserts poll_batch yields decoded live_message_batch items.

Runs standalone (`python engine/binding/test_smoke.py`) or under pytest. When the
compiled module or its upstream deps (the `file` source / decode track) are not
present yet, it SKIPS rather than fails — the C++ + CMake target are the
deliverables in that case (see README.md for build commands).
"""

from __future__ import annotations

import json
import os
import sys
import time
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
MDC_PROJECT = REPO_ROOT / "Embedded-Sharepoint" / "can" / "vehicles" / "lhr-ev1" / "project.mdc.json"

# A capture file for the `file` source. Provide one via CAN_ENGINE_CAPTURE; the
# engine-sources track defines the format and param keys for the `file` source.
CAPTURE = os.environ.get("CAN_ENGINE_CAPTURE")


class SmokeSkip(Exception):
    """Raised to signal an environment-dependent skip (deps not built yet)."""


def _build_handle(can_engine):
    if not CAPTURE:
        raise SmokeSkip("set CAN_ENGINE_CAPTURE to a replay file for the `file` source")

    config = {
        "role": "desktop",
        "bus": {"type": "inproc", "capacity": 4096},
        "sources": [{"type": "file", "name": "replay", "path": CAPTURE}],
    }
    handle = can_engine.EngineHandle(config)
    handle.load_mdc(MDC_PROJECT.read_text())
    return handle


def _drain_for_items(handle, deadline_s: float = 5.0):
    deadline = time.monotonic() + deadline_s
    while time.monotonic() < deadline:
        batch = handle.poll_batch(timeout_ms=500)
        if batch:
            return batch
    return None


def run() -> None:
    try:
        import can_engine  # noqa: PLC0415 — optional, may not be built
    except ImportError as exc:
        raise SmokeSkip(f"can_engine module not built: {exc}") from exc

    assert MDC_PROJECT.exists(), f"missing MDC project: {MDC_PROJECT}"

    handle = _build_handle(can_engine)
    handle.start()
    try:
        status = handle.status()
        assert status["running"] is True
        assert status["mdc_loaded"] is True

        batch = _drain_for_items(handle)
        assert batch, "poll_batch returned no decoded items within the deadline"

        item = batch[0]
        for key in ("timestamp_ns", "can_id_hex", "signals", "units"):
            assert key in item, f"decoded item missing key {key!r}: {item}"
        assert isinstance(item["signals"], dict)
        print(f"OK: decoded {len(batch)} item(s); first = {json.dumps(item)[:200]}")
    finally:
        handle.stop()
        assert handle.status()["running"] is False


# pytest entry point.
def test_smoke():
    try:
        run()
    except SmokeSkip as skip:
        import pytest  # noqa: PLC0415

        pytest.skip(str(skip))


if __name__ == "__main__":
    try:
        run()
    except SmokeSkip as skip:
        print(f"SKIP: {skip}")
        sys.exit(0)
    print("PASS")
