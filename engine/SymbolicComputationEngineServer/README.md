# SymbolicComputationEngineServer (matheshop_engine_server)

这是 Matheshop 的 **内置 Python 引擎 HTTP 服务层**（FastAPI）。

- 核心计算库：`C:/Users/Ethan/CoreFiles/ProjectsFile/MathSymbolicComputationEngine`（Python 包名：`mathsymcalc`）
- HTTP 服务模块名：`matheshop_engine_server`

默认会从环境变量 `MATHSYMCALC_ENGINE_ROOT` 读取外部引擎路径；未设置时使用上面的本机默认路径。

## Windows PowerShell 开发运行

```powershell
cd engine\SymbolicComputationEngineServer
uv venv --python 3.13
uv pip install --python .\.venv\Scripts\python.exe --index-url https://pypi.org/simple -r requirements.txt
$env:MATHSYMCALC_ENGINE_ROOT = 'C:/Users/Ethan/CoreFiles/ProjectsFile/MathSymbolicComputationEngine'
$env:PORT = 8000
.\.venv\Scripts\python.exe -m matheshop_engine_server
```

说明：外部引擎仓库通过 `MATHSYMCALC_ENGINE_ROOT` 注入 `sys.path`，不在本服务的 requirements 中做 editable 安装。

健康检查：

```powershell
Invoke-RestMethod http://127.0.0.1:8000/health
```

冒烟测试：

```powershell
.\.venv\Scripts\python.exe scripts\smoke_test.py
```

