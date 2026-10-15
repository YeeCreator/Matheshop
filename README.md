# Matheshop

Matheshop 是一个基于 **Vue3 + TypeScript core** 的数学白板原型。界面壳层统一使用 `main-ui`，二维视口/相机统一使用 `@main-ui/core/rendering`（已吸收原 `viewport-2d-kit` 相机数学），业务核心逻辑放在不依赖前端框架的 TypeScript 模块中；Vue3 只负责渲染和事件转发。

后台计算默认对接外部 Python 高性能符号计算包：`<path-to-MathSymbolicComputationEngine>`。

## 双轨定位与命名消歧

数学引擎（ME）分**工程轨**与**学术轨**两轨，任何会话请先据此定位，勿混用名称与路径：

| 轨道 | 代码仓库 | 笔记目录（磁盘实际名） |
|---|---|---|
| 工程轨·前端 | `ProjectsFile/matheshop`（本仓库） | `Engs_notebook/Projects/数学工坊` |
| 工程轨·后端 | `ProjectsFile/MathEngine` | `Engs_notebook/Projects/数学工坊`（统一工程笔记：前端+后端） |
| 学术轨·研究 | `EntelechySystem/EntelechySystem/MathEngineResearch`（宿主 `ProjectsFile/EntelechySystem`） | `Math_notebook/Projects/数学引擎` |

命名消歧（易混点）：

- `MathEngine` = 工程后端**仓库**；`数学引擎` = 跨轨**概念**，同时也是学术**笔记目录名**。
- `matheshop` = 前端**仓库**；其工程笔记在 **`数学工坊` 目录**（早期文档误记 `Matheshop`，磁盘无该目录）。
- IR 规范所有权归学术轨（`Math_notebook/Projects/数学引擎/notes-探索符号计算与形式证明-20260916-001.md`）；工程轨实现六维子集（D1–D4 + D5-lite + D6-lite）。
- 权威导航与规则以各仓库根目录 `AGENTS.md` 为唯一真相源（`CLAUDE.md`/`.github/copilot-instructions.md` 为转发壳）。

## 当前能力

- `main-ui` 工作台：活动栏、标签组、状态栏、设置弹窗由 `main-ui/vue` 提供。
- `@main-ui/core/rendering` 视口：平移、缩放、screen/world 坐标换算由 `@main-ui/core/rendering`（`Camera2D` / `PixiViewport`）负责；旧 `viewport-2d-kit` 已移除。
- TypeScript core：Cell、Edge、编辑、连线、求值状态由 `src/core/` 维护，不导入 Vue。
- Vue 渲染层：`src/vue/` 订阅 core 快照，渲染画布与设置界面。
- KaTeX：支持 `$$...$$` 公式块渲染。
- Python 引擎：默认选择内置 Python 后台，通过 `/api/engine/v1/eval` 请求 FastAPI 服务。

## 本地开发

```powershell
pnpm install
pnpm dev
```

联调底层包时使用：

```powershell
pnpm dev:deps
```

## 构建与预览

```powershell
pnpm build
pnpm preview --host 127.0.0.1 --port 4173
```

`pnpm build` 会先构建本地链接包 `../main-ui`（`build:deps` = `pnpm -C ../main-ui build`），再执行 Matheshop 的 TypeScript 检查与 Vite 打包。（旧 `../viewport-2d-kit` 链接已随该包移除而取消。）

## Python 计算后台

> **⚠️ deprecated 方向**：`engine/SymbolicComputationEngineServer/`（内嵌符号引擎服务壳）已标 deprecated，为过渡期适配壳；迁移方向是调用 MathEngine 后端 API（见 DEVELOPER_GUIDE §8）。下文命令仅过渡期兼容保留。

```powershell
cd engine\SymbolicComputationEngineServer
uv venv --python 3.13
uv pip install --python .\.venv\Scripts\python.exe --index-url https://pypi.org/simple -r requirements.txt
$env:MATHSYMCALC_ENGINE_ROOT = '<path-to-MathSymbolicComputationEngine>'
$env:PORT = 8000
.\.venv\Scripts\python.exe -m matheshop_engine_server
```

健康检查：

```powershell
Invoke-RestMethod http://127.0.0.1:8000/health
```

## 代码结构

- `src/main.ts`：Vue 应用入口。
- `src/App.vue`：挂载 `main-ui` provider 与 workbench shell。
- `src/core/`：框架无关的业务核心。
  - `boardCore.ts`：画布状态、编辑、连线、求值等核心逻辑。
  - `blocks.ts`：文本与 KaTeX block 解析和 HTML 渲染。
  - `workbench.ts`：main-ui runtime、editor、workspace 注册。
  - `pythonEngineConfig.ts`：外部 Python 引擎路径与环境变量名。
- `src/vue/`：Vue3 渲染层。
  - `MatheshopCanvasEditor.vue`：画布编辑器。
  - `MatheshopSettingsEditor.vue`：设置编辑器。
- `src/engine/`：前端引擎选择和 HTTP 客户端。
- `engine/SymbolicComputationEngineServer/`：FastAPI 服务层。

## 文档

- 产品需求文档：[docs/PRD.md](docs/PRD.md)
- 产品用户手册：[docs/USER_MANUAL.md](docs/USER_MANUAL.md)
- 开发者手册：[docs/DEVELOPER_GUIDE.md](docs/DEVELOPER_GUIDE.md)
- 开发日志：[docs/DEVELOPMENT_LOG.md](docs/DEVELOPMENT_LOG.md)
