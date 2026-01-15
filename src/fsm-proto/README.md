<!--
FSM Proto 子模块说明（中文）：
- 本目录为一个独立的状态机原型实现（支持多级 nested state 与多层 layered dispatch）。
- 用于探索 interpreter / machine / hub 的设计并在仓库内通过 vitest 运行验证。
- 运行测试：在仓库根执行 `pnpm test -- src/fsm-proto` 或直接 `pnpm test`（vitest 会根据 glob 匹配）。
-->
# FSM Proto（多级 + 多层 状态机原型）
```
pnpm test -- src/fsm-proto
```bash

也可以只跑本目录测试（vitest 会根据 glob 运行）：

```
pnpm test
```bash

本仓库已有 `vitest`：

## 运行测试

- `createHub()`：创建多层 Hub；`hub.register(...)` / `hub.dispatch(...)`。
- `assign(updater)`：不可变更新 context。
- `interpret(machine, { context })`：启动解释器。
- `createMachine(config)`：创建并规范化 machine（flatten + initial 展开）。

## API 入口

  - 也支持 broadcast（所有层都收到）。
  - Hub 按优先级分发事件：高优先级先处理，若已处理则停止传播。
- **多层（layered / multi-machine）**：多套状态机同时运行在不同业务层（例如：Viewport 层 / Cell 层 / Edge 层）。

  - external transition 会按 LCA（最近公共祖先）计算 exit/enter 顺序。
  - 事件处理支持“向上冒泡”：leaf 没有转移，则尝试父节点的 `on`。
  - 状态用路径表示：`root.editing.text`。
- **多级（hierarchical / nested）**：单个状态机内部的父子嵌套关系（父状态包含子状态）。

## 概念：多级 vs 多层

- 直接复用仓库现有 pnpm / TypeScript / vitest 配置。
- 不新增项目级配置文件（不新增 package.json / tsconfig）。
- 不改动现有 `src/components/canvas/fsm/*`。
约束：

本目录是一个“独立于 Matheshop 现有 Canvas FSM”的通用 FSM 工具包原型。



```
