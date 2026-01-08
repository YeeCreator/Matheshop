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

## 2026-01-08

### Python 引擎工程重构：核心库与服务层拆分 + 可观测性增强

- 将原 `engine/engine_python` 重构为：
  - `engine/SymbolicComputationEngine`：纯符号/算术计算核心库（Python 包名：`symcalc`）
  - `engine/SymbolicComputationEngineServer`：HTTP 服务层（FastAPI，模块名仍为 `matheshop_engine_server`）
- 核心库移除 FastAPI/uvicorn/pydantic 依赖；服务层通过 `-e ../SymbolicComputationEngine` 引用核心库
- 为服务层增加本地日志文件：`engine/SymbolicComputationEngineServer/logs/server.log`（即使终端输出异常也可定位启动/运行问题）
- 新增一键启动脚本：`engine/SymbolicComputationEngineServer/Start-Server.ps1`
- 增强 smoke test 的错误提示：连接失败时给出端口/启动命令/log 路径排查指引

### 文档补齐：如何在 UI 中演示“求值/符号计算”

- 更新 `docs/USER_MANUAL.md`：补充画布中创建 cell、输入表达式并用 Ctrl/⌘+Enter 触发求值的演示步骤
- 更新 `docs/DEVELOPER_GUIDE.md`：补充如何通过 Network/Console 排查 `/api/engine/v1/eval` 调用失败
