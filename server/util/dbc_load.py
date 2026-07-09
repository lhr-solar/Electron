"""Shared cantools DBC loading with UTF-8 unit strings."""

from __future__ import annotations

import logging
import os
from pathlib import Path

import cantools

logger = logging.getLogger(__name__)

# DBC files in this repo store degree/etc as UTF-8. cantools defaults to cp1252,
# which turns "°C" into the mojibake "Â°C".
DBC_ENCODING = "utf-8"


def load_dbc_file(path: str | os.PathLike[str], *, strict: bool = True):
    """Load a DBC with UTF-8 encoding so unit symbols stay intact."""
    return cantools.database.load_file(str(path), encoding=DBC_ENCODING, strict=strict)


def add_dbc_file(db: cantools.database.Database, path: str | os.PathLike[str]) -> None:
    """Add a DBC into an existing Database using UTF-8 encoding."""
    db.add_dbc_file(str(path), encoding=DBC_ENCODING)


def normalize_unit(unit: str | None) -> str | None:
    """Repair common UTF-8-as-cp1252 mojibake in unit strings."""
    if not unit:
        return unit
    text = str(unit)
    if "Â" in text or "Ã" in text:
        try:
            repaired = text.encode("latin-1").decode("utf-8")
            return repaired
        except (UnicodeEncodeError, UnicodeDecodeError):
            pass
    return text
