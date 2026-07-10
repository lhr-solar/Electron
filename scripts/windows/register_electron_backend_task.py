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
    # Ensure absolute paths match this checkout
    xml = xml.replace("C:\\Users\\Parthiv\\Electron-v2", str(ROOT))
    # Write UTF-16 LE with BOM for schtasks
    with tempfile.NamedTemporaryFile(suffix=".xml", delete=False) as tmp:
        tmp_path = Path(tmp.name)
    tmp_path.write_text(xml, encoding="utf-16")

    subprocess.call(["schtasks", "/Delete", "/TN", TASK, "/F"], shell=False)
    # Also remove one-shot log wrapper if present
    subprocess.call(["schtasks", "/Delete", "/TN", "ElectronBackendLog", "/F"], shell=False)

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
        # Fallback without XML (InteractiveToken may need /RU)
        cmd = [
            "schtasks",
            "/Create",
            "/TN",
            TASK,
            "/TR",
            f'"{BAT}"',
            "/SC",
            "ONSTART",
            "/RL",
            "HIGHEST",
            "/F",
        ]
        r2 = subprocess.run(cmd, shell=False, capture_output=True, text=True, errors="ignore")
        print(r2.stdout)
        print(r2.stderr, file=sys.stderr)
        if r2.returncode != 0:
            return r2.returncode

    if args.run_now:
        subprocess.call(["schtasks", "/Run", "/TN", TASK], shell=False)
    subprocess.call(["schtasks", "/Query", "/TN", TASK, "/V", "/FO", "LIST"], shell=False)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
