# AI Agent 入口

本文件是所有 AI 编码工具的通用入口（工具中立）。

## 驻场联络

本项目正在接受 main-ui 项目组驻场联络（v0.6.0 世代联合改造）。

- 驻场办公区：`docs/main-ui-liaison/`（任务书 + 台账）
- 主记录：`../main-ui/docs/HOST_JOINT_RETROFIT_0.6.0.md`
- 集成指南：`../main-ui/docs/HOST_INTEGRATION_GUIDE.md`

## 项目概况

- 名称：matheshop（数学画布宿主，工程轨前端）
- 技术栈：flow-graph-kit-vue + katex + viewport-2d-kit + Electron
- main-ui 依赖：^0.6.0
- 构建：`tsc -b && vite build`
- 后端依赖：MathEngine（`/Users/ethan/CoreFiles/ProjectsFile/MathEngine`）是统一数学后端。内嵌引擎 `engine/SymbolicComputationEngine`（Python）与 `engine/engine_ts`（TS）已标记 deprecated，迁移方向为调用 MathEngine API（`mathengine/symbolic` 重写 + `mathengine/proof` 校验）。前端纪律：只消费 Presentation-AST 子集（cell.content + frozen 标记 + 占位符 id），不触碰 E-graph 内部；详见 `docs/DEVELOPER_GUIDE.md` 第 8 节。
- 双轨上下文：本项目属工程轨（MVP）。学术轨（λ-E-graph、证明证书、形式证明融合）在 EntelechySystem/math_engine_research，不在本项目排期。命名消歧：MathEngine=工程后端仓库；数学引擎/ME=跨两轨概念；matheshop=前端画布仓库。
