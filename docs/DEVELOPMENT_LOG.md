# 开发日志（Development Log）

> 规则：每次新增功能/改动/修复错误，在校验与完工时把变动追加到本日志，并同步更新相关开发者文档/用户文档/README（如适用）。

## 2026-05-14

### 架构迁移：全栈切换到 Vue3 + TypeScript core

- 移除旧 React 编译入口与历史 React 组件树，入口统一为 `src/main.ts` + `src/App.vue`。
- 使用 `main-ui/vue` 提供工作台壳层，注册 Matheshop 画布 editor 与设置 editor。
- 使用 `viewport-2d-kit/vue` 和 `viewport-2d-kit/core` 统一处理二维视口渲染与 screen/world 坐标换算。
- 新增 `src/core/` 作为框架无关 TypeScript core，负责画布快照、Cell/Edge、编辑、移动、缩放、连线与求值。
- 新增 `src/vue/` 渲染层，Vue 组件只订阅 core 快照并转发用户事件。
- 前端默认计算引擎改为 `builtin_python`，后端服务通过 `MATHSYMCALC_ENGINE_ROOT` 对接外部 `C:/Users/Ethan/CoreFiles/ProjectsFile/MathSymbolicComputationEngine`。
- 移除 Python 服务 requirements 中对外部引擎的 editable 安装要求，改为运行时路径注入，避免外部 flat-layout 仓库被 setuptools 自动发现阻塞安装。
- 刷新 `package.json` 与 `pnpm-lock.yaml`：保留 `vue`、`main-ui`、`viewport-2d-kit`、`katex`，移除旧 React/Radix/TanStack 等直接依赖。
- 校验：`pnpm build` 通过；生产预览 `http://127.0.0.1:4173/` 显示 `main-ui Vue3 workbench` 与 Vue 画布；Python 服务入口调用 `eval_text('1+2*3')` 返回 `7.0`。

## 2026-05-02

### 修复：同步 main-ui 独立拆分后的宿主接入口径

- 移除运行代码对旧 React 壳层包导出的依赖，新增 `src/managed/workbench-shell/reactLayout.tsx` 作为 Matheshop 宿主侧 React 过渡壳层。
- 将视口依赖与源码导入统一为 `viewport-2d-kit`，不再使用旧视口包别名。
- 刷新 `package.json` 与 `pnpm-lock.yaml`，补齐 `main-ui`、`viewport-2d-kit`、`vue` 与 `@vitejs/plugin-vue` 依赖。
- 校验：`pnpm lint`、`pnpm build`、`pnpm test` 通过；内置浏览器确认首屏渲染出工具栏、画布与 Inspector。

## 2026-03-05

### 坐标迁移：相关适配工具全量迁移到 `viewport-2d-kit`

- 将 `matheshop` 本地的坐标与相机适配实现迁移到 `viewport-2d-kit`：
  - 新增 `viewport-2d-kit/src/coordinateAdapters.ts`
  - 在 `viewport-2d-kit/src/index.ts` 统一导出 `clientToLocalCssPoint/localCssToWorld/worldToLocalCssWithScroll/camera2DToLegacy/legacyToCamera2D/getDprScaleFromCanvas` 等函数。
- `matheshop` 侧改造：
  - `CanvasBoard.tsx`、`CanvasCellLayer.tsx`、`CanvasCell.tsx`、`CanvasCellPorts.tsx`、`CanvasCellResizeHandle.tsx`、`FormulaLayer.tsx`、`EdgeLayer.tsx` 全部切换为从 `viewport-2d-kit` 导入坐标与适配工具。
  - 删除本地重复实现：`src/components/canvas/utils/viewportCoords.ts`、`src/components/canvas/utils/viewportKitAdapter.ts`。
  - `src/components/canvas/utils/geometry.ts` 精简为仅保留 `clamp` 与 `resizeCanvasToDisplaySize`。
- 兼容性与验证：
  - `pnpm run predev` 通过（含 `viewport-2d-kit` 与宿主侧过渡壳层依赖刷新）。
  - `pnpm build` 通过。
  - `pnpm run dev:with-dependent` 可启动并成功拉起 Vite（`http://localhost:5173/`）。

### 安全修复：升级 Rollup 以修复路径穿越导致的任意文件写入风险（CVE-2026-27606）

- 背景：GitHub Dependabot 告警指出依赖树中存在 `rollup 4.54.0`，受影响范围为 `>=4.0.0,<4.59.0`，风险类型为路径穿越（CWE-22）导致的任意文件写入。
- 处理：执行 `pnpm up rollup@^4.59.0 -D`，刷新锁文件后依赖树已解析到 `rollup 4.59.0`。
- 结果：`pnpm-lock.yaml` 中不再出现 `4.54.0`，并显示 `rollup: 4.59.0`。
- 校验：通过 `pnpm build` 与 `pnpm test`（1 个测试文件、7 个用例全部通过）。
- 说明：本次为依赖安全升级，不涉及业务逻辑改动。

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

### 前端重构：Cell 组件类型收敛（去 any）（2026-01-10）

- 将 token 渲染相关类型对齐到引擎解析器输出：
  - `CanvasCellLayer/CanvasCell/CanvasCellBody` 统一使用 `engine/engine_ts` 导出的 `Token[]` 作为 `arithTokens` 类型。
- 移除 `CanvasCellLayer` 中的 `setActiveInlineEditor as any` 强转（改为直接传递严格类型）。
- `CanvasCellBody` 移除 `tokens={arithTokens as any}` 与 `(arithTokens as any)` 切片写法，改为强类型切片/拼接。
- 校验：通过 `pnpm build`、`pnpm typecheck`。

### 前端重构：Group Header/折叠按钮组件化（2026-01-10）

- 新增 `src/components/canvas/cells/CanvasCellHeader.tsx`
  - 负责 cell header UI（标题/深度/折叠按钮）。
  - 折叠按钮仅做事件转发（`onToggleCollapse`），不直接操作 `setCells`。
- `CanvasCell.tsx` 改为使用 `CanvasCellHeader` 渲染 header，并在 group 时传递 `onToggleCollapse(cellId)`。
- `CanvasCellLayer.tsx` 负责实现折叠状态写入：通过 `updateCellById` 切换 `cell.collapsed`，并 `scheduleRender()`。
- 校验：通过 `pnpm build`、`pnpm typecheck`。

### 前端重构：Cell 进一步解耦（views/hooks/renderModel/utils）（2026-01-10）

- 抽离 body 子视图：
  - `src/components/canvas/cells/CanvasCellTokenView.tsx`（薄封装 ExprTokenView）
  - `src/components/canvas/cells/CanvasCellInlineEditor.tsx`（薄封装 InlineExprEditor）
  - `src/components/canvas/cells/CanvasCellBlockView.tsx`（blocks HTML 渲染封装）
  - `CanvasCellBody.tsx` 改为组合以上 view，减少内联 JSX 体积。
- 抽离 Layer 的内容解析为纯函数：
  - `src/components/canvas/cells/getCellRenderModel.ts`（blocks 渲染 + arith token 判定/解析）
  - `CanvasCellLayer.tsx` 只负责定位/递归/props 组装。
- 新增 token/inline editor 相关小工具：
  - `src/components/canvas/cells/cellSelectionUtils.ts`
- 抽离其它 UI 组件（用于样式隔离/后续扩展）：
  - `src/components/canvas/cells/CanvasCellChildren.tsx`
  - `src/components/canvas/cells/CanvasCellSelectionOutline.tsx`（当前由 CSS 驱动，组件预留）
  - `src/components/canvas/cells/CanvasCellDropHint.tsx`（当前由 CSS 驱动，组件预留）
  - `CanvasCell.tsx` 改为组合以上组件。
- 新增交互 hooks（薄封装/过渡层，后续会逐步迁移 CanvasBoard 的状态机逻辑）：
  - `src/components/canvas/cells/hooks/useCellDrag.ts`
  - `src/components/canvas/cells/hooks/useCellEditing.ts`
  - `src/components/canvas/cells/hooks/useEdgeDrag.ts`
- 文档：更新 `docs/DEVELOPER_GUIDE.md` 2.4.1 章节，列出完整模块清单与职责。
- 校验：通过 `pnpm lint`、`pnpm typecheck`、`pnpm build`。

### 修复：双击新建节点位置错误 + 触控板双指手势（2026-01-10）

- 修复“双击空白处新建节点总在画布左上角”的问题：
  - 根节点创建时 `worldPos` 应代表 **中心点 world**（`world`），而不是左上角；左上角偏移由 `localPos = world - size/2` 表达。
  - 位置相关逻辑在 `src/components/CanvasBoard.tsx` 的 `handleDoubleClick()`。
- 调整触控板双指/滚轮手势：
  - 默认 `wheel` -> **平移画布（camera 移动）**，使用 `deltaX/deltaY`。
  - 仅 `Ctrl/⌘ + wheel` 才执行 **缩放**（以指针位置为中心）；保留 `Shift + wheel` 横向平移。
  - 统一在 `canvas-wrap` 的原生 `wheel` 监听器中处理（`passive:false`）。
- 文档：更新 `docs/DEVELOPER_GUIDE.md` 增加 2.4.2，明确坐标语义与手势约定。

### 修复：双击新建仍落在视口左上角 + DEV HUD 默认关闭（2026-01-10）

- 修复坐标换算链路：
  - `getScreenFromWrap()` 之前错误地用 `wrapRect.width/height` 直接映射到 canvas 像素，
    但实际画布结构是 **wrap 视口 + 超大 workspace(8000x8000)**。
  - 现改为：先把 `clientX/Y` 换算到 workspace CSS 坐标（含 `wrap.scrollLeft/Top`），
    再以 `canvas.getBoundingClientRect()`（≈ workspace CSS 尺寸）映射到 `canvas.width/height`（含 DPR）。
  - 影响范围：双击创建、拖拽、命中、框选等所有基于 `getScreenFromWrap()` 的交互坐标。
- 清理误留的调试 UI：
  - DEV HUD 默认不渲染，仅在 `localStorage['matheshop:devHud']==='1'` 时显示。
  - HUD 内提供“一键关闭”按钮。
- 文档：更新 `docs/DEVELOPER_GUIDE.md` 4.0.2/4.4，说明坐标换算与 HUD 开关约定。

### 修复：双击新建节点仍落在视口左上角（坐标系与 cell-layer 定位不一致）（2026-01-10）

- 根因：`CanvasCellLayer` 的 cell DOM 定位使用了 **wrapRect(视口) 的 CSS 尺寸** 进行 screen(px)→css 的换算，
  而 `CanvasBoard.handleDoubleClick()` 之前使用了 `getScreenFromWrap()` 得到 canvas 像素 screen 再 `screenToWorld()`，
  两条路径在 workspace(8000x8000)+wrap(视口) 的结构下会出现坐标压缩不一致。
- 修复：双击创建时改为直接：
  - `clientX/Y` → workspace 内 `xCss/yCss`（含 `wrap.scrollLeft/Top`）
  - `world = css/zoom + cam.x/y`
  使创建坐标与 cell-layer 的 CSS 定位策略保持一致。
- 校验：通过 `pnpm lint`、`pnpm test`、`pnpm build`。

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

## 2026-01-11

### 坐标体系重构：统一到摄影机视口（camera screen px）坐标合同（2026-01-11）

- 目标：所有渲染层/交互层统一遵循同一套坐标合同：
  - `clientX/Y` → `screen(px)`（基于 wrap.scroll + canvasRect）
  - `world ↔ screen(px)` 只通过 `screenToWorld/worldToScreen` + `camera{x,y,zoom}`
  - `screen(px)` → DOM `css` 使用 **canvasRect（workspace CSS 尺寸）** 映射，并减去 `wrap.scrollLeft/Top` 得到视口内定位。
- 变更点：
  - `CanvasCellLayer.tsx`：world→screen→workspaceCSS（canvasRect），并减去 wrap scroll。
  - `EdgeLayer.tsx`：同上，连线不再跟随视口尺寸压缩。
  - `FormulaLayer.tsx`：同上；拖拽起点坐标也改为 wrap+canvasRect 的 client→screen。
  - `CanvasBoard.tsx`：双击新建节点回归使用标准 `getScreenFromWrap()` + `screenToWorld()`。
- 校验：通过 `pnpm lint`、`pnpm test`、`pnpm build`。

### 修复：双击新建节点中心点偏移 + Resize 缩放漂移（2026-01-11）

- 双击新建节点：
  - 修复体验偏移：新建节点时不再自动移动 camera（之前会造成“节点中心不等于双击点”的视觉错位感）。
- Resize 缩放：
  - 修复 resize handle 起点坐标：`CanvasCellResizeHandle` 之前使用 `getCanvasScreenPoint()`，会忽略 wrap 的 scroll/workspace 结构，导致缩放时 worldΔ 错误。
  - 现改为与 `CanvasBoard.getScreenFromWrap()` 同源的 client→workspaceCSS→canvasPx(screen) 换算，再 `screenToWorld()`。
  - 缩放模式调整为更直觉的“锚定左上角、右下角随指针变化”，不再使用中心缩放（*2）逻辑。
- 校验：通过 `pnpm lint`、`pnpm test`、`pnpm build`。

### 调整：Resize 改回中心缩放（2026-01-11）

- 按需求将 resize 从“锚定左上角”改回 **中心缩放**：
  - `nextSize = startSize + worldΔ * 2`
  - 并通过 `localPos -= Δsize/2` 保持节点 center(world) 不变。
- 坐标漂移口径：中心缩放是否漂移取决于 `startWorld` 是否正确；当前 `CanvasCellResizeHandle` 已使用 wrap+scroll 的 client→screen(px) 换算（不再忽略 scroll），因此应消除 resize 时的坐标漂移。
- 校验：通过 `pnpm lint`、`pnpm test`、`pnpm build`。

## 2026-01-14

### 前端修复：画布交互去重与收敛

- 修复 `src/components/CanvasBoard.tsx` 因历史渐进迁移产生的重复声明/声明顺序问题。
- 统一由 `CanvasBoard` 落地交互副作用（selection box、hover port、ensure edge、camera、pointer capture、cell move/resize、history）。
- 文档：更新 `docs/DEVELOPER_GUIDE.md`，补充画布交互的职责边界说明。

## 2026-01-15

- 修复：双击新建节点后若未输入内容就点击空白处，节点会被当作“空内容提交”而删除，导致“刚创建就消失”。现在空内容提交只退出编辑态并保留节点。
- 修复/改进：节点 resize 采用 world 中心锚定，resize 更新直接设置 `localPos`（避免 delta 叠加漂移），并在 cell 更新后重算 `worldPos`（`recomputeWorldAll`）保持渲染与命中一致。

## 2026-01-16

### 回滚：画布交互统一回到 CanvasBoard 本地状态维护

- 画布交互不再依赖外部原型/架构实验，统一由 `src/components/CanvasBoard.tsx` 内的本地 `useRef/useState` 接管。
- 文档：更新 `docs/DEVELOPER_GUIDE.md`，补充“Canvas 交互由 CanvasBoard 直接管理（2026-01-16）”。

#### 验收/校验

- 自动化：`pnpm test` 通过。
- 手工建议回归（重点交互）：
  - wheel 平移 / Ctrl/⌘ + wheel 缩放
  - 中键/空格+拖拽 平移
  - 空白处框选（松手后 selectionBox 消失且 multiSelectedIds 更新）
  - cell 拖拽（按住-移动阈值后开始拖拽，松手释放 pointer capture）
  - cell resize（拖拽右下角手柄，Shift 锁比）
  - 连线拖拽（松手创建连接并写入历史）

## 2026-02-04

- 主界面 UI 壳迁移：`matheshop` 开始复用工作区本地 UI 壳层（`MatchFrame` + `Toolbar`），替换原有的顶部工具条与左右侧栏布局实现。
- 约束：中间 2D 视口 `CanvasBoard` 组件与其事件/数据流保持不变，仅调整外层承载结构。
- 工程：在 `matheshop/package.json` 增加本地 UI 壳层依赖。

## 2026-02-04（补充）

- 主界面 UI 进一步收敛到宿主侧布局壳层：
  - `MatchFrame` 侧栏容器支持 `padding/background/bordered` 参数化，侧栏外观不再依赖 `matheshop/styles.css` 的 `.sidebar`。
  - `Panel` 提供统一的面板（分组块）外观，`matheshop` 右侧栏的 Inspector/图层/历史以 `Panel` 组织。

## 2026-02-05

- 重构：视口/相机系统迁移到本地第三方工具包 `viewport-2d-kit`。
  - `CanvasBoard.tsx` 使用 `useViewportCamera()` 作为权威相机来源。
  - 通过通用坐标适配工具保持与 legacy `Camera{x,y,zoom}` 的兼容，确保 `EdgeLayer/CanvasCellLayer/FormulaLayer` 行为不变。
  - wheel 平移、Ctrl/⌘+wheel 缩放（光标锚点）、pinch 缩放等行为保持与迁移前一致。

## 2026-03-05

### 修复：空白画布时网格不随视口平移/缩放（world-space 网格可见范围计算错误）

- 现象：当画布中没有任何节点时，执行平移/缩放会看到业务节点参考缺失，且网格看起来不跟随视口变化，易误判为视口失效。
- 根因：`src/components/CanvasBoard.tsx` 的网格可见范围计算使用了 workspace/canvas 尺寸语义，和当前可视口（`wrap`）不一致，导致网格绘制锚定范围与实际观察窗口脱节。
- 修复：网格仍保持在 world 空间绘制，不迁移到 `viewport-2d-kit` 的独立绘制层；仅将 `getVisibleWorldBox` 的尺寸输入改为 `wrap.getBoundingClientRect()`，保证网格按当前可视口计算并随 camera 变化。
- 验证：执行 `pnpm -C C:\Users\Ethan\CoreFiles\ProjectsFile\matheshop build` 通过（`tsc -b && vite build`），无编译错误。
