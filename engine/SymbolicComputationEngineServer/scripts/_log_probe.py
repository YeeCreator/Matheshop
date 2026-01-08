from __future__ import annotations

from pathlib import Path

# Import should trigger file logger initialization.
import matheshop_engine_server.main as _  # noqa: F401

log_file = Path(__file__).resolve().parent.parent / "logs" / "server.log"
print("log_file:", log_file)
print("exists:", log_file.exists())
if log_file.exists():
    print("--- tail ---")
    print(log_file.read_text(encoding="utf-8", errors="replace")[-2000:])

