# 开发日志（Development Log）

> 规则：每次新增功能/改动/修复错误，在校验与完工时把变动追加到本日志，并同步更新相关开发者文档/用户文档/README（如适用）。

## 2026-01-10

### 前端重构：抽离画布节点（Cell）渲染层

- 将 `src/components/CanvasBoard.tsx` 中内联的 `.cell-layer` 大段 JSX/交互搬迁为独立组件：
  - `src/components/canvas/cells/CanvasCellLayer.tsx`
- `CanvasBoard` 仍负责：camera/pan/zoom、框选、多选拖拽、连线/缩放状态机与历史记录；`CanvasCellLayer` 负责 cell DOM 渲染与 world→screen→css 定位。
- 修复构建问题：补齐 `handleCellPointerDownForDrag` 回调定义位置，确保 `pnpm build`/`pnpm typecheck` 通过。
- 更新开发者手册：新增“Canvas 画布节点（Cell）组件拆分（2026-01-10）”章节，解释为何之前看不到独立节点组件，以及后续推荐拆分方向。

### 前端重构：继续拆分 Cell 子组件（Ports/Resize/Body/Cell）（2026-01-10）

- 将 `CanvasCellLayer` 的内联渲染进一步拆分为可复用组件：
  - `src/components/canvas/cells/CanvasCell.tsx`：单个 cell 外壳（事件入口/header/children 递归入口）
  - `src/components/canvas/cells/CanvasCellBody.tsx`：body 三态分流（编辑/表达式 token/blocks）
  - `src/components/canvas/cells/CanvasCellPorts.tsx`：端口渲染与连线拖拽起点初始化
  - `src/components/canvas/cells/CanvasCellResizeHandle.tsx`：缩放手柄 pointerdown 与 `resizingCellRef`
- `CanvasCellLayer.tsx` 改为：只负责定位与递归 + 组装 props，渲染时组合 `CanvasCell`。
- 校验：通过 `pnpm build`、`pnpm typecheck`。
- 文档：同步更新 `docs/DEVELOPER_GUIDE.md` 的 2.4.1 章节列出实际组件拆分结构。

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

## 2026-01-02

### Electron Desktop 支持

- 新增 Electron 相关脚本与配置
- 更新 README 增加 Electron 部分内容
- 新增 docs/ELECTRON_MANUAL.md 文档说明
- 更新 docs/DEVELOPER_GUIDE.md，增加 Electron 开发调试说明

## 2026-01-01

### 文档体系补齐

- 新增 `docs/PRD.md`：产品需求文档（目标、范围、验收标准、里程碑）
- 新增 `docs/USER_MANUAL.md`：产品用户手册（操作与快捷键说明）
- 新增 `docs/DEVELOPMENT_LOG.md`：开发日志（本文件）
- 更新根 `README.md`：补充文档索引（PRD/用户手册/开发者手册/开发日志）
- 更新 `docs/DEVELOPER_GUIDE.md`：补充文档约定与维护规则、文档入口
