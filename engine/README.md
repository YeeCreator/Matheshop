# matheshop-engine（自研符号/算术引擎）
```
{ "ok": true, "result": { "kind": "number", "value": 19 } }
```json

响应示例：

```
{ "text": "1+2*(3^2)" }
```json

请求示例：

- `POST /v1/eval`：表达式求值
- `GET /health`：健康检查

## API

默认监听：`http://127.0.0.1:8000`

```
python -m matheshop_engine_server
pip install -r requirements.txt
.\.venv\Scripts\Activate.ps1
python -m venv .venv
cd engine
```powershell

## 开发与运行（Windows PowerShell）

> 当前阶段先实现：四则运算/幂/括号/单目负号 的算术求值。

- `matheshop_engine_server`：FastAPI HTTP 服务封装（供前端调用）
- `matheshop_engine`：核心表达式 AST + 解析 + NumPy 求值（第一阶段：算术）

这是一个计划可独立抽取的 Python 包：


