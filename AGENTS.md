# AI Agent 入口

本文件是所有 AI 编码工具的通用入口（工具中立）。

## 驻场联络

本项目正在接受 main-ui 项目组驻场联络（v0.6.0 世代联合改造）。

- 驻场办公区：`docs/main-ui-liaison/`（任务书 + 台账）
- 主记录：`../main-ui/docs/HOST_JOINT_RETROFIT_0.6.0.md`
- 集成指南：`../main-ui/docs/HOST_INTEGRATION_GUIDE.md`

## 项目概况

- 名称：matheshop（数学画布宿主，工程轨前端）
- 技术栈：@main-ui/core 渲染基座 + @main-ui/view-canvas 画布舞台 + katex + Electron（flow-graph-kit-vue 与 viewport-2d-kit 已于 2026-10-07 移除；本地画布壳 MatheshopCanvasSurface 已于 2026-10-15 退役，改用官方 view-canvas 薄适配层 src/components/canvas/MatheshopBoardStage.vue）
- main-ui 依赖：^0.6.0
- 构建：`tsc -b && vite build`
- 后端依赖：MathEngine（`../MathEngine`）是统一数学后端。内嵌引擎 `engine/SymbolicComputationEngine`（Python）与 `engine/engine_ts`（TS）已标记 deprecated，迁移方向为调用 MathEngine API（`mathengine/symbolic` 重写 + `mathengine/proof` 校验）。前端纪律：只消费 Presentation-AST 子集（cell.content + frozen 标记 + 占位符 id），不触碰 E-graph 内部；详见 `docs/DEVELOPER_GUIDE.md` 第 8 节。
- 双轨上下文：本项目属工程轨（MVP）。学术轨（λ-E-graph、证明证书、形式证明融合）在 EntelechySystem/EntelechySystem/MathEngineResearch，不在本项目排期。命名消歧：MathEngine=工程后端仓库；数学引擎/ME=跨两轨概念；matheshop=前端画布仓库。

## 双轨导航（仓库 ↔ 笔记，磁盘实际路径）

| 轨道 | 仓库 | 笔记目录（磁盘实际名） |
|---|---|---|
| 工程轨·前端（本项目） | `./`（本项目） | `Engs_notebook/Projects/数学工坊`（统一工程笔记，含前端+后端） |
| 工程轨·后端 | `../MathEngine` | `Engs_notebook/Projects/数学工坊`（同上） |
| 学术轨·研究 | `EntelechySystem/EntelechySystem/MathEngineResearch`（宿主仓库 `../EntelechySystem`） | `Math_notebook/Projects/数学引擎`（学术探索笔记） |

> 笔记根：Engs=`<笔记库>/Engs_notebook`，ES=`<笔记库>/ES_notebook`。工程笔记目录名为**数学工坊**（早期文档误记 Matheshop，磁盘无此目录）；学术笔记目录名为**数学引擎**。完整命名消歧表见 `../MathEngine/AGENTS.md`。
