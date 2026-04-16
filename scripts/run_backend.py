#!/usr/bin/env python3
import argparse
import os
import subprocess
import sys


def main():
    parser = argparse.ArgumentParser(description="Run FastAPI backend.")
    parser.add_argument("--host", default=os.environ.get("HOST", "0.0.0.0"))
    parser.add_argument("--port", default=os.environ.get("PORT", "4000"))
    parser.add_argument("--reload", action="store_true", help="Enable auto-reload (development).")
    args = parser.parse_args()

    env = os.environ.copy()
    if args.reload and "SERVE_STATIC_CLIENT" not in env:
        env["SERVE_STATIC_CLIENT"] = "0"

    cmd = [
        sys.executable,
        "-m",
        "uvicorn",
        "server.app:asgi_app",
        "--host",
        str(args.host),
        "--port",
        str(args.port),
    ]
    if args.reload:
        cmd.append("--reload")

    subprocess.run(cmd, check=True, env=env)


if __name__ == "__main__":
    main()
