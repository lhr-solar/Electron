#!/usr/bin/env python3
import subprocess
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
CLIENT_DIR = ROOT / "client"


def main():
    subprocess.run(["npm", "install"], cwd=CLIENT_DIR, check=True)
    subprocess.run(["npm", "run", "build"], cwd=CLIENT_DIR, check=True)
    print(f"Frontend build output: {CLIENT_DIR / 'dist'}")


if __name__ == "__main__":
    main()
