#!/usr/bin/env python3
import argparse
import os
import platform
import shutil
import subprocess
import sys
import zipfile
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
ENTRYPOINT = ROOT / "server" / "entrypoint.py"
DIST_DIR = ROOT / "dist"
BUILD_DIR = ROOT / "build"
ARTIFACT_DIR = ROOT / "artifacts" / "backend"
RELEASE_DIR = ROOT / "artifacts" / "release"
BIN_NAME = "telemetry-backend"


def _normalize_arch(raw: str) -> str:
    normalized = raw.lower()
    aliases = {
        "amd64": "x64",
        "x86_64": "x64",
        "arm64": "arm64",
        "aarch64": "arm64",
    }
    return aliases.get(normalized, normalized)


def _platform_tag() -> str:
    system_map = {
        "darwin": "macos",
        "windows": "windows",
        "linux": "linux",
    }
    sys_name = platform.system().lower()
    os_name = system_map.get(sys_name, sys_name)
    arch = _normalize_arch(platform.machine())
    return f"{os_name}-{arch}"


def _default_release_name() -> str:
    for env_key in ("RELEASE_VERSION", "GITHUB_REF_NAME"):
        value = os.environ.get(env_key, "").strip()
        if value:
            return value
    return "dev"


def _build_pyinstaller_binary():
    try:
        import PyInstaller  # noqa: F401
    except ImportError as exc:  # pragma: no cover
        raise SystemExit(
            "PyInstaller is required. Install with:\n"
            "  python -m pip install pyinstaller"
        ) from exc

    data_sep = ";" if os.name == "nt" else ":"
    add_data_arg = f"Embedded-Sharepoint{data_sep}Embedded-Sharepoint"

    cmd = [
        sys.executable,
        "-m",
        "PyInstaller",
        "--noconfirm",
        "--clean",
        "--onefile",
        "--name",
        BIN_NAME,
        "--add-data",
        add_data_arg,
        "--collect-submodules",
        "server",
        "--collect-submodules",
        "socketio",
        "--collect-submodules",
        "engineio",
        "--collect-submodules",
        "uvicorn",
        str(ENTRYPOINT),
    ]

    subprocess.run(cmd, cwd=ROOT, check=True)

    exe_name = BIN_NAME + (".exe" if os.name == "nt" else "")
    return DIST_DIR / exe_name


def _zip_release_asset(binary_path: Path, release_name: str, platform_tag: str) -> Path:
    base_name = f"electron-grafana-backend-{release_name}-{platform_tag}"
    release_target_dir = RELEASE_DIR / release_name
    release_target_dir.mkdir(parents=True, exist_ok=True)
    zip_path = release_target_dir / f"{base_name}.zip"

    with zipfile.ZipFile(zip_path, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        archive.write(binary_path, arcname=binary_path.name)
    return zip_path


def main():
    parser = argparse.ArgumentParser(description="Build backend executable and release artifact.")
    parser.add_argument(
        "--release-name",
        default=_default_release_name(),
        help="Release/version label included in artifact filenames (default: env RELEASE_VERSION/GITHUB_REF_NAME/dev).",
    )
    args = parser.parse_args()

    release_name = args.release_name.strip().replace("/", "-")
    if not release_name:
        raise SystemExit("Release name cannot be empty.")

    platform_tag = _platform_tag()
    built_bin = _build_pyinstaller_binary()
    target_dir = ARTIFACT_DIR / platform_tag
    target_dir.mkdir(parents=True, exist_ok=True)
    copied_binary = target_dir / built_bin.name
    shutil.copy2(built_bin, copied_binary)
    release_zip = _zip_release_asset(copied_binary, release_name, platform_tag)

    print(f"Built backend executable: {built_bin}")
    print(f"Copied artifact: {copied_binary}")
    print(f"Release asset: {release_zip}")
    print("Share this binary and run it directly on the target OS.")

    # Optional cleanup of pyinstaller temp output.
    if BUILD_DIR.exists():
        shutil.rmtree(BUILD_DIR)


if __name__ == "__main__":
    main()
