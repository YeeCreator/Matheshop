# engine_ts（内置 TS 本地计算引擎）

目标：提供一个**不依赖后端**的内置计算引擎实现（运行在浏览器端），同时保持工程结构上与 `engine/engine_python` 对齐地放在 `engine/` 目录中。

## 说明

- 本引擎目前是极简版：仅支持算术表达式（`+ - * / ^`、括号、一元负号）的解析与求值。
- 前端通过直接 `import` 本引擎代码来调用，因此无需启动任何后端服务。

## 目录结构

- `src/index.ts`：对外唯一入口（推荐从这里 import）
- `src/nativeEngine.ts`：内置 TS 本地引擎实现（eval）
- `src/parser/*`：极简算术 parser/AST

## 使用方式（代码层）

- 推荐入口：`engine/engine_ts/src/index.ts`
