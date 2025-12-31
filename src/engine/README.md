# src/engine（前端计算引擎：接入层）

这里放的是“前端计算引擎接入层/路由层”代码：负责

- 将 UI 的“引擎选择”映射到具体实现（内置 TS 本地 / 内置 Python / 外接占位）
- 提供统一的调用接口给 UI 组件

## 文件说明

- `engineSelection.ts`：引擎类型与选择逻辑（localStorage 持久化）
- `engineClient.ts`：统一的求值入口（按选择路由到不同引擎）
- `pythonEngineClient.ts`：调用后端 Python 引擎（仅当选择 Python/外接时才需要后端）
