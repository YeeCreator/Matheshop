# Matheshop

一个基于 **Vite + React + TypeScript** 的轻量“数学白板/Canvas”原型：在画布上创建可编辑的单元框（Cell）、渲染 KaTeX 公式、并在单元框之间连线。

> 目前定位：原型/实验项目，重点在交互与组件拆分（`CanvasBoard` 正在持续重构）。

## 功能概览

- **画布相机（Camera）**：滚轮缩放、平移（采用 camera 变换的“虚拟平移”，**不是**通过滚动条 scroll 来平移画布）
- **单元框（Cell）**
  - 单击选中、拖拽移动
  - 双击进入编辑（文本域）
  - 支持嵌套（把一个 cell 拖到另一个 cell 上松开）
  - 支持 Group（可折叠容器）基础形态
- **公式（Formula）**：使用 **KaTeX** 渲染，可选中、可拖拽
- **连线（Edge）**：支持进入连线模式后连接 cell
- **框选（多选）**：拖拽框选选中多个 cell（当前实现以现状为准）
- **顶部工具条**
  - 清空：清空画布（触发一次 clear）
  - 文本颜色：设置后续插入文本/公式的颜色
  - 设置（右上角齿轮）：进入“设置页”

- **设置页（独立界面）**
  - 入口：顶部工具条最右侧的齿轮按钮
  - 返回主界面：左上角“← 返回”按钮
  - 快捷键：在设置页按 `Esc` 也会返回主界面
  - 当前设置项：符号计算系统引擎选择（内置原生 / 内置 Python / 外接占位）

## 快捷键 / 交互手势

- 滚轮：缩放（范围：最小 **8%** ~ 最大 **6400%**）
  - 说明：在多数浏览器里 Ctrl/⌘ + 滚轮默认会触发“页面缩放”。本项目会拦截该默认行为，统一作为“画布缩放”，避免整个主界面像网页一样被缩放。
- Shift + 滚轮：横向平移
- 中键拖拽：平移
- 空格按住 + 左键拖拽：平移

- 双击 Cell：进入编辑
- 编辑时：
  - Enter：提交并退出编辑（立刻渲染内容）
  - Shift + Enter：换行
  - Ctrl/⌘ + Enter：提交并求值（追加输出行）
  - Esc：退出编辑

- L：进入/退出连线模式
- Esc：取消当前交互（取消拖拽/选择/连线起点等）
- **在设置页**：Esc 返回主界面
- Delete/Backspace：删除选中的边或节点（输入框内不会拦截）

## 文档

- 产品需求文档（PRD）：`docs/PRD.md`
- 产品用户手册：`docs/USER_MANUAL.md`
- 开发者手册：`docs/DEVELOPER_GUIDE.md`
- 开发日志：`docs/DEVELOPMENT_LOG.md`

> 维护约定：每次新增功能/改动/修复错误，在校验与完工时同步更新相应文档，并把变动追加到开发日志。

## 本地开发

本项目使用 `pnpm`。

```powershell
pnpm install
pnpm dev
```

启动后按终端输出打开本地地址（一般为 http://localhost:5173）。

## 构建与预览

```powershell
pnpm build
pnpm preview
```

## 代码结构（速览）

- `src/App.tsx`：应用壳（工具栏/历史记录/颜色选择等），渲染 `CanvasBoard`
- `src/components/CanvasBoard.tsx`：核心交互层（状态机、事件处理、组合各层）
- `src/components/cellTypes.ts`：领域类型（Cell/Edge/Port/Blocks 等）

Canvas 拆分目录：`src/components/canvas/`

- `EdgeLayer.tsx`：SVG 连线层（渲染与选中）
- `FormulaLayer.tsx`：KaTeX 公式层（渲染与拖拽开始）
- `utils/`
  - `geometry.ts`：相机/坐标变换/Canvas 尺寸工具
  - `blocks.ts`：cell 内容解析与 KaTeX HTML 渲染
- `domain/`
  - `cellTree.ts`：Cell 树操作（查找/更新/删除/命中测试/重算 worldPos）
  - `edges.ts`：Edge 相关规则（去重、端口吸附等）

> 更完整的“开发者手册/架构说明”请看：`docs/DEVELOPER_GUIDE.md`。

## 常见问题（FAQ）

### 1. Windows 下命令行怎么跑？
本文档给的命令均为 PowerShell 版本（使用 `;` 串联命令）。

### 2. 为什么用 `pnpm`？
项目当前使用 `pnpm-lock.yaml`，建议统一用 `pnpm` 以避免锁文件漂移。

### 3. KaTeX 字体/样式在哪里？
KaTeX 相关资源由构建产物打包输出（可在 `dist/assets/` 看到字体文件）。

## License

暂未声明（如需开源许可证，可补充 MIT/Apache-2.0 等）。
