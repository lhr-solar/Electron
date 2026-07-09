"""Resolve vehicle names and DBC paths from Embedded-Sharepoint only."""
import os


def _project_root():
    return os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))


def get_embedded_dbc_dir():
    from_env = os.environ.get("EMBEDDED_DBC_DIR", "").strip()
    if from_env:
        return from_env
    return os.path.join(_project_root(), "Embedded-Sharepoint", "can", "dbc")


def _normalize(name: str) -> str:
    return name.strip().lower()


def get_vehicle_folders(_local_dbc_dir: str = ""):
    """Return (display_by_normalized, embedded_actual_by_normalized, local_actual_by_normalized).

    local_actual is always empty — DBCs come from Embedded-Sharepoint only.
    `_local_dbc_dir` kept for call-site compatibility.
    """
    embedded_dir = get_embedded_dbc_dir()
    display = {}
    embedded_actual = {}
    if os.path.isdir(embedded_dir):
        for d in os.listdir(embedded_dir):
            path = os.path.join(embedded_dir, d)
            if os.path.isdir(path) and not d.startswith("."):
                n = _normalize(d)
                display[n] = d.strip()
                embedded_actual[n] = d
    return display, embedded_actual, {}


def resolve_vehicle(vehicle: str, _local_dbc_dir: str = ""):
    """Resolve vehicle name to (display_name, embedded_dir_name, local_dir_name)."""
    n = _normalize(vehicle)
    display, embedded_actual, local_actual = get_vehicle_folders()
    if n not in display:
        return None, None, None
    return display[n], embedded_actual.get(n), local_actual.get(n)


def resolve_dbc_paths(vehicle: str, dbc_files: list, _local_dbc_dir: str = ""):
    """Resolve vehicle + DBC filenames to Embedded-Sharepoint paths."""
    _, emb_actual, _ = resolve_vehicle(vehicle)
    embedded_dir = get_embedded_dbc_dir()
    paths = []
    for f in dbc_files:
        f = (f or "").strip()
        if not f:
            continue
        if not f.lower().endswith(".dbc"):
            f = f + ".dbc"
        if emb_actual is not None:
            paths.append(os.path.join(embedded_dir, emb_actual, f))
        else:
            paths.append(os.path.join(embedded_dir, vehicle.strip(), f))
    return paths


def resolve_all_dbc_paths(vehicle: str, dbc_files: list | None, _local_dbc_dir: str = "") -> list[str]:
    """All DBC paths for a vehicle from Embedded-Sharepoint."""
    files = [f for f in (dbc_files or []) if str(f).strip()]
    if files:
        return [p for p in resolve_dbc_paths(vehicle, files) if os.path.isfile(p)]
    _, emb_actual, _ = resolve_vehicle(vehicle)
    embedded_dir = get_embedded_dbc_dir()
    if not emb_actual:
        return []
    base = os.path.join(embedded_dir, emb_actual)
    if not os.path.isdir(base):
        return []
    return [
        os.path.join(base, name)
        for name in sorted(os.listdir(base))
        if name.lower().endswith(".dbc") and os.path.isfile(os.path.join(base, name))
    ]
