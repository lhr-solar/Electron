"""Engine binding boundary.

The real engine is the C++ `can_engine` nanobind module compiled alongside this
backend. It may not exist in every environment (CI, this sandbox, a dev box
without the native build), so the import is guarded: when `can_engine` is
absent we fall back to `FakeEngine`, a tiny replay engine that emits a sample
`live_message_batch` so the backend boots and the smoke tests run.

To swap in the real engine: build/install the `can_engine` module so that
`import can_engine` succeeds. No other change is needed — `make_engine()` picks
the native module automatically.

Binding API (both real and fake honor it):
  EngineHandle(config: dict)
  .start() / .stop()
  .poll_batch(timeout_ms: int) -> list[dict] | None   # live_message_batch payload
  .status() -> dict                                    # status payload fields
  .load_mdc(spec: dict) -> None
"""
from __future__ import annotations

import itertools
import json
import logging
import time
from pathlib import Path
from typing import Protocol, runtime_checkable

from .paths import can_root

logger = logging.getLogger(__name__)


def _mdc_example_path() -> Path:
    return can_root() / "vehicles" / "lhr-ev1" / "project.mdc.json"


@runtime_checkable
class EngineProtocol(Protocol):
    """Structural contract every engine implementation satisfies."""

    def start(self) -> None: ...
    def stop(self) -> None: ...
    def poll_batch(self, timeout_ms: int) -> list[dict] | None: ...
    def status(self) -> dict: ...
    def load_mdc(self, spec: dict) -> None: ...


class FakeEngine:
    """Replay engine used when `can_engine` is unavailable.

    Emits a small, contract-shaped `live_message_batch` on each poll so the WS
    fan-out, sinks, and tests have real data to chew on without the native module.
    ponytail: fixed two-message loop, not a real replay of a recording — enough
    to exercise the pipeline. Upgrade path: read frames from a recording file.
    """

    def __init__(self, config: dict):
        self._config = config or {}
        self._running = False
        self._vehicle = "lhr-ev1"
        self._counter = itertools.count()
        self._mdc_loaded = self._try_load_example_mdc()

    def _try_load_example_mdc(self) -> bool:
        path = _mdc_example_path()
        try:
            spec = json.loads(path.read_text())
            self._vehicle = spec.get("name", self._vehicle)
            return True
        except (OSError, ValueError):
            logger.warning("FakeEngine: could not read example MDC at %s", path)
            return False

    def start(self) -> None:
        self._running = True

    def stop(self) -> None:
        self._running = False

    def load_mdc(self, spec: dict) -> None:
        self._vehicle = spec.get("name", self._vehicle)
        self._mdc_loaded = True

    def poll_batch(self, timeout_ms: int) -> list[dict] | None:
        if not self._running:
            return None
        time.sleep(min(timeout_ms, 100) / 1000.0)
        n = next(self._counter)
        now = time.time_ns()
        return [
            {
                "timestamp_ns": now,
                "raw_packet": f"t1A48{n & 0xFF:02X}380F1C2",
                "can_id_hex": "0x1A4",
                "message_name": "BMS_Status",
                "sender": "BMS",
                "network": "powertrain",
                "vehicle": self._vehicle,
                "signals": {"PackVoltage": 398.0 + (n % 10) * 0.1, "State": "Active"},
                "units": {"PackVoltage": "V"},
            },
            {
                "timestamp_ns": now,
                "raw_packet": f"t2003{n & 0xFF:02X}00",
                "can_id_hex": "0x200",
                "message_name": "VehicleSpeed",
                "sender": "VCU",
                "network": "chassis",
                "vehicle": self._vehicle,
                "signals": {"Speed": float(n % 120)},
                "units": {"Speed": "km/h"},
            },
        ]

    def status(self) -> dict:
        return {
            "parser_status": "running" if self._running else "idle",
            "parser_connection_state": self._running or None,
            "error_message": None,
            "dbc_errors": [] if self._mdc_loaded else ["example MDC not found"],
            "vehicle": self._vehicle,
        }


def make_engine(config: dict) -> EngineProtocol:
    """Return a real `can_engine.EngineHandle` if available, else `FakeEngine`."""
    try:
        import can_engine  # noqa: PLC0415 — optional native module, intentionally lazy

        logger.info("Using native can_engine module.")
        return can_engine.EngineHandle(config)
    except ImportError:
        logger.warning("can_engine module not found — using FakeEngine replay.")
        return FakeEngine(config)


def engine_is_native() -> bool:
    try:
        import can_engine  # noqa: F401, PLC0415

        return True
    except ImportError:
        return False
