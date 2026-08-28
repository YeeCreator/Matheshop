# 开发者手册（Developer Guide）

本文档描述 Matheshop 当前的 Vue3 + TypeScript core 架构。旧 React 壳层、`CanvasBoard.tsx` 交互主链和 `viewport-kit` 包名已经不再是当前开发路径。

## 1. 架构原则

- 底层界面工具包统一使用 `main-ui`。
- 视口、相机、screen/world 坐标换算统一使用 `viewport-2d-kit`。
- 前端业务核心逻辑必须放在框架无关的 TypeScript core 中。
- Vue3 只承担渲染、事件绑定、订阅 core 快照和调用 core action。
- 后台计算默认对接外部 Python 包 `C:/Users/Ethan/CoreFiles/ProjectsFile/MathSymbolicComputationEngine`。
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
$env:MATHSYMCALC_ENGINE_ROOT = 'C:/Users/Ethan/CoreFiles/ProjectsFile/MathSymbolicComputationEngine'
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
