# 开发者手册（Developer Guide）

本文档描述 Matheshop 当前的 Vue3 + TypeScript core 架构。旧 React 壳层、`CanvasBoard.tsx` 交互主链和 `viewport-kit` 包名已经不再是当前开发路径。

## 1. 架构原则

- 底层界面工具包统一使用 `main-ui`。
- 视口、相机、screen/world 坐标换算统一使用 `@main-ui/core/rendering`（`Camera2D` / `PixiViewport`，已吸收原 `viewport-2d-kit` 相机数学；viewport-2d-kit 已从依赖移除）。
- 前端业务核心逻辑必须放在框架无关的 TypeScript core 中。
- Vue3 只承担渲染、事件绑定、订阅 core 快照和调用 core action。
- 后台计算默认对接外部 Python 包 `<path-to-MathSymbolicComputationEngine>`。
- 不保留旧 React 迁移壳和兼容路径。

## 2. 目录边界

- `src/main.ts`：Vue 应用入口。
- `src/App.vue`：使用 `MainUiProvider` 和 `WorkbenchShell` 装配工作台。
- `src/core/`：框架无关核心。
  - `matheshopTypes.ts`：Cell、Edge、Block、Tool 等领域类型；含知识本体类型 `CellKind`（11）、关系边 `EdgeKind`（12）、概念图标 `ConceptIconBlock`、粒度元属性 `density`。
  - `boardCore.ts`：画布快照、订阅、编辑、拖动、缩放、连线、求值；含 `setCellKind` / `setEdgeKind` / `setCellDensity`。
  - `blocks.ts`：普通文本、LaTeX block 解析与 KaTeX HTML 渲染；含概念象形图标 `renderConceptIcon`。
  - `relationData.ts`：契约3 关系数据单源投影（矩阵/网络双视图 + 双向联动高亮），纯函数。
  - `symbolTable.ts`：契约4 全局符号表（唯一 id + 别名 + 作用域）与公式变量锚点推导。
  - `workbenchConstants.ts`：工作台常量与引擎选项（**叶子模块**，不 import 组件，用于打断 `workbench ↔ 编辑器组件` 循环依赖）。
  - `workbench.ts`：创建 `main-ui` runtime，注册 canvas/settings editor。
  - `pythonEngineConfig.ts`：Python 引擎路径与环境变量常量。
- `src/vue/`：Vue3 渲染层。
  - `MatheshopCanvasEditor.vue`：渲染画布、工具栏、Inspector，并把用户事件转发给 core。
  - `MatheshopSettingsEditor.vue`：渲染引擎设置与 Python 后台信息。
- `src/components/canvas/`：画布本地组件。
  - `MatheshopBoardStage.vue`：画布舞台（官方 `@main-ui/view-canvas` 之上的薄适配层：连线层 + 世界内容插槽）。
  - `MatheshopRelationLinkage.vue`：矩阵↔网络双视图联动组件（T4 范式样板）。
  - `MatheshopSymbolPanel.ts`：全局符号表面板（T5）。
- `src/engine/`：浏览器端引擎选择、TypeScript 后备求值、Python HTTP 客户端、契约3 可渲染数据客户端（`renderableClient.ts`）。
- `engine/SymbolicComputationEngineServer/`：FastAPI 服务层。

## 3. main-ui 接入

入口文件：`src/core/workbench.ts`。

当前注册内容：

- workspace：`matheshop.workspace`
- canvas editor：`matheshop.canvas`
- settings editor：`matheshop.settings`
- canvas renderer：`matheshop.renderer.canvas`
- settings renderer：`matheshop.renderer.settings`

`main-ui` 是本地 link 依赖，构建前需要先生成其 `dist` 类型声明。`pnpm build` 已自动执行 `pnpm build:deps`。

## 4. 视口/相机接入（`@main-ui/view-canvas`）

入口文件：`src/components/canvas/MatheshopBoardStage.vue`（官方模板的薄适配层）。

使用方式：

- 画布舞台、相机、指针/滚轮交互、fit 与坐标桥**全部由官方 `@main-ui/view-canvas` 提供**（`ViewportCanvas` + `ViewportCanvasShell` + `buildHostBridge`）；相机数学内核为 `@main-ui/core/rendering`（已吸收原 `viewport-2d-kit`）。
- `MatheshopBoardStage` 只补两项 matheshop 专有内容：**cell 间三次贝塞尔连线层** 与 **`#world` 世界内容插槽**（回传 `camera` / `bridge`）。
- 平移交互：官方模板的**左键拖拽**平移（与旧本地壳的「空格+拖拽 / 中键拖拽」不同）；滚轮以光标为锚点缩放。

后续新增任何画布行为时，不要重新实现独立相机或旧坐标适配器；`viewport-2d-kit` 与本地壳 `MatheshopCanvasSurface.vue` 均已退役，不得再引入。

## 5. TypeScript core 约束

`src/core/**` 不允许导入 Vue、DOM 组件库或 React。它可以：

- 定义领域类型。
- 持有 immutable snapshot。
- 暴露 `subscribe()` 给渲染层订阅。
- 暴露 action 方法给渲染层调用。
- 调用前端引擎客户端完成求值。

Vue 组件应避免直接改写业务状态，统一通过 `matheshopBoard` 的方法修改。

## 6. Python 后台

> **⚠️ deprecated 方向（对齐 §8 “内嵌引擎退役方向”）**：本节描述的 `engine/SymbolicComputationEngineServer/`（内嵌符号引擎的 FastAPI 服务壳）为**过渡期适配壳**，已标 deprecated；迁移方向是把求值请求转发到 MathEngine 后端 API（`mathengine/symbolic` + `mathengine/proof`）。下文启动命令仅为过渡期兼容保留，新接入不应再以内嵌引擎为默认路径。

服务层路径：`engine/SymbolicComputationEngineServer/`。

外部引擎路径通过环境变量控制：

```powershell
$env:MATHSYMCALC_ENGINE_ROOT = '<path-to-MathSymbolicComputationEngine>'
```

推荐环境安装：

```powershell
cd engine\SymbolicComputationEngineServer
uv venv --python 3.13
uv pip install --python .\.venv\Scripts\python.exe --index-url https://pypi.org/simple -r requirements.txt
```

启动：

```powershell
$env:PORT = 8000
.\.venv\Scripts\python.exe -m matheshop_engine_server
```

前端默认通过 `/api/engine/v1/eval` 访问后端；开发环境由 `vite.config.ts` 代理到 `http://127.0.0.1:8000`。

## 7. 常用命令

```powershell
pnpm install
pnpm dev
pnpm dev:deps
pnpm build
pnpm preview --host 127.0.0.1 --port 4173
pnpm lint
```

构建验收口径：

- `pnpm build` 通过。
- 预览页标题为 `Matheshop`。
- 首屏出现 `main-ui Vue3 workbench`。
- 画布中出现 Vue 渲染的 cell，Inspector 中显示 `builtin_python`。
- 设置弹窗显示 `MATHSYMCALC_ENGINE_ROOT` 和外部 Python 引擎路径。

## 8. 前端纪律：与 MathEngine 后端的边界

双轨重构后，matheshop 前端与 MathEngine 后端遵循以下纪律（规范源见学术轨 `Math_notebook/Projects/数学引擎/notes-探索符号计算与形式证明-20260916-001.md` 与工程轨 `Engs_notebook/Projects/数学工坊/design-数学引擎-20260909-001.md`）：

- **只消费 Presentation-AST 子集**：前端求值调用只传递 Presentation-AST 层数据（cell.content + frozen 标记 + 占位符 id），绝不传递或触碰 E-graph 内部结构、Term-Graph 共享节点或 Math-IR 计算层对象。前端是视图层，不是计算层。
- **冻结 UI 对接占位符 id 机制**：圈选子式冻结时，前端在 Presentation-AST 节点打 frozen 标记并分配唯一占位符 id；下发计算时冻结子式以占位符 id 屏蔽，不展开内部结构；计算回填时按 id 恢复原始子式。冻结标记只存在于视图层与元层，导出 LaTeX 时不泄露（区别于 Mathematica 的 Hold）。
- **内嵌引擎退役方向**：`engine/SymbolicComputationEngine/`（Python）与 `engine/engine_ts/`（TS）标记为 deprecated，迁移方向为调用 MathEngine 后端 API（`mathengine/symbolic` 重写 + `mathengine/proof` 校验）。`engine/SymbolicComputationEngineServer/` 保留为过渡期适配壳，逐步把求值请求转发到 MathEngine。退役不在本次重构执行，只标注方向。
- **Lean 校验异步旁路**：前端触发等式校验时，走 MathEngine 的 ProofVerifier 通道（VerifyRequest/VerifyResult），校验失败给出警告但不阻断推导交互，不在前端等待 Lean 核验完成。
- **AST 子树替换对接占位符回填**：PRD M3（AST 子树级替换）需对接 Math-IR 的占位符 id 回填机制，而非纯 tokenRange 文本替换，避免冻结子式内部被误改写。
- **自然语言输入走后端猜想模块**：前端若提供受控自然语言（CNL）输入入口，文法解析与校验永远在后端（GF/猜想模块），前端不做文法校验、不做符号化；前端只渲染后端返回的候选 IR，并按 D6 推导状态（raw/rewritten/proven/conjecture）视觉区分猜想与已验证公式。规范源见工程轨 `Engs_notebook/Projects/数学工坊/design-数学引擎-20260909-001.md` 第 11 节「自然语言符号化接口」。
- **CNL 白板画布形态由 matheshop 承接**：受控自然语言的“白板画布”前端形态即 matheshop 本身，复用既有栈（main-ui + `@main-ui/core/rendering`；旧 `flow-graph-kit-vue` 适配层已删除、`viewport-2d-kit` 已移除），不引入 tldraw；CNL 文本卡片对应 Cell，逻辑连线对应 Edge。
- **手写与自由批注不进对象层**：手写笔迹、自由自然语言批注只作视图层批注，永不进入 IR 对象层、不参与推理（对象层/元层分离）。
- **源码为唯一真相**：富文本笔记本、画布节点、公式编辑器的任何视图操作最终回写原始源码（等价 cell.content），保存与下发后端的一律是原始源码而非渲染结果。

## 9. 知识本体与连续语义粒度轴（契约1）

UHW 联合开发契约源：`tasks/task-多粒度草图与交互联动数理模型联合开发-20261010-001` §3.1。

### 9.1 带类型知识本体

- **单元类型 `CellKind`**（11 值，视图层枚举）：`Definition` / `Axiom` / `Lemma` / `Theorem` / `Corollary` / `Proof` / `Example` / `CounterExample` / `Exercise` / `ConceptSketch` / `VisualModel`；缺省视为普通文本单元。
- **关系边类型 `EdgeKind`**（12 值，与学术轨 IR 边类型同源命名）：`uses` / `implies` / `illustrates` / `contradicts` / `derives` / `equivalent` / `counterexample` / `refutes` / `analogous` / `dual` / `specializes` / `generalizes`；`edge.label` 承载注释边。
- 类型与标签**均属视图层/元层**，不入对象层 IR，导出 LaTeX 时不泄露。

### 9.2 连续语义粒度轴

- `cell.density` 为 0..1 的**视图层元属性**（连续轴，非离散分层）。
- 渲染分档：`density < 0.5` 只显**概念象形图标**（`renderConceptIcon`，形态只表类别、不承载推理），`≥ 0.5` 显完整 LaTeX；**底层草图永久保留**，升降级不覆盖。
- 形态由 `CellKind` 驱动默认映射（`CONCEPT_SHAPE_BY_KIND`），亦可在 block 层显式指定 `ConceptIconBlock.shape`。

### 9.3 持久化版本

- 存储键 `matheshop:whiteboards:v2`（载荷 `version: 2`）。
- `v1 → v2` 为**一次性迁移**：读旧键 → 结构透传（新增字段皆可选）→ 写新键 → 删旧键；**不保留双读兜底**（依项目兼容策略铁律）。
- 新增字段：`cell.kind` / `cell.density` / `edge.kind` / `edge.label`。

## 10. 联动样板与全局符号表（契约3 / 契约4）

### 10.1 矩阵 ↔ 网络双视图联动

- 数据**单源**：关系数据 `{ i, j, weight, label }`（契约3）。
- `src/core/relationData.ts` 提供纯函数投影：`projectMatrix`（行＝源 i、列＝目标 j）、`projectNetwork`（节点 + 有向边）、`highlightFor`（`row` = 出邻域 / `column` = 入邻域 / `node` = 双向）、`toTableRows`。
- `MatheshopRelationLinkage.vue` 消费投影结果，两视图**双向联动高亮**；数据经 Props 注入，**不发网络请求**。
- 真实数据源待 MathEngine `mathengine.geometry.renderable` 就绪后接入（契约3 的 ME 侧实现）。

### 10.2 全局符号表与公式变量锚点

- 符号条目三要素：**唯一 id + 别名 + 作用域**（契约4）；`matheshopSymbols` 为全局单例。
- 公式渲染消费 **`@main-ui/view-formula`**：该包提供 `FormulaView` 与 `scanVariableTokens` / `attachVariableAnchors`。
- **为何需要扫描器**：KaTeX `output:'html'` 不保留源 token → DOM 的映射，故须前端自扫 LaTeX 建「第 n 个变量」顺序表，再与 DOM 候选**按字母名贪心对齐**（KaTeX 会把多字母下标如 `ij` 合并进单节点，纯位置对齐会错位）。
- 交互：变量悬停/点击 → `anchor-hover` / `anchor-click` → 符号面板高亮定位。
- **符号解析与规范化在后端**（对齐 D1 符号重命名），前端只消费映射结果。

## 11. 循环依赖纪律

`core/workbench.ts` 需 import 各编辑器 Vue 组件；若编辑器再反向 import `workbench.ts`，即形成循环，dev 模式会因 TDZ 报 `Cannot access 'X' before initialization`。

**纪律**：编辑器组件所需常量/选项一律从**叶子模块** `src/core/workbenchConstants.ts` 取用；`workbench.ts` 仅**再导出**以兼容既有 import 面。
