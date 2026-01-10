# Canvas FSM（交互有限状态机）

这个目录用于逐步把 `CanvasBoard.tsx` 的交互逻辑收敛到一个可扩展的有限状态机（FSM）。

## 设计目标

- **单一互斥交互状态**：同一时间只处于一种主交互（空闲、框选、连线拖拽……），避免大量 if/return 的冲突。
- **强类型**：事件、状态、上下文结构都有明确类型，方便扩展与重构。
- **可渐进迁移**：FSM 先覆盖最独立的交互（框选/连线），后续再逐步迁移拖拽移动、缩放、编辑等。

## 文件说明

- `types.ts`：状态/事件/上下文/commands 类型。
- `reducer.ts`：纯函数 transition，不直接操作 React state。
- `useCanvasFsm.ts`：React 适配层，负责把 commands 回调给 `CanvasBoard` 执行。

## 扩展建议

新增一种模式时，优先：

1. 在 `types.ts` 增加 `state.tag` 分支与事件 payload。
2. 在 `reducer.ts` 添加对应 transition，尽量只产出 commands。
3. 在 `CanvasBoard.tsx` 执行 commands（更新 React state、写历史、触发渲染）。

这样可以保证状态机容易测试，UI 侧容易调试。

