#!/usr/bin/env python3

import cantools
from pathlib import Path
import re
from collections import defaultdict
import os

# The directory containing the source DBC files.
DBC_SOURCE_DIR = Path(__file__).parent.parent.parent.joinpath("dbc").resolve()
# The directory where cached DBC python modules will be stored.
CACHE_DIR = Path(__file__).parent.parent.joinpath("dbc_structure_generated").resolve()

def sanitize_identifier(name: str) -> str:
    """Cleans a string to be a valid Python identifier."""
    name = re.sub(r'[^a-zA-Z0-9_]', '_', name)
    if name and name[0].isdigit():
        name = "_" + name
    return name

def generate_cache(dbc_path: str) -> str:
    """
    Parses a single DBC file and generates a Python module containing its structure.
    Returns the sanitized module name.
    """
    db = cantools.database.load_file(dbc_path)
    
    dbc_filename = Path(dbc_path).stem
    module_name = sanitize_identifier(dbc_filename)
    output_path = CACHE_DIR.joinpath(f"{module_name}.py")
    
    lines = [
        '"""AUTO-GENERATED FILE — DO NOT EDIT"""\n',
        '# -*- coding: utf-8 -*-\n'
    ]
    
    ecu_messages = defaultdict(list)
    for msg in db.messages:
        if msg.senders:
            ecu_name = sanitize_identifier(msg.senders[0])
            ecu_messages[ecu_name].append(msg)

    for ecu in db.nodes:
        ecu_clean = sanitize_identifier(ecu.name)
        lines.append(f"class {ecu_clean}:\n")
        sent_ids = sorted([m.frame_id for m in ecu_messages[ecu_clean]])
        lines.append(f"    SEND_IDS = {sent_ids}\n")
        lines.append("    pass\n")

    for msg in db.messages:
        msg_class = sanitize_identifier(msg.name)
        ecu_name = sanitize_identifier(msg.senders[0]) if msg.senders else None

        lines.append(f"class {msg_class}:\n")
        lines.append(f"    ID = {msg.frame_id}\n")
        
        is_array_msg = False
        idx_signal = None
        if "array" in msg.name.lower() or "arr" in msg.name.lower():
            found_idx = [s for s in msg.signals if "idx" in s.name.lower() or "index" in s.name.lower()]
            if len(found_idx) == 1:
                is_array_msg = True
                idx_signal = found_idx[0]
        
        lines.append(f"    IS_ARRAY_MESSAGE = {is_array_msg}\n")
        if is_array_msg:
            lines.append(f"    INDEX_SIGNAL_KEY = '{idx_signal.name}'\n")
            data_keys = [s.name for s in msg.signals if s.name != idx_signal.name]
            lines.append(f"    DATA_SIGNAL_KEYS = {data_keys}\n")

        if ecu_name:
            lines.append(f"    ECU = '{ecu_name}'\n")
            lines.append(f"{ecu_name}.{msg_class} = {msg_class}\n")

    output_path.write_text("\n".join(lines), encoding="utf-8")
    print(f"[Cache] Generated cache for '{dbc_filename}' -> {module_name}.py")
    return module_name

def main():
    """
    Clears the cache directory, then finds all .dbc files in the source
    directory and generates a cached Python module and a manifest file.
    """
    # 1. Clear the cache directory
    if os.path.exists(CACHE_DIR):
        print(f"Clearing cache directory: {CACHE_DIR}")
        for file in os.listdir(CACHE_DIR):
            if file.endswith(".py"):
                os.remove(os.path.join(CACHE_DIR, file))
    
    os.makedirs(CACHE_DIR, exist_ok=True)

    # 2. Scan for DBC files
    print(f"Scanning for DBC files in: {DBC_SOURCE_DIR}")
    dbc_files = list(DBC_SOURCE_DIR.glob("*.dbc"))
    
    if not dbc_files:
        print("No .dbc files found. Nothing to do.")
        # Still create an empty __init__.py
        Path(CACHE_DIR, "__init__.py").touch()
        return

    # 3. Generate cache for each file
    cached_modules = []
    for dbc_file in dbc_files:
        try:
            module_name = generate_cache(dbc_file)
            cached_modules.append(module_name)
        except Exception as e:
            print(f"Failed to generate cache for {dbc_file}. Error: {e}")
    
    # 4. Generate the __init__.py manifest file
    init_path = Path(CACHE_DIR, "__init__.py")
    manifest_content = [
        '"""AUTO-GENERATED FILE — DO NOT EDIT"""\n',
        '# This file serves as a manifest of the cached DBC modules.\n',
        f'AVAILABLE_DBCS = {sorted(cached_modules)}\n'
    ]
    init_path.write_text("\n".join(manifest_content), encoding="utf-8")
    print(f"Generated manifest file: {init_path}")
    
    print("\nCaching process complete.")

if __name__ == "__main__":
    main()
