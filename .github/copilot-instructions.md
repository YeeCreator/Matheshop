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



## 目录说明

- [.github/](.github/)：面向本仓库开发的 AI 协作规则与文档文件夹（不直接作为安装器内容库消费路径）。

  - [.github/copilot-instructions.md](.github/copilot-instructions.md)：项目级统一规则文件。
  - [.github/agents/](.github/agents/)：仓库级 agents（如需为本仓库定制子智能体）。
  - [.github/prompts/](.github/prompts/)：多文件 prompt 体系。
    - [.github/prompts/代码开发.prompt.md](.github/prompts/代码开发.prompt.md)：代码开发规范与约束。
    - [.github/prompts/文档编写.prompt.md](.github/prompts/文档编写.prompt.md)：文档结构与写作规范。
    - [.github/prompts/评审与提交.prompt.md](.github/prompts/评审与提交.prompt.md)：评审流程与提交规范。
  - [.github/docs/](.github/docs/)：纯AI专用的文档。





## 办公区位置

**本项目**办公区位于工作区根路径的以下文件夹：

- [MS-docs](../../../iCloudDrive/iCloud~md~obsidian/Engs_notebook/Projects/Matheshop/docs/)。
- [数学符号计算-docs](../../../iCloudDrive/iCloud~md~obsidian/CS_notebook/Projects/数学符号计算/docs/)。

  注意：

  - [<办公区位置>/docs/archives/](<办公区位置>/docs/archives/) 该文件夹作为历史存档，默认情况下直接跳过，禁止读取该文件夹及其内容。只有【文档管理智能体】在执行特定存档管理任务时才会访问该目录。
    - [<办公区位置>/docs/tasks/](<办公区位置>/docs/tasks/)：任务文档文件夹，仅提供给【任务运作智能体】、【文档管理智能体】使用，其他智能体默认情况下不需要读取该文件夹及其内容。


## 通用办公区文档格式规定

通用文档的命名格式为：`文档类型-文档内容名-日期-UID序列号.md`，例如 `plan-计划某行为-20260101-001.md`。通用文档的大标题格式是：`# 文档类型-文档内容名-日期-UID序列号`。其中 `文档类型-文档内容名-日期-UID序列号` 刚好就是通用文档之文件名（不带扩展名）。

日期格式是 `YYYYMMDD`，UID序列号是一个三位数的数字，用于区分同一个日期的同一个任务的同一个运作阶段的不同的文档。差异可以是文档内容的不同版本，或者是同一运作阶段的不同方面的内容。

每次运作的时候，只能访问 `.github\docs\文档类型` 的能够匹配当前文档内容名为开头的内容。比如当前文档内容名是 `analyse-分析某功能的可行性`，那么只能访问 `.github\docs\analyses` 里面以 `analyse-分析某功能的可行性` 开头的文档。其他任务名的 md 文档属于别的智能体的文档，不在你的任务职责范围内，因此一般情况下不要访问。

文档类型包括：

- `plan`：计划文档
- `analyse`：分析文档
- `record`：记录文档
- `summary`：总结文档
- `report`：报告文档
- `task`：任务文档
- `notes`：笔记文档
- `knowledge`：知识文档
- `subjects`：学科知识文档
- `memo`：备忘录
- `manual`：操作手册
- `guide`：指南
- `spec`：规范文档
- `doc`：其他文档
- `archive`：存档文档

文档类型属性表格

| 运作类型 | 文档类型  | 存放的文件夹名 | 文档大标题格式              | 文档内容名示例                    | 备注                                                                                   |
| -------- | --------- | -------------- | --------------------------- | --------------------------------- | -------------------------------------------------------------------------------------- |
| 计划     | plan      | plans          | # plan-内容名-日期-UID      | 计划某功能的实施                  | 计划文档用于描述未来的行动计划，内容名通常包含“计划”字样。                           |
| 分析     | analyse   | analyses       | # analyse-内容名-日期-UID   | 分析某功能的可行性                | 分析文档用于评估某个功能或方案的可行性，内容名通常包含“分析”字样。                   |
| 记录     | record    | records        | # record-内容名-日期-UID    | 记录某功能的实施   过程           | 记录文档用于详细记录某个功能的实施过程，内容名通常包含“记录”字样。                   |
| 总结     | summary   | summaries      | # summary-内容名-日期-UID   | 总结某功能的实施结果              | 总结文档用于总结某个功能的实施结果和经验，内容名通常包含“总结”字样。                 |
| 报告     | report    | reports        | # report-内容名-日期-UID    | 报告某功能的实施结果              | 报告文档用于正式报告某个功能的实施结果，内容名通常包含“报告”字样。                   |
| 任务     | task      | tasks          | # task-内容名-日期-UID      | task-开发某功能                   | 任务文档用于描述某个具体任务的实施细节，内容名通常包含“task”字样。                   |
| 笔记     | notes     | notes          | # notes-内容名-日期-UID     | notes-开发某功能的笔记            | 笔记文档用于记录某个功能的开发笔记和思考，内容名通常包含“notes”字样。                |
| 知识     | knowledge | knowledge      | # knowledge-内容名-日期-UID | knowledge-开发某功能的相关知识    | 知识文档用于总结和记录与某个功能相关的知识点，内容名通常包含“knowledge”字样。        |
| 学科知识 | subjects  | subjects       | # subjects-内容名-日期-UID  | subjects-开发某功能涉及的学科知识 | 学科知识文档用于总结和记录与某个功能相关的学科知识点，内容名通常包含“subjects”字样。 |
| 备忘录   | memo      | memos          | # memo-内容名-日期-UID      | memo-关于某功能的备忘录           | 备忘录用于记录与某个功能相关的重要信息和提醒，内容名通常包含“memo”字样。             |
| 操作手册 | manual    | manuals        | # manual-内容名-日期-UID    | manual-某功能的用户手册           | 操作手册用于指导用户如何使用某个功能，内容名通常包含“manual”字样。                   |
| 指南     | guide     | guides         | # guide-内容名-日期-UID     | guide-某功能的开发指南            | 指南用于指导开发者如何开发某个功能，内容名通常包含“guide”字样。                      |
| 规范文档 | spec      | specs          | # spec-内容名-日期-UID      | spec-某功能的设计规范             |                                                                                        |
| 其他文档 | doc       | docs           | # doc-内容名-日期-UID       | doc-某功能的相关文档              | 其他文档用于记录与某个功能相关的其他类型的文档，内容名通常包含“doc”字样。            |
| 存档文档 | archive   | archives       | # archive-内容名-日期-UID   | archive-某功能的历史存档          | 存档文档用于记录与某个功能相关的历史信息和存档，内容名通常包含“archive”字样。        |



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
