#!/usr/bin/env python3
"""Register ElectronBackend scheduled task for boot/logon autostart."""

from __future__ import annotations

import argparse
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
BAT = ROOT / "scripts" / "windows" / "start-electron-boot.bat"
XML_SRC = ROOT / "scripts" / "windows" / "ElectronBackend.task.xml"
TASK = "ElectronBackend"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--run-now", action="store_true")
    args = ap.parse_args()

    if not BAT.is_file():
        print("missing", BAT, file=sys.stderr)
        return 1

    xml = XML_SRC.read_text(encoding="utf-8")
    xml = xml.replace("C:\\Users\\Parthiv\\Electron-v2", str(ROOT))
    with tempfile.NamedTemporaryFile(suffix=".xml", delete=False) as tmp:
        tmp_path = Path(tmp.name)
    tmp_path.write_text(xml, encoding="utf-16")

    for name in (TASK, "ElectronBackendLog", "ElectronBackendBoot"):
        subprocess.call(["schtasks", "/Delete", "/TN", name, "/F"], shell=False)

    r = subprocess.run(
        ["schtasks", "/Create", "/TN", TASK, "/XML", str(tmp_path), "/F"],
        shell=False,
        capture_output=True,
        text=True,
        errors="ignore",
    )
    print(r.stdout)
    print(r.stderr, file=sys.stderr)
    tmp_path.unlink(missing_ok=True)
    if r.returncode != 0:
        print("XML create failed; trying ONLOGON fallback", file=sys.stderr)
        r2 = subprocess.run(
            [
                "schtasks",
                "/Create",
                "/TN",
                TASK,
                "/TR",
                str(BAT),
                "/SC",
                "ONLOGON",
                "/RL",
                "HIGHEST",
                "/F",
            ],
            shell=False,
            capture_output=True,
            text=True,
            errors="ignore",
        )
        print(r2.stdout)
        print(r2.stderr, file=sys.stderr)
        if r2.returncode != 0:
            return r2.returncode

    if args.run_now:
        # Don't /Run the blocking boot bat from here (would hang). Use start-backend-log.bat.
        log_bat = ROOT / "start-backend-log.bat"
        if log_bat.is_file():
            subprocess.call(
                ["schtasks", "/Create", "/TN", "ElectronBackendLog", "/TR", str(log_bat), "/SC", "ONCE", "/ST", "00:00", "/F"],
                shell=False,
            )
            subprocess.call(["schtasks", "/Run", "/TN", "ElectronBackendLog"], shell=False)
    subprocess.call(["schtasks", "/Query", "/TN", TASK, "/V", "/FO", "LIST"], shell=False)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
