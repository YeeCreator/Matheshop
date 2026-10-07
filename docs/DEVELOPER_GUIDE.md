# 开发者手册（Developer Guide）

本文档描述 Matheshop 当前的 Vue3 + TypeScript core 架构。旧 React 壳层、`CanvasBoard.tsx` 交互主链和 `viewport-kit` 包名已经不再是当前开发路径。

## 1. 架构原则

- 底层界面工具包统一使用 `main-ui`。
- 视口、相机、screen/world 坐标换算统一使用 `viewport-2d-kit`。
- 前端业务核心逻辑必须放在框架无关的 TypeScript core 中。
- Vue3 只承担渲染、事件绑定、订阅 core 快照和调用 core action。
- 后台计算默认对接外部 Python 包 `<path-to-MathSymbolicComputationEngine>`。
- 不保留旧 React 迁移壳和兼容路径。

## 2. 目录边界

- `src/main.ts`：Vue 应用入口。
- `src/App.vue`：使用 `MainUiProvider` 和 `WorkbenchShell` 装配工作台。
- `src/core/`：框架无关核心。
  - `matheshopTypes.ts`：Cell、Edge、Block、Tool 等领域类型。
  - `boardCore.ts`：画布快照、订阅、编辑、拖动、缩放、连线、求值。
  - `blocks.ts`：普通文本与 LaTeX block 解析，KaTeX HTML 渲染。
  - `workbench.ts`：创建 `main-ui` runtime，注册 canvas/settings editor。
  - `pythonEngineConfig.ts`：Python 引擎路径与环境变量常量。
- `src/vue/`：Vue3 渲染层。
  - `MatheshopCanvasEditor.vue`：渲染画布、工具栏、Inspector，并把用户事件转发给 core。
  - `MatheshopSettingsEditor.vue`：渲染引擎设置与 Python 后台信息。
- `src/engine/`：浏览器端引擎选择、TypeScript 后备求值、Python HTTP 客户端。
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

## 4. viewport-2d-kit 接入

入口文件：`src/vue/MatheshopCanvasEditor.vue`。

使用方式：

- Vue 组件：从 `viewport-2d-kit/vue` 导入 `Viewport2D`。
- 坐标换算：从 `viewport-2d-kit/core` 导入 `screenToWorld`。
- Matheshop 只保存与业务有关的 camera/viewBox 状态，并把鼠标事件转换为 world 坐标后交给 core。

后续新增任何画布行为时，不要重新实现独立相机或旧坐标适配器。

## 5. TypeScript core 约束

`src/core/**` 不允许导入 Vue、DOM 组件库或 React。它可以：

- 定义领域类型。
- 持有 immutable snapshot。
- 暴露 `subscribe()` 给渲染层订阅。
- 暴露 action 方法给渲染层调用。
- 调用前端引擎客户端完成求值。

Vue 组件应避免直接改写业务状态，统一通过 `matheshopBoard` 的方法修改。

## 6. Python 后台

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

双轨重构后，matheshop 前端与 MathEngine 后端遵循以下纪律（规范源见学术轨 `ES_notebook/Projects/数学引擎/notes-探索符号计算与形式证明-20260916-001.md` 与工程轨 `Engs_notebook/Projects/数学工坊/design-数学引擎-20260909-001.md`）：

- **只消费 Presentation-AST 子集**：前端求值调用只传递 Presentation-AST 层数据（cell.content + frozen 标记 + 占位符 id），绝不传递或触碰 E-graph 内部结构、Term-Graph 共享节点或 Math-IR 计算层对象。前端是视图层，不是计算层。
- **冻结 UI 对接占位符 id 机制**：圈选子式冻结时，前端在 Presentation-AST 节点打 frozen 标记并分配唯一占位符 id；下发计算时冻结子式以占位符 id 屏蔽，不展开内部结构；计算回填时按 id 恢复原始子式。冻结标记只存在于视图层与元层，导出 LaTeX 时不泄露（区别于 Mathematica 的 Hold）。
- **内嵌引擎退役方向**：`engine/SymbolicComputationEngine/`（Python）与 `engine/engine_ts/`（TS）标记为 deprecated，迁移方向为调用 MathEngine 后端 API（`mathengine/symbolic` 重写 + `mathengine/proof` 校验）。`engine/SymbolicComputationEngineServer/` 保留为过渡期适配壳，逐步把求值请求转发到 MathEngine。退役不在本次重构执行，只标注方向。
- **Lean 校验异步旁路**：前端触发等式校验时，走 MathEngine 的 ProofVerifier 通道（VerifyRequest/VerifyResult），校验失败给出警告但不阻断推导交互，不在前端等待 Lean 核验完成。
- **AST 子树替换对接占位符回填**：PRD M3（AST 子树级替换）需对接 Math-IR 的占位符 id 回填机制，而非纯 tokenRange 文本替换，避免冻结子式内部被误改写。
- **自然语言输入走后端猜想模块**：前端若提供受控自然语言（CNL）输入入口，文法解析与校验永远在后端（GF/猜想模块），前端不做文法校验、不做符号化；前端只渲染后端返回的候选 IR，并按 D6 推导状态（raw/rewritten/proven/conjecture）视觉区分猜想与已验证公式。规范源见工程轨 `Engs_notebook/Projects/数学工坊/design-数学引擎-20260909-001.md` 第 11 节「自然语言符号化接口」。
- **CNL 白板画布形态由 matheshop 承接**：受控自然语言的“白板画布”前端形态即 matheshop 本身，复用既有栈（flow-graph-kit-vue + viewport-2d-kit + main-ui），不引入 tldraw；CNL 文本卡片对应 Cell，逻辑连线对应 Edge。
- **手写与自由批注不进对象层**：手写笔迹、自由自然语言批注只作视图层批注，永不进入 IR 对象层、不参与推理（对象层/元层分离）。
- **源码为唯一真相**：富文本笔记本、画布节点、公式编辑器的任何视图操作最终回写原始源码（等价 cell.content），保存与下发后端的一律是原始源码而非渲染结果。
