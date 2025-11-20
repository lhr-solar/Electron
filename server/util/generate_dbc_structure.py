import cantools
from pathlib import Path
import re
from collections import defaultdict

DBC_FILE = "../../dbc/Daybreak-Daybreak-Telemetry.dbc"
OUTPUT_PY = "../dbc_structure.py"


def sanitize_identifier(name: str) -> str:
    """
    Removes characters not allowed in Python identifiers and replaces
    Unicode/smart characters with ASCII-safe ones.
    """
    name = name.replace("–", "-").replace("—", "-")
    name = name.replace("’", "'").replace("“", '"').replace("”", '"')
    name = name.replace(" ", "_").replace("-", "_")
    name = re.sub(r'[^0-9a-zA-Z_]', "", name)
    if name and name[0].isdigit():
        name = "_" + name
    return name


HEADER = '''"""
AUTO-GENERATED FILE — DO NOT EDIT
UTF-8 SAFE OUTPUT
Provides IDE-autocomplete for ECUs, Messages, and Signals.
"""
\n
'''


def main():
    db = cantools.database.load_file(DBC_FILE)
    lines = [HEADER]
    
    ecu_messages = defaultdict(list)
    for msg in db.messages:
        if msg.senders:
            ecu_name = sanitize_identifier(msg.senders[0])
            ecu_messages[ecu_name].append(msg)

    # --- ECU classes ---
    for ecu in db.nodes:
        ecu_clean = sanitize_identifier(ecu.name)
        lines.append(f"class {ecu_clean}:\n")
        
        # Add a list of message IDs sent by this ECU
        sent_ids = [m.frame_id for m in ecu_messages[ecu_clean]]
        lines.append(f"    SEND_IDS = {sorted(sent_ids)}\n")
        lines.append("    pass\n\n")

    # --- Messages ---
    for msg in db.messages:
        msg_class = sanitize_identifier(msg.name)
        ecu_name = sanitize_identifier(msg.senders[0]) if msg.senders else None

        lines.append(f"class {msg_class}:\n")
        lines.append(f"    ID = {msg.frame_id}\n")
        lines.append(f"    LENGTH = {msg.length}\n")

        if ecu_name:
            lines.append(f"    ECU = '{ecu_name}'\n")

        # Signals
        lines.append("    class Signals:\n")
        if not msg.signals:
            lines.append("        pass\n")
        else:
            for sig in msg.signals:
                clean_sig = sanitize_identifier(sig.name)
                lines.append(f"        {clean_sig} = '{sig.name}'\n") # Keep original name for dict keys
        lines.append("\n")

        # Attach message to ECU namespace
        if ecu_name:
            lines.append(f"{ecu_name}.{msg_class} = {msg_class}\n\n")

    Path(OUTPUT_PY).write_text("".join(lines), encoding="utf-8")
    print(f"[OK] Generated UTF-8 clean {OUTPUT_PY}.")


if __name__ == "__main__":
    main()
