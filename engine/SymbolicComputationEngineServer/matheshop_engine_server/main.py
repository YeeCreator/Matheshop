from __future__ import annotations

import logging
import os
import sys
import time
from pathlib import Path
from typing import Any, Dict

from fastapi import FastAPI
from pydantic import BaseModel, Field

DEFAULT_ENGINE_ROOT = Path(os.environ.get(
    "MATHSYMCALC_ENGINE_ROOT",
    "C:/Users/Ethan/CoreFiles/ProjectsFile/MathSymbolicComputationEngine",
)).resolve()

if DEFAULT_ENGINE_ROOT.exists():
    sys.path.insert(0, str(DEFAULT_ENGINE_ROOT))

from mathsymcalc.symbolic_engine import SymbolicEngine


def eval_text(text: str) -> float:
    """使用外部 MathSymbolicComputationEngine 对纯数值表达式求值。"""

    engine = SymbolicEngine(prewarm_lexicon=False)
    expr = engine.parse(text)
    simplified = engine.simplify(expr)
    return float(engine.evaluate(simplified, {}))


def _setup_file_logging() -> None:
    # Write logs even when the terminal output is not visible.
    log_dir = Path(__file__).resolve().parent.parent / "logs"
    log_dir.mkdir(parents=True, exist_ok=True)
    log_file = log_dir / "server.log"

    # Avoid duplicate handlers if re-imported.
    root = logging.getLogger()
    if any(isinstance(h, logging.FileHandler) and getattr(h, "baseFilename", "") == str(log_file) for h in root.handlers):
        return

    root.setLevel(logging.INFO)
    fh = logging.FileHandler(log_file, encoding="utf-8")
    fh.setLevel(logging.INFO)
    fh.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(name)s: %(message)s"))
    root.addHandler(fh)


_setup_file_logging()
logger = logging.getLogger("matheshop_engine_server")


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
    return {"ok": True, "engineRoot": str(DEFAULT_ENGINE_ROOT)}


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
        logger.exception("eval failed")
        return {
            "ok": False,
            "error": {"code": "eval_error", "message": str(e)},
            "meta": {"elapsedMs": int((time.perf_counter() - start) * 1000)},
        }



def main():
    import uvicorn

    host = os.environ.get("HOST", "127.0.0.1")
    port = int(os.environ.get("PORT", "8000"))

    logger.info("starting server on http://%s:%s", host, port)

    # Route uvicorn logs into our file as well.
    uvicorn.run(
        app,
        host=host,
        port=port,
        log_level="info",
        access_log=True,
    )


if __name__ == "__main__":
    main()
