"""One load path for MDC project documents on disk (folder or single file).

Mirrors Embedded-Sharepoint/can/mdc/lib/mdc-load.mjs: required project.mdc.json plus optional per-network
*.mdc.json fragments merged into networks[] by network.id.
"""
from __future__ import annotations

import json
from pathlib import Path


def _merge_network_fragment(project: dict, fragment: dict, origin: Path) -> None:
    net = fragment.get("network", fragment)
    net_id = net.get("id")
    if not net_id:
        raise ValueError(f'{origin}: network fragment has no "id"')
    for idx, existing in enumerate(project.get("networks", [])):
        if existing.get("id") == net_id:
            merged = {**net, "filename": origin.name}
            project["networks"][idx] = merged
            return
    raise ValueError(
        f'{origin}: no networks[] entry with id "{net_id}" to merge into',
    )


def load_mdc_project(project_path: str | Path) -> dict:
    """Load a project from a folder or a single project.mdc.json file.

    Raises:
        ValueError: if a network fragment has no ``id`` or no matching network entry.
    """
    path = Path(project_path)
    directory = path if path.is_dir() else path.parent
    root_file = path / "project.mdc.json" if path.is_dir() else path

    project = json.loads(root_file.read_text(encoding="utf-8"))

    if path.is_dir():
        fragments = sorted(
            f for f in directory.iterdir()
            if f.name.endswith(".mdc.json") and f.name != "project.mdc.json"
        )
        for fragment_path in fragments:
            fragment = json.loads(fragment_path.read_text(encoding="utf-8"))
            _merge_network_fragment(project, fragment, fragment_path)

    return project
