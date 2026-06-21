# CAN (desktop)

Tauri 2 shell around the React/Vite UI. In desktop mode the app spawns the
Nuitka-compiled Python backend as a **sidecar** and talks to it at
`http://127.0.0.1:8350` (WS/REST per `backend/API_CONTRACT.md`).

## Sidecar binary placement

Before `npm run tauri build`, place the Nuitka output under `src-tauri/binaries/`
using Tauri's `externalBin` naming:

```
src-tauri/binaries/backend-<target-triple>[.exe]
```

Examples:

- macOS (Apple Silicon): `backend-aarch64-apple-darwin`
- macOS (Intel): `backend-x86_64-apple-darwin`
- Linux: `backend-x86_64-unknown-linux-gnu`
- Windows: `backend-x86_64-pc-windows-msvc.exe`

The server track's Nuitka script emits this name. `tauri.conf.json` lists
`bundle.externalBin: ["binaries/backend"]`; Rust spawns it via
`sidecar("backend")`. Tauri appends the host triple when resolving the file.

## Installers

`bundle.targets` produces per-OS installers on the build host:

| OS | Formats |
|----|---------|
| macOS | `.app`, `.dmg` |
| Windows | `.msi`, NSIS `.exe` |
| Linux | `.deb`, `.AppImage` |

```sh
npm install
npm run tauri build    # needs Rust toolchain + sidecar binary above
```

Frontend-only build (no Rust/sidecar required):

```sh
npm run build
```
