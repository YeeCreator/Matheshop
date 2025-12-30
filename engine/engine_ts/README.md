# engine_ts（内置 TS 本地计算引擎）

目标：提供一个**不依赖后端**的内置计算引擎实现（运行在浏览器端），同时保持工程结构上与 `engine/engine_python` 对齐地放在 `engine/` 目录中。

## 说明

- 本引擎目前是极简版：仅支持算术表达式（`+ - * / ^`、括号、一元负号）的解析与求值。
- 前端通过直接 `import` 来调用本引擎，因此无需启动任何后端服务。

## 目录结构

- `src/nativeEngine.ts`：引擎入口（eval）
- `src/parser/*`：极简算术 parser/AST（与前端解耦，便于后续升级为更完整的符号系统）

## 使用方式（代码层）

前端通过 `src/symbolic/engineClient.ts` 统一路由：当引擎选择为 `builtin_native` 时，会调用 `engine/engine_ts/src/nativeEngine.ts`。

