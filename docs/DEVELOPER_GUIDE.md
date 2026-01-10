# 开发者手册（Developer Guide）

本文档面向维护者，描述 Matheshop 的工程结构、核心模块边界、以及后续重构/开发的约定。

## 0. 文档与变更记录（必读）

本仓库维护以下文档（均为 Markdown）：

- 项目纵览说明（根 README）：`README.md`
- 产品需求文档（PRD）：`docs/PRD.md`
- 产品用户手册：`docs/USER_MANUAL.md`
- 开发者手册（本文）：`docs/DEVELOPER_GUIDE.md`
- 开发日志：`docs/DEVELOPMENT_LOG.md`

维护规则（强约束）：

- 每次 **新增功能/改动功能/修复错误**，在自测与校验通过后：
  1) 更新相应文档（开发者文档/用户手册/PRD/README，按需要选择）
  2) 把本次变更追加到 `docs/DEVELOPMENT_LOG.md`
- 文档更新应体现“可操作”：包含入口文件、步骤、关键约束与验收口径。

## 1. 技术栈与约定

- 构建：Vite
- UI：React 19
- 语言：TypeScript
- 包管理：pnpm
- 公式：KaTeX（`katex.renderToString` 输出 HTML）

工程脚本（见 `package.json`）：

```powershell
pnpm dev
pnpm build
pnpm preview
pnpm lint
```

> 约定：不要直接用 npm/yarn 改依赖，避免 `pnpm-lock.yaml` 漂移。

## 2. 运行与调试

### 2.1 本地开发

```powershell
pnpm install
pnpm dev
```

### 2.2 生产构建

```powershell
pnpm build
```

### 2.3 预览构建产物

```powershell
pnpm preview
```

### 2.4 调试建议

- 交互问题优先从 `src/components/CanvasBoard.tsx` 的 pointer/keyboard handler 入手。
- 坐标系相关 bug：优先检查 `src/components/canvas/utils/geometry.ts` 的 screen/world 换算，以及 CSS 尺寸（wrap 的 bounding box）。

## 2.4.1 Canvas 画布节点（Cell）组件拆分（2026-01-10）

历史上 `CanvasBoard.tsx` 内联渲染了 `.cell-layer` 的全部 DOM（因此你会“看不到画布节点组件”）。

目前 **Cell 渲染层** 已分为以下模块（从外到内 / 从逻辑到视图）：

### A. Layer（递归渲染 + 定位 + 状态回调）

- `src/components/canvas/cells/CanvasCellLayer.tsx`
  - 负责：world→screen→css 定位、递归遍历树、为每个 cell 组装渲染所需 props。
  - 负责：group 折叠状态写入（通过 `updateCellById` 切换 `collapsed`）。
  - 约定：Layer 尽量不做“内容解析/表达式判定”，应调用纯函数得到渲染模型（见 D）。

### B. Cell 外壳（Event 入口 + 组合视图）

- `src/components/canvas/cells/CanvasCell.tsx`
  - 负责：单个 cell 外壳（pointer/dblclick、选中态 class、组合 Header/Body/Ports/Resize/Children）。
  - 约定：可在这里放少量“事件分流”（如 link mode），但尽量不要让它变成另一个“CanvasBoard”。

### C. View 组件（纯 UI/事件转发，方便替换样式与复用）

- `src/components/canvas/cells/CanvasCellHeader.tsx`
  - 标题/嵌套深度/折叠按钮。
- `src/components/canvas/cells/CanvasCellPorts.tsx`
  - 端口渲染与“从端口开始拖拽连线”的起点初始化。
- `src/components/canvas/cells/CanvasCellResizeHandle.tsx`
  - 右下角缩放手柄的 pointerdown，与 `resizingCellRef` 对接。
- `src/components/canvas/cells/CanvasCellChildren.tsx`
  - children 递归渲染容器（负责 `collapsed` 时不渲染）。
- `src/components/canvas/cells/CanvasCellSelectionOutline.tsx`
  - 选中态视觉预留组件（当前样式仍由 `.cell.is-selected` 驱动，组件返回 null）。
- `src/components/canvas/cells/CanvasCellDropHint.tsx`
  - drop hint 视觉预留组件（当前样式仍由 `.cell.is-drop-hint` 驱动，组件返回 null）。

### D. Body 与编辑/表达式视图拆分

- `src/components/canvas/cells/CanvasCellBody.tsx`
  - 负责：body 三态分流（编辑 textarea / 表达式 token view + inline editor / blocks）。
  - 说明：其内部进一步组合了以下 view 组件：
- `src/components/canvas/cells/CanvasCellTokenView.tsx`
  - 表达式 token 展示（薄封装 `ExprTokenView`）。
- `src/components/canvas/cells/CanvasCellInlineEditor.tsx`
  - token 就地编辑框（薄封装 `InlineExprEditor`）。
- `src/components/canvas/cells/CanvasCellBlockView.tsx`
  - blocks HTML 渲染（封装 `dangerouslySetInnerHTML` 的区域）。

### E. 纯函数（减少 render 重复计算，便于测试）

- `src/components/canvas/cells/getCellRenderModel.ts`
  - 负责：把 cell 的 content/blocks 解析成 `htmlContent`，并判定/解析算术表达式 token（`Token[]`）。
  - `CanvasCellLayer` 只消费该渲染模型，不直接做 try/catch 解析。
- `src/components/canvas/cells/cellSelectionUtils.ts`
  - 负责：token 选中/inline editor 归属判定等小工具函数（避免散落在组件内）。

### F. Hooks（画布级交互状态机的收敛方向）

- `src/components/canvas/cells/hooks/useCellDrag.ts`
- `src/components/canvas/cells/hooks/useCellEditing.ts`
- `src/components/canvas/cells/hooks/useEdgeDrag.ts`

当前阶段这些 hooks 以“薄封装/过渡层”为主，真正的状态机仍主要在 `CanvasBoard.tsx`；后续重构目标是把拖拽/编辑/连线的分支逐步迁移到 hooks，并由 `CanvasBoard` 统一持有和调用。

折叠渲染约束（重要）：

- UI 递归渲染：`CanvasCellChildren` 只在 `!cell.collapsed` 时渲染 children。
- 命中/框选/拖拽 drop 计算：`src/components/canvas/domain/cellTree.ts` 的 `collectCellWorldHits()` 在 `node.kind === 'group' && node.collapsed` 时会停止向下遍历（确保折叠后子节点不会被命中/框选）。

`CanvasBoard` 仍保留：camera/pan/zoom、框选、多选拖拽、连线/缩放状态机（move/up）、历史记录等画布级逻辑。

> 约定：View 组件尽量保持“无状态/只转发事件”，状态更新（setCells / draggingRef 等）留在 `CanvasBoard` 或 hooks。

## 2.5 内置 Python 计算引擎（拆分：核心库 + HTTP Server）

仓库内置两套 Python 相关子工程：

- **纯计算核心库**：`engine/SymbolicComputationEngine/`（Python 包名：`symcalc`）
- **HTTP 服务层**：`engine/SymbolicComputationEngineServer/`（模块名：`matheshop_engine_server`，FastAPI，供前端通过 HTTP 调用）

> 说明：拆分后，`SymbolicComputationEngine` 只负责符号/算术计算，不再包含 FastAPI/uvicorn 等服务端依赖。

### 2.5.1 Python 环境与依赖（推荐）

推荐为 **服务器工程** 单独创建 venv：`engine/SymbolicComputationEngineServer/.venv`。

```powershell
cd engine\SymbolicComputationEngineServer
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
```

> 说明：
> - `engine/SymbolicComputationEngineServer/requirements.txt` 已包含 `fastapi/uvicorn/pydantic`，并通过 `-e ../SymbolicComputationEngine` 以可编辑方式安装核心库 `symcalc`。

### 2.5.2 启动后端服务

默认端口：`8000`。也支持通过环境变量配置端口：`PORT`。

```powershell
cd engine\SymbolicComputationEngineServer
$env:PORT = 8000
.\.venv\Scripts\python.exe -m matheshop_engine_server
```

健康检查：

```powershell
Invoke-RestMethod http://127.0.0.1:8000/health
```

### 2.5.3 后端冒烟测试（推荐）

PowerShell 对 JSON 字符串/`^` 有很多转义坑，推荐直接跑 Python 脚本验证接口：

```powershell
cd engine\SymbolicComputationEngineServer
.\.venv\Scripts\python.exe scripts\smoke_test.py
```

### 2.5.4 WebStorm 运行配置（后端）

`Run > Edit Configurations...` 新建一个 Python 运行配置：

- **Interpreter**：`engine\SymbolicComputationEngineServer\.venv\Scripts\python.exe`
- **Working directory**：`engine\SymbolicComputationEngineServer`
- **Module name**：`matheshop_engine_server`
- （可选）Environment：`PORT=8000`

> 常见问题：`8000` 被占用时，把 `PORT` 改成 `8001/8010` 等即可。

## 2.6 前后端打通（Vite proxy + fetch）

前端开发环境通过 Vite 代理将 `/api/engine` 转发到后端：

- 配置文件：`vite.config.ts`
- 默认目标：`http://127.0.0.1:8000`

启动顺序建议：

1) 先启动后端 `engine` 服务（见 2.5.2）
2) 再启动前端：

```powershell
pnpm dev
```

验证代理是否通：

```powershell
Invoke-RestMethod http://127.0.0.1:5173/api/engine/health
```

前端调用封装：`src/engine/pythonEngineClient.ts`（当你在界面里选择“内置 Python 计算引擎”时使用）

- 默认走 `/api/engine/v1/eval`（开发推荐）
- 如需直连后端（例如生产环境/非代理），可设置 `VITE_ENGINE_BASE_URL`（例如 `http://127.0.0.1:8000`）

## 2.7 单元内符号计算（隐式表达式节点，MVP）

当前阶段实现了“单元框内表达式的隐式节点渲染（token 级别）”，用于后续的符号计算与子树编辑。

- 入口组件：`src/components/canvas/ExprTokenView.tsx`
- 解析器（对外入口）：`engine/engine_ts/src/index.ts`（如 `parseArithExpr`）
- AST/Token 类型（对外入口）：`engine/engine_ts/src/index.ts`（如 `Token`）

### 2.7.1 当前支持的语法（MVP）

- 数字：整数/小数（如 `12` / `3.14`）
- 运算符：`+ - * / ^`
- 括号：`(` `)`
- 单目负号：如 `-3`、`-(1+2)`

解析失败时，单元框会自动回退到原有的 blocks/HTML 渲染。

### 2.7.2 交互（MVP）

- 单击 token：选中（高亮）该隐式节点。
- 双击 cell：仍可进入整块编辑（textarea）。
- Ctrl/⌘ + Enter：提交并调用 Python 引擎求值（结果追加显示为 `= ...`）。

### 2.7.3 下一步（建议）

- 将 token 与 AST 节点建立映射（子树级别选中，而非 token 级别）。
- 支持双击 token 进入“局部编辑框”，提交后替换 AST 子树。
- 将求值输出与原内容分离（例如 `cell.output`），避免 blocks 持续增长。

### 2.7.4 M2：局部编辑框（就地 + Inspector，MVP）

当前实现提供两种入口，它们共享同一份编辑草稿（draft）：

1. **就地编辑框**：在 cell 内双击某个 token，弹出一个小输入框覆盖在该 token 附近。
2. **右侧 Inspector**：右侧栏会显示当前选中的 cellId/选区，并可编辑同一份 draft。

#### 数据流（简化，MVP）

- `ExprTokenView` 会回传 `tokenIndex + anchorRect`。
- `CanvasBoard` 把局部编辑状态保存在 `activeInlineEditor`（包含 `cellId/selection/draft/anchorCss`）。
- 为了避免引入全局状态管理（Redux/Zustand），`CanvasBoard` 会通过 `window.dispatchEvent(CustomEvent)` 将状态广播给 `App`：
  - `matheshop:inspector`（payload：当前 activeInlineEditor/selected token）
- `InspectorPanel` 通过事件回调把修改与动作发送回 `CanvasBoard`：
  - `matheshop:inspector:draft`（更新 draft）
  - `matheshop:inspector:apply`（应用修改）
  - `matheshop:inspector:cancel`（取消）

#### 应用策略（MVP）

M2 目前采用 **tokenRange 文本替换**：

- 取被选区前面的 tokens 拼接为 `before`
- 取被选区后面的 tokens 拼接为 `after`
- 新内容：`before + draft + after`

然后写回：
- `cell.content = nextContent`
- `cell.blocks = parseBlocksFromText(nextContent)`

> 后续升级到“AST 子树替换”后，会在必要时自动补括号，避免优先级问题。

## 2.8 顶部工具条（Top Toolbar）与设置页（Settings Page）

### 2.8.1 顶部工具条

主界面顶部工具条在 `src/App.tsx` 内渲染（不引入路由库、保持单页结构）：

- 容器：`.top-toolbar`（样式在仓库根目录 `styles.css`）
- 左侧：标题 + 常用操作（例如“清空”“文本颜色”）
- 右侧：设置入口（齿轮按钮）

设计约束：

- 工具条只在主界面显示（设置页打开时隐藏），避免主界面交互层抢事件/造成认知负担。
- 工具条上的按钮尽量“无副作用、可撤销或可明确感知效果”。

### 2.8.2 设置页（独立界面）

设置页组件：`src/components/SettingsPanel.tsx`。

交互与实现要点：

- **视图切换**：`App.tsx` 用 `activeView: 'main' | 'settings'` 控制主界面/设置页的条件渲染。
- **返回主界面**：
  - 点击设置页左上角返回按钮（`←`）
  - 或按 `Esc`
- **焦点管理**：
  - 打开设置页时，设置页容器会 `focus()`（键盘用户更友好）
  - 关闭时由 `App` 把焦点还给“工具条右侧的设置按钮”（避免焦点丢失）

当前设置项（MVP）：

- “符号计算系统引擎”选择（原生 TS / Python / 外接占位）
- 变更会写入 `engineSelection` 并通过 `saveEngineSelection()` 持久化，同时广播 `matheshop:engineSelection` 事件给画布层。

> 约定：不要在设置页直接操作 CanvasBoard 的内部状态；跨模块通信依旧走 `engineSelection` + `CustomEvent` 广播。

## 2.9 Desktop App（Electron）

本项目已接入 Electron，用于将同一套前端代码同时以 Web/桌面 App 形式分发。

- Electron 入口：`electron/main.cjs`
- preload：`electron/preload.cjs`

### 2.9.1 安装依赖

```powershell
pnpm install
```

> 注意：首次安装后，你可能会看到 pnpm 提示有依赖的 build scripts 被忽略（通常与 Electron 下载、原生模块有关）。
> 
> 需要按提示执行：
>
> ```powershell
> pnpm approve-builds
> ```
>
> 在交互列表里允许 `electron` 等相关包执行脚本。

### 2.9.2 开发（Vite + Electron）

```powershell
pnpm desktop:dev
```

行为说明：

- 同时启动 Vite dev server（默认 5173）
- Electron 加载 `http://127.0.0.1:5173`
- 你修改 React 代码时：
  - 浏览器预览继续可用（`pnpm dev`）
  - Electron 窗口也会自动刷新/热更新（因为它就是在加载 Vite dev server）

### 2.9.3 打包

```powershell
pnpm desktop:dist
```

- 输出目录：`dist-desktop/`
- 默认目标：macOS(dmg) / Windows(nsis) / Linux(AppImage)

### 2.9.4 WebStorm 配置（同时跑 Web 预览 + Desktop App）

目标：开发时保留你熟悉的 Web 预览，同时也能开 Electron 窗口。

#### 方案 A（推荐）：两个 npm 运行配置，并行启动

1) `Run > Edit Configurations...`
2) 新建 **npm** 配置：
   - **Name**：`web:dev`
   - **package.json**：仓库根 `package.json`
   - **Command**：`dev`
3) 再新建一个 **npm** 配置：
   - **Name**：`desktop:dev`
   - **Command**：`desktop:dev`
4) 新建一个 **Compound** 配置（同时启动两个配置）：
   - **Name**：`dev (web + desktop)`
   - 选择上面的 `web:dev` 与 `desktop:dev`

> 提示：如果你只想要 Electron，不跑浏览器，就直接运行 `desktop:dev` 即可。

#### 方案 B：只跑 Electron（Electron 内部加载 Vite）

只运行 npm 配置 `desktop:dev`。

- Electron 会自己启动 Vite（脚本里用 concurrently）
- 这种方式最省心，但你就不需要再单独点 `pnpm dev`

## 3. 目录结构与职责边界

```
 src/
   App.tsx
   components/
     CanvasBoard.tsx
     cellTypes.ts
     canvas/
       EdgeLayer.tsx
       FormulaLayer.tsx
       domain/
         cellTree.ts
         edges.ts
       utils/
         blocks.ts
         geometry.ts
   engine/
     engineSelection.ts
     engineClient.ts
     pythonEngineClient.ts

engine/
  engine_ts/
  SymbolicComputationEngine/
    symcalc/
  SymbolicComputationEngineServer/
    matheshop_engine_server/
    scripts/


```

### 3.1 `cellTypes.ts`（领域类型）

- 只放数据结构与领域概念：`CellNode / CanvasEdge / PortSide / CellBlock ...`
- 不应依赖 React、不应包含 UI 状态。

### 3.2 `canvas/utils/*`（纯工具函数）

#### `geometry.ts`

- `Camera`：画布相机（`x/y/zoom`）
- `worldToScreen/screenToWorld`：世界坐标与“canvas 像素坐标”的互转
- `getCanvasScreenPoint`：把 DOM clientX/Y 转成 canvas 像素坐标（考虑 DPR）
- `resizeCanvasToDisplaySize`：配合 ResizeObserver 处理画布尺寸

#### `blocks.ts`

- `parseBlocksFromText`：把文本解析成 blocks（当前支持 `$$...$$`）
- `renderBlocksToHtml`：把 blocks 渲染成 HTML 字符串（内部用 KaTeX）

> 注意：目前渲染用 `dangerouslySetInnerHTML`，要保证内容转义（`escapeHtml`）并避免引入不可信输入。

### 3.3 `canvas/domain/*`（领域逻辑/规则）

#### `cellTree.ts`

职责：对 `CellNode[]` 进行结构性操作。

- 查找/更新/删除：`findCellById/updateCellById/removeCellById`
- 树/命中：`collectCellWorldHits`
- 拖拽嵌套规则：`pickDropParentId`
- worldPos 缓存：`recomputeWorldAll`

#### `edges.ts`

职责：连线相关规则、端口吸附与去重。

- `ensureEdgeUnique`：去重策略（避免反向重复边）
- `getPortWorld/pickNearestPort`：端口坐标与吸附

## 4. `CanvasBoard`：核心交互层（现状）

`src/components/CanvasBoard.tsx` 当前仍是“交互状态机 + 组合层”，但已经按照以下方向拆出部分层：

- `EdgeLayer`：只负责连线渲染与点击选中
- `FormulaLayer`：只负责公式渲染与拖拽开始
- domain/utils：放在 `src/components/canvas/` 下

### 4.0 坐标系与 Camera（重要）

本项目画布交互采用 **camera 平移/缩放** 模型（类似 draw.io / Obsidian Canvas / Figma）：

- `cameraRef.current = { x, y, zoom }` 表示“当前视口在世界坐标系里的位置与缩放”。
- 鼠标事件坐标流程：
  1. DOM `clientX/clientY` -> `getCanvasScreenPoint`（canvas 像素坐标，考虑 DPR）
  2. 再用 `screenToWorld(screen, camera)` 得到世界坐标
  3. 渲染时反向用 `worldToScreen(world, camera)` 放回 canvas/DOM 坐标

维护约束（请保持一致）：

- ✅ 平移：通过修改 `cameraRef.current.x/y`（中键拖拽或空格+左键拖拽）
- ✅ 缩放：通过修改 `cameraRef.current.zoom`（滚轮缩放，范围在 `CanvasBoard` 的 `handleWheel` 中 clamp）
- ❌ 不使用“滚动条 scroll”作为画布平移的主机制，否则会出现两套平移系统叠加导致坐标错乱。

#### 4.0.1 缩放范围与浏览器默认缩放（重要）

- 画布缩放范围：**最小 8%（0.08）~ 最大 6400%（64）**。
- 在浏览器中（以及部分触控板/系统设置下），**Ctrl/⌘ + 滚轮**会触发“页面缩放”。
  - 为避免出现“整个主界面像网页一样缩放”的错觉，`CanvasBoard` 会在 `onWheel` 里统一 `preventDefault()`，并把此手势也当作画布缩放处理。

实现落点：

- 平移手势：`CanvasBoard.tsx` 的 `isPanning/panStartRef/handlePointerMove`
- 缩放手势与范围：`CanvasBoard.tsx` 的 `handleWheel`（clamp：0.08~64）
- 坐标换算：`src/components/canvas/utils/geometry.ts`

### 4.1 核心状态（建议理解顺序）

- 相机：`cameraRef`
- Cells：`cells/selectedCellId/editingCellId/dropHintCellId`
- Edges：`edges/selectedEdgeId`
- Formulas：`formulas/selectedFormulaId`

### 4.2 交互状态机（refs）

- `draggingCellRef`：cell 拖拽
- `draggingEdgeRef`：端口拖拽连线
- `draggingFormulaRef`：公式拖拽
- `resizingCellRef`：cell resize（右下角手柄）
- `isBoxSelectingRef/selectionBox`：框选

### 4.3 渲染策略

- Canvas（`<canvas />`）当前主要画网格背景；其他 UI 使用 DOM 层叠（cell 层、公式层、SVG edge 层）。

## 5. 持续重构路线（建议）

> 原则：**先拆视图层，再拆 hooks；每次只迁移一块，保证 `pnpm build` 通过且交互不变。**

推荐顺序：

1. ✅ `EdgeLayer`（已完成）
2. ✅ `FormulaLayer`（已完成）
3. `CellLayer` / `CellItem`（下一步）
4. 抽 hooks（可选，迁移期按需）
   - `useCanvasCamera`
   - `useBoxSelection`
   - `useCellDragAndDrop`
   - `useEdgeDrag`
   - `useKeyboardShortcuts`

## 6. 开发规范与注意事项

- **避免循环依赖**：domain/utils 不要反向 import React 组件。
- **保持签名稳定**：拆分时尽量把状态修改留在 `CanvasBoard`，子组件通过 props 回调触发。
- **性能**：
  - 频繁更新（拖拽）对象推荐用 ref 存状态，节流渲染（当前通过 `scheduleRender` + `renderTick`）。
- **安全**：`dangerouslySetInnerHTML` 只渲染本地生成的 HTML，所有用户输入必须做转义。

## 7. 贡献流程（建议）

```powershell
pnpm lint
pnpm build
```

提交 PR 前至少保证：
- lint/build 通过
- 手动 smoke test：创建/编辑 cell、拖拽、连线、插入公式、清空画布
- 后端 smoke test：`engine/SymbolicComputationEngineServer/scripts/smoke_test.py`

## 2.5.5 前端如何验证“Python 引擎是否在工作”

当前原型里，Python 引擎的可视化演示入口在 **Cell 求值输出**：

1) 启动后端服务（2.5.2）
2) 前端打开设置页，将引擎切换为 `builtin_python`
3) 在画布空白处单击创建 cell
4) 双击 cell 进入编辑，输入表达式（例如 `1+2*(3^2)`）
5) 按 **Ctrl/⌘ + Enter**（提交并触发求值）

期望结果：

- 成功：cell 会追加一行文本 block，例如 `= 19`
- 失败：cell 会追加一行警告 block，例如 `⚠ <错误信息>`

如果需要更精确地看错误：

- 打开浏览器 DevTools -> Network
  - 观察请求：`/api/engine/v1/eval`
  - 常见问题：
    - `ERR_CONNECTION_REFUSED`：后端没启动 / 端口不对
    - `HTTP 500`：后端运行时报错（查看后端终端或 `engine/SymbolicComputationEngineServer/logs/server.log`）
- DevTools -> Console
  - 若 fetch 失败，通常能看到浏览器级别的网络错误（DNS/连接拒绝/CORS 等）
