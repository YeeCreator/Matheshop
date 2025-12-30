from __future__ import annotations

import os
import time
from typing import Any, Dict

from fastapi import FastAPI
from pydantic import BaseModel, Field

from matheshop_engine import eval_text


app = FastAPI(title="matheshop-engine", version="0.1.0")


class EvalRequest(BaseModel):
    text: str = Field(..., description="表达式文本，例如 1+2*(3^2)")


class EvalResponseOk(BaseModel):
    ok: bool = True
    result: Dict[str, Any]
    meta: Dict[str, Any]


class EvalResponseErr(BaseModel):
    ok: bool = False
    error: Dict[str, Any]
    meta: Dict[str, Any]


@app.get("/health")
def health():
    return {"ok": True}


@app.post("/v1/eval", response_model=EvalResponseOk | EvalResponseErr)
def v1_eval(req: EvalRequest):
    start = time.perf_counter()
    try:
        value = eval_text(req.text)
        return {
            "ok": True,
            "result": {"kind": "number", "value": value},
            "meta": {"elapsedMs": int((time.perf_counter() - start) * 1000)},
        }
    except Exception as e:  # noqa: BLE001
        return {
            "ok": False,
            "error": {"code": "eval_error", "message": str(e)},
            "meta": {"elapsedMs": int((time.perf_counter() - start) * 1000)},
        }


def main():
    import uvicorn

    host = os.environ.get("HOST", "127.0.0.1")
    port = int(os.environ.get("PORT", "8000"))

    print(f"[matheshop-engine] starting server on http://{host}:{port}")
    uvicorn.run(app, host=host, port=port, log_level="info")


if __name__ == "__main__":
    main()
