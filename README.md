# Matheshop

Matheshop 是一个基于 **Vue3 + TypeScript core** 的数学白板原型。界面壳层统一使用 `main-ui`，二维视口统一使用 `viewport-2d-kit`，业务核心逻辑放在不依赖前端框架的 TypeScript 模块中；Vue3 只负责渲染和事件转发。

后台计算默认对接外部 Python 高性能符号计算包：`C:/Users/Ethan/CoreFiles/ProjectsFile/MathSymbolicComputationEngine`。

## 当前能力

- `main-ui` 工作台：活动栏、标签组、状态栏、设置弹窗由 `main-ui/vue` 提供。
- `viewport-2d-kit` 视口：平移、缩放、screen/world 坐标换算由 `viewport-2d-kit` 负责。
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

`pnpm build` 会先构建本地链接包 `../main-ui` 与 `../viewport-2d-kit`，再执行 Matheshop 的 TypeScript 检查与 Vite 打包。

## Python 计算后台

```powershell
cd engine\SymbolicComputationEngineServer
uv venv --python 3.13
uv pip install --python .\.venv\Scripts\python.exe --index-url https://pypi.org/simple -r requirements.txt
$env:MATHSYMCALC_ENGINE_ROOT = 'C:/Users/Ethan/CoreFiles/ProjectsFile/MathSymbolicComputationEngine'
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
