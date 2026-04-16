#!/usr/bin/env python3
import argparse
import os
import signal
import subprocess
import sys
import time


def _npm_bin():
    return "npm.cmd" if os.name == "nt" else "npm"


def _terminate(proc: subprocess.Popen):
    if proc.poll() is not None:
        return
    if os.name == "nt":
        proc.send_signal(signal.CTRL_BREAK_EVENT)
        return
    proc.terminate()


def main():
    parser = argparse.ArgumentParser(description="Run backend + Vite frontend in dev mode.")
    parser.add_argument("--backend-port", default="4000")
    parser.add_argument("--frontend-port", default="3001")
    args = parser.parse_args()

    env = os.environ.copy()
    env.setdefault("PORT", str(args.backend_port))
    env.setdefault("SERVE_STATIC_CLIENT", "0")

    backend_cmd = [sys.executable, "scripts/run_backend.py", "--reload", "--port", str(args.backend_port)]
    frontend_cmd = [_npm_bin(), "run", "dev", "--", "--port", str(args.frontend_port)]

    creationflags = 0
    if os.name == "nt":
        creationflags = subprocess.CREATE_NEW_PROCESS_GROUP  # type: ignore[attr-defined]

    backend = subprocess.Popen(backend_cmd, env=env, creationflags=creationflags)
    frontend = subprocess.Popen(frontend_cmd, cwd="client", creationflags=creationflags)

    print(f"Backend:  http://localhost:{args.backend_port}")
    print(f"Frontend: http://localhost:{args.frontend_port}")
    print("Press Ctrl+C to stop both.")

    try:
        while True:
            if backend.poll() is not None:
                raise RuntimeError("Backend exited.")
            if frontend.poll() is not None:
                raise RuntimeError("Frontend exited.")
            time.sleep(0.5)
    except KeyboardInterrupt:
        pass
    finally:
        _terminate(backend)
        _terminate(frontend)
        for proc in (backend, frontend):
            try:
                proc.wait(timeout=5)
            except subprocess.TimeoutExpired:
                proc.kill()


if __name__ == "__main__":
    main()
