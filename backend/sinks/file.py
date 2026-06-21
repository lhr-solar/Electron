"""File sink — append decoded messages to a JSONL (default) or CSV file.
The blocking file write is offloaded with `asyncio.to_thread`.
"""
from __future__ import annotations

import asyncio
import csv
import io
import json
import logging
from pathlib import Path

from . import _HealthyMixin

logger = logging.getLogger(__name__)

_CSV_COLUMNS = [
    "timestamp_ns",
    "can_id_hex",
    "message_name",
    "sender",
    "network",
    "vehicle",
    "array_index",
    "signals",
    "raw_packet",
]


class FileSink(_HealthyMixin):
    def __init__(self, spec: dict):
        self._path = spec["path"]
        self._format = spec.get("format", "jsonl")
        self._wrote_header = False
        Path(self._path).parent.mkdir(parents=True, exist_ok=True)
        self._file = open(self._path, "a", encoding="utf-8", newline="")

    def _render(self, batch: list[dict]) -> str:
        if self._format == "csv":
            buf = io.StringIO()
            writer = csv.DictWriter(buf, fieldnames=_CSV_COLUMNS, extrasaction="ignore")
            if not self._wrote_header:
                writer.writeheader()
                self._wrote_header = True
            for m in batch:
                row = {k: m.get(k) for k in _CSV_COLUMNS}
                row["signals"] = json.dumps(m.get("signals", {}))
                writer.writerow(row)
            return buf.getvalue()
        return "".join(json.dumps(m) + "\n" for m in batch)

    def _append(self, text: str) -> None:
        self._file.write(text)

    async def write_batch(self, batch: list[dict]) -> None:
        if not batch:
            return
        try:
            await asyncio.to_thread(self._append, self._render(batch))
            self._healthy = True
        except Exception:
            self._healthy = False
            logger.debug("FileSink write failed", exc_info=True)

    async def close(self) -> None:
        if self._file is not None:
            self._file.close()
            self._file = None
