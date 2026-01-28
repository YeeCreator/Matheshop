# Matheshop — Copilot 编码指引

## 架构速览
- 前端是 Vite + React + TypeScript 的画布应用，入口在 src/App.tsx，核心交互聚合在 src/components/CanvasBoard.tsx。
- 画布渲染按层拆分：src/components/canvas/ 下的 EdgeLayer、FormulaLayer、CanvasCellLayer 负责不同可视对象；几何与坐标换算在 src/components/canvas/utils/geometry.ts。
- 领域模型集中在 src/components/cellTypes.ts，Cell/Edge/Port/Blocks 等类型在此定义。
- 计算引擎采用“前端路由 + 多实现”策略：
  - 统一入口：src/engine/engineClient.ts
  - 内置 TS 引擎：engine/engine_ts/src/index.ts（浏览器端，无需后端）
  - 内置 Python 引擎：src/engine/pythonEngineClient.ts → /api/engine/v1/eval（默认）
  - Python 计算核心：engine/SymbolicComputationEngine（包名 symcalc）
  - Python HTTP 服务：engine/SymbolicComputationEngineServer（FastAPI）
- Electron 桌面端入口在 electron/main.cjs 与 electron/preload.cjs；桌面端开发直接加载 Vite dev server。

## 关键交互与数据流
- 引擎选择持久化在 localStorage（key：matheshop:engineSelection:v1），并通过窗口事件广播：
  - App.tsx 触发 matheshop:engineSelection
  - CanvasBoard.tsx 监听并缓存到 ref
- Inspector 面板与画布通信通过 window 事件（matheshop:inspector、matheshop:inspector:apply/cancel/draft）。
- 画布坐标链路：client → workspace CSS → canvas screen(px, DPR) → world；细节见 CanvasBoard.tsx 头部注释。

## 开发与调试（Windows/PowerShell）
- 前端开发：pnpm install；pnpm dev（默认 http://localhost:5173）
- 前端构建：pnpm build；pnpm preview
- 桌面端开发：pnpm desktop:dev（同时启动 Vite + Electron）
- 桌面端打包：pnpm desktop:dist（产物在 dist-desktop/）
- Python 引擎服务（FastAPI）：
  - cd engine\SymbolicComputationEngineServer
  - python -m venv .venv
  - .\.venv\Scripts\python.exe -m pip install -r requirements.txt
  - $env:PORT = 8000；.\.venv\Scripts\python.exe -m matheshop_engine_server
  - 健康检查：Invoke-RestMethod http://127.0.0.1:8000/health

## 开发前置要求
- 开发功能前先阅读相关文档（通常在 docs/，也可能在 documents/ 或根目录 README.md），再进行功能增删改。
- 每次增删或编辑代码/文件后，需同步更新相关文档（不包含需求文档）。

## 项目约定与示例
- Vite 环境变量用于引擎地址：VITE_ENGINE_BASE_URL（为空时走 /api/engine 代理）。
- 画布交互状态多用 ref 管理（减少无意义重渲染），例如 CanvasBoard.tsx 内的相机、拖拽状态。
- 文本内容逐步从 content 迁移为 blocks（见 cellTypes.ts 的 CellBlock/CellNode）。
- 文档与需求参考：docs/PRD.md、docs/DEVELOPER_GUIDE.md、docs/USER_MANUAL.md。

## 注释语言规范
- 新增或修改的程序文档注释与普通注释必须使用中文。
- 例外：专有名词/技术术语/代码片段、外部资源引用、历史或团队约定需保留英文（须在注释中注明原因）、多语言/国际化场景（主要内容仍为中文）、团队一致同意使用其他语言（需在项目文档说明）。

## 修改代码时优先关注的文件
- 交互核心：src/components/CanvasBoard.tsx
- 画布分层与几何：src/components/canvas/**
- 引擎路由：src/engine/engineClient.ts、src/engine/pythonEngineClient.ts
- 类型定义：src/components/cellTypes.ts
- 桌面端入口：electron/main.cjs、electron/preload.cjs
