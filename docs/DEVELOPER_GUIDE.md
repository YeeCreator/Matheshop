# 开发者手册（Developer Guide）

本文档面向维护者，描述 Matheshop 的工程结构、核心模块边界、以及后续重构/开发的约定。

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

