# 开发日志（Development Log）

> 规则：每次新增功能/改动/修复错误，在校验与完工时把变动追加到本日志，并同步更新相关开发者文档/用户文档/README（如适用）。

## 2026-01-01

### 文档体系补齐

- 新增 `docs/PRD.md`：产品需求文档（目标、范围、验收标准、里程碑）
- 新增 `docs/USER_MANUAL.md`：产品用户手册（操作与快捷键说明）
- 新增 `docs/DEVELOPMENT_LOG.md`：开发日志（本文件）
- 更新根 `README.md`：补充文档索引（PRD/用户手册/开发者手册/开发日志）
- 更新 `docs/DEVELOPER_GUIDE.md`：补充文档约定与维护规则、文档入口

## 2026-01-02

### Electron Desktop 支持

- 新增 Electron 相关脚本与配置
- 更新 README 增加 Electron 部分内容
- 新增 docs/ELECTRON_MANUAL.md 文档说明
- 更新 docs/DEVELOPER_GUIDE.md，增加 Electron 开发调试说明

## 2026-01-07

### Python 引擎工程重构：核心库与服务层拆分

- 将原 `engine/engine_python` 重构为：
  - `engine/SymbolicComputationEngine`：纯符号/算术计算核心库（Python 包名：`symcalc`）
  - `engine/SymbolicComputationEngineServer`：HTTP 服务层（FastAPI，模块名仍为 `matheshop_engine_server`）
- 核心库移除 FastAPI/uvicorn/pydantic 依赖，服务层通过 `-e ../SymbolicComputationEngine` 引用核心库
- 同步更新开发者文档与用户手册中的路径、venv 建议与启动命令
