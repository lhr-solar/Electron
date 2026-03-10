"""Resolve vehicle names and DBC paths across Embedded-Sharepoint and local DBC dir.
Vehicle names are matched case-insensitively with leading/trailing trim.
Embedded-Sharepoint spelling is preferred for display.
"""
import os


def _project_root():
    return os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))


def get_embedded_dbc_dir():
    return os.path.join(_project_root(), "Embedded-Sharepoint", "can", "dbc")


def _normalize(name: str) -> str:
    return name.strip().lower()


def get_vehicle_folders(local_dbc_dir: str):
    """Return (display_by_normalized, embedded_actual_by_normalized, local_actual_by_normalized).
    Display name prefers Embedded-Sharepoint spelling. Keys are normalized (strip + lower).
    """
    embedded_dir = get_embedded_dbc_dir()
    display = {}
    embedded_actual = {}
    local_actual = {}
    if os.path.isdir(embedded_dir):
        for d in os.listdir(embedded_dir):
            path = os.path.join(embedded_dir, d)
            if os.path.isdir(path) and not d.startswith("."):
                n = _normalize(d)
                display[n] = d.strip()
                embedded_actual[n] = d
    if os.path.isdir(local_dbc_dir):
        for d in os.listdir(local_dbc_dir):
            path = os.path.join(local_dbc_dir, d)
            if os.path.isdir(path) and not d.startswith("."):
                n = _normalize(d)
                if n not in display:
                    display[n] = d.strip()
                local_actual[n] = d
    return display, embedded_actual, local_actual


def resolve_vehicle(vehicle: str, local_dbc_dir: str):
    """Resolve vehicle name (any casing/whitespace) to (display_name, embedded_dir_name, local_dir_name).
    Dir names are actual folder names on disk; None if that source has no folder for this vehicle.
    """
    n = _normalize(vehicle)
    display, embedded_actual, local_actual = get_vehicle_folders(local_dbc_dir)
    if n not in display:
        return None, None, None
    return display[n], embedded_actual.get(n), local_actual.get(n)


def resolve_dbc_paths(vehicle: str, dbc_files: list, local_dbc_dir: str):
    """Resolve vehicle + list of DBC filenames to full file paths.
    For each file, uses embedded path if present, else local path.
    Returns list of paths (may include missing files; CANManager will report missing).
    """
    _, emb_actual, loc_actual = resolve_vehicle(vehicle, local_dbc_dir)
    embedded_dir = get_embedded_dbc_dir()
    paths = []
    for f in dbc_files:
        f = (f or "").strip()
        if not f:
            continue
        if not f.lower().endswith(".dbc"):
            f = f + ".dbc"
        # Prefer embedded, then local
        chosen = None
        if emb_actual is not None:
            emb_path = os.path.join(embedded_dir, emb_actual, f)
            if os.path.isfile(emb_path):
                chosen = emb_path
        if chosen is None and loc_actual is not None:
            loc_path = os.path.join(local_dbc_dir, loc_actual, f)
            if os.path.isfile(loc_path):
                chosen = loc_path
        if chosen is None:
            # Keep one path for error reporting (prefer local path if we have a folder)
            if loc_actual is not None:
                chosen = os.path.join(local_dbc_dir, loc_actual, f)
            elif emb_actual is not None:
                chosen = os.path.join(embedded_dir, emb_actual, f)
            else:
                chosen = os.path.join(local_dbc_dir, vehicle.strip(), f)
        paths.append(chosen)
    return paths
