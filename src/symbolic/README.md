# src/symbolic（前端符号/算术能力）

当前阶段目标：把单元框内的纯文本表达式解析为 token/AST，用于实现“隐式节点”交互（选中/编辑/求值）。

- `arithParser.ts`：算术表达式解析（MVP：`+ - * / ^ ( )` + 单目负号）
- `arithAst.ts`：AST 与 token 类型
- `pythonEngineClient.ts`：调用后端 Python 引擎做求值

> 说明：目前 token 的 `nodeId` 先按“token 粒度”生成（MVP）。后续会把 token 与 AST 节点建立更精细的映射，以支持子树级别编辑。
