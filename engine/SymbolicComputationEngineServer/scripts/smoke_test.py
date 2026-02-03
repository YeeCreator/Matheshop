from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.request


def request_json(url: str, method: str = "GET", body: dict | None = None) -> dict:
    data = None
    headers = {"accept": "application/json"}
    if body is not None:
        data = json.dumps(body).encode("utf-8")
        headers["content-type"] = "application/json"

    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    with urllib.request.urlopen(req, timeout=3) as resp:
        raw = resp.read().decode("utf-8", errors="replace")
        return json.loads(raw)


def main() -> int:
    base = os.environ.get("ENGINE_BASE_URL", "http://127.0.0.1:8000")
    base = base.rstrip("/")

    print("[smoke] base:", base)

    try:
        health = request_json(f"{base}/health")
    except urllib.error.URLError as e:
        print("[smoke] ERROR: failed to connect to engine server")
        print("[smoke] url:", f"{base}/health")
        print("[smoke] error:", repr(e))
        print()
        print("Troubleshooting:")
        print("1) Ensure the server is running:")
        print("   cd engine\\SymbolicComputationEngineServer")
        print("   .\\.venv\\Scripts\\python.exe -m matheshop_engine_server")
        print("2) Ensure PORT matches (default 8000).")
        print("3) Check the log file:")
        print("   engine\\SymbolicComputationEngineServer\\logs\\server.log")
        return 2

    print("[smoke] /health ->", health)

    out = request_json(f"{base}/v1/eval", method="POST", body={"text": "1+2*(3^2)"})
    print("[smoke] /v1/eval ->", out)

    assert health.get("ok") is True
    assert out.get("ok") is True
    assert abs(out["result"]["value"] - 19) < 1e-9

    print("[smoke] PASS")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
