// Desktop shell: spawn the Python backend binary as a Tauri sidecar so the React
// UI can talk to it over ws://127.0.0.1. The Nuitka-built backend bundles the
// C++ `can_engine` module and serves the REST/WS API (FastAPI). The UI is a pure
// WS/REST client — this file only manages the process lifecycle.

use tauri::Manager;
use tauri_plugin_shell::process::CommandChild;
use tauri_plugin_shell::ShellExt;

#[derive(Default)]
struct BackendProcess(std::sync::Mutex<Option<CommandChild>>);

fn can_home_dir(app: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    let home = app
        .path()
        .home_dir()
        .map_err(|e| format!("home_dir failed: {e}"))?;
    let dir = home.join(".electron");
    std::fs::create_dir_all(&dir).map_err(|e| format!("mkdir .electron failed: {e}"))?;
    Ok(dir)
}

fn spawn_backend(app: &tauri::AppHandle) -> Result<(), String> {
    // "backend" matches bundle.externalBin "binaries/backend"; Tauri appends the
    // platform target triple to resolve the actual binary.
    let can_home = can_home_dir(app)?;
    let sidecar = app
        .shell()
        .sidecar("backend")
        .map_err(|e| format!("sidecar lookup failed: {e}"))?
        .env("CAN_HOME", can_home.to_string_lossy().to_string());
    let (_rx, child) = sidecar
        .spawn()
        .map_err(|e| format!("backend spawn failed: {e}"))?;
    if let Some(state) = app.try_state::<BackendProcess>() {
        *state.0.lock().unwrap() = Some(child);
    }
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .manage(BackendProcess::default())
        .setup(|app| {
            // Don't crash the UI if the backend isn't bundled yet (e.g. dev before
            // the backend track ships a binary); log and continue.
            if let Err(e) = spawn_backend(&app.handle()) {
                eprintln!("[shell] backend not started: {e}");
            }
            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::Destroyed = event {
                if let Some(state) = window.app_handle().try_state::<BackendProcess>() {
                    if let Some(child) = state.0.lock().unwrap().take() {
                        let _ = child.kill();
                    }
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
