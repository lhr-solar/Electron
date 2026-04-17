# Telemetry UI / CAN Parsing

This repository contains:

- Python backend (`FastAPI` + `Socket.IO`) in `server/`
- React + Vite frontend in `client/`
- Optional Grafana/Influx stack in `grafana/`

## Prerequisites

- Python 3.10+
- Node.js 18+
- Docker + Docker Compose (for Grafana/Influx)

## Quick Start (Dev)

### macOS / Linux

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r server/requirements.txt
npm --prefix client install
npm run dev
```

### Windows (PowerShell)

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r server/requirements.txt
npm --prefix client install
npm run dev
```

`npm run dev` starts both backend (`:4000`) and frontend (`:3001`) using `scripts/dev.py`.

## Individual Dev Commands

- Backend only: `npm run dev:backend`
- Frontend only: `npm run dev:frontend`

## Start Grafana + InfluxDB

```bash
cd grafana
docker compose up -d
docker compose restart grafana
cd ..
```

## Production-Like Backend Run

### macOS / Linux

```bash
python3 scripts/run_backend.py --host 0.0.0.0 --port 4000
```

### Windows

```powershell
python .\scripts\run_backend.py --host 0.0.0.0 --port 4000
```

## Build Frontend (Website Artifact)

```bash
npm run build:frontend
```

Output: `client/dist/` (deploy this folder to your website host).

### Auto-deploy to GitHub Pages

This repo includes `.github/workflows/deploy-frontend-pages.yml` to build and deploy the frontend automatically.

- Trigger: push to `main` (or manual workflow dispatch)
- Deploy target: GitHub Pages
- Build base path: `/<repo-name>/` (project pages compatible)

Set these **Repository Variables** (optional but recommended) before deploying:

- `VITE_API_BASE_URL` (public backend API URL)
- `VITE_SOCKET_URL` (public Socket.IO URL, optional)
- `VITE_BACKEND_DOWNLOAD_URL` (URL for backend executable download button)

GitHub settings needed:

- `Settings -> Pages -> Source`: **GitHub Actions**

### Frontend Environment

Copy `client/.env.example` to `client/.env` (or set vars in CI):

- `VITE_API_BASE_URL`: backend API base URL (for hosted frontend)
- `VITE_SOCKET_URL`: optional Socket.IO URL override
- `VITE_BACKEND_DOWNLOAD_URL`: executable download URL shown when backend is offline

## Build Backend Executable (Python Backend Only)

Backend executable packaging is provided by `PyInstaller` and intentionally excludes the frontend.

Install PyInstaller once:

```bash
python -m pip install pyinstaller
```

Build:

```bash
npm run build:backend
```

Outputs:

- raw build: `dist/telemetry-backend` (or `.exe` on Windows)
- distributable copy: `artifacts/backend/<platform-arch>/`
- GitHub-release asset zip: `artifacts/release/<release-name>/electron-grafana-backend-<release-name>-<platform-arch>.zip`

Build on each target OS you need (Windows binary must be built on Windows; macOS binary on macOS).

### Build macOS + Windows together

Local cross-compiling is not supported by PyInstaller. To build both at once, use GitHub Actions:

1. Create/publish a GitHub Release (tag like `v1.2.0`) **or** run workflow dispatch.
2. Workflow `.github/workflows/release-backend.yml` builds on `macos-latest` and `windows-latest` in parallel.
3. On release events, both `.zip` files are uploaded automatically as release assets.
4. Windows builds are usually slower than macOS (PyInstaller analysis); workflow enables pip caching to reduce setup time.

You can also build a named local release package:

```bash
node scripts/run-python.js scripts/build_backend.py --release-name v1.2.0
```

## Data Paths (Dev vs Executable)

In normal source/dev mode, defaults remain project-local:

- `dbc/`
- `logs/`
- `.trash/`

In packaged executable mode, defaults move to a user workspace:

- Windows: `~/Documents/Electron`
- macOS: `~/Documents/Electron`
- Linux: `~/Documents/Electron`

On first run the backend bootstraps this folder and logs setup progress in terminal:

- creates `dbc/`, `logs/`, `.trash/`
- initializes `Embedded-Sharepoint/`
  - copies bundled data when present
  - or clones from `EMBEDDED_SHAREPOINT_GIT_URL` when configured
  - or falls back to an empty scaffold with error logs

You can override with:

- `APP_DATA_DIR`
- `DBC_DIR`
- `LOG_DIR`
- `TRASH_DIR`
- `ELECTRON_HOME`
- `FORCE_USER_WORKSPACE`
- `EMBEDDED_SHAREPOINT_DIR`
- `EMBEDDED_SHAREPOINT_GIT_URL`

## Backend / Frontend Deployment Pattern

- Deploy `client/dist` to your website host.
- Or use GitHub Actions Pages deployment workflow for automatic frontend deploys.
- Distribute backend executable separately (downloads/releases/internal portal).
- Set `VITE_BACKEND_DOWNLOAD_URL` in frontend deployment.
- When frontend cannot connect to backend, UI shows a **Download backend** button.

## Access (Local)

- Frontend dev UI: `http://localhost:3001`
- Backend API/socket: `http://localhost:4000`
- Grafana: `http://localhost:3000`
- InfluxDB: `http://localhost:8086`

## Optional Backend Runtime Vars

- `SERVE_STATIC_CLIENT=1|0`: backend serves `client/dist` when available
- `CORS_ORIGINS`: comma-separated HTTP CORS origins (default `*`)
- `SOCKET_CORS_ORIGINS`: comma-separated Socket.IO origins (default falls back to `CORS_ORIGINS`)

