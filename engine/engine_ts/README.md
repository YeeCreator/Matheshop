# engine_ts（内置 TS 本地计算引擎）

> [!warning] DEPRECATED（双轨重构）
> 本内嵌 TS 本地计算引擎已标记为弃用。迁移方向：调用 MathEngine 后端 API
> （`mathengine/symbolic` 重写 + `mathengine/proof` 校验）。前端只消费
> Presentation-AST 子集，不在浏览器端做符号计算。退役不在本次重构执行，
> 仅标注方向。见 `docs/DEVELOPER_GUIDE.md` 第 8 节前端纪律。

目标：提供一个**不依赖后端**的内置计算引擎实现（运行在浏览器端），同时保持工程结构上与 `engine/SymbolicComputationEngine` 对齐地放在 `engine/` 目录中。

## 说明

- 本引擎目前是极简版：仅支持算术表达式（`+ - * / ^`、括号、一元负号）的解析与求值。
- 前端通过直接 `import` 本引擎代码来调用，因此无需启动任何后端服务。

## 目录结构

- `src/index.ts`：对外唯一入口（推荐从这里 import）
- `src/nativeEngine.ts`：内置 TS 本地引擎实现（eval）
- `src/parser/*`：极简算术 parser/AST

## 使用方式（代码层）

- 推荐入口：`engine/engine_ts/src/index.ts`
