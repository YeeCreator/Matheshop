# SymbolicComputationEngineServer (matheshop_engine_server)

这是 Matheshop 的 **内置 Python 引擎 HTTP 服务层**（FastAPI）。

- 核心计算库：`../SymbolicComputationEngine`（Python 包名：`symcalc`）
- HTTP 服务模块名：`matheshop_engine_server`

## Windows PowerShell 开发运行

```powershell
cd engine\SymbolicComputationEngineServer
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
$env:PORT = 8000
.\.venv\Scripts\python.exe -m matheshop_engine_server
```

健康检查：

```powershell
Invoke-RestMethod http://127.0.0.1:8000/health
```

冒烟测试：

```powershell
.\.venv\Scripts\python.exe scripts\smoke_test.py
```

