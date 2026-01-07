# engine
> 说明：前端开发时 Vite 仍通过 `/api/engine/*` 代理到后端；这与后端代码目录名无关。

- `engine_ts/`：TypeScript 版本自研计算引擎（占位，后续实现）
- `SymbolicComputationEngine/`：Python 纯计算核心库（包名：`symcalc`）
- `SymbolicComputationEngineServer/`：Python HTTP 服务层（FastAPI，模块名：`matheshop_engine_server`）

本目录用于收纳不同实现的“计算引擎”。
