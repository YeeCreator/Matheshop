# FSM 重构需求说明书（精简版）

版本：0.2

说明：
本文件是针对仓库中 `src/fsm-proto` 状态机原型的重构需求说明（中文）。目标是把原型升级为“树（层级语义）+ 子图（每个复合子机内部邻接表）”的混合模型，兼顾向后兼容性、运行效率与可视化能力。

高层要点
- 保留层级语义（initial、entry/exit、ancestor 查找、LCA）以兼容现有行为。
- 在编译阶段将每个复合状态（子机）内部的转移收集成邻接表，提升子机内转移匹配效率并便于可视化。
- 把目标不在同一子机范围内的转移归为树级转移（treeTransitions），由解释器按上抛/LCA 逻辑处理。

快速检查表
- 受影响文件：`src/fsm-proto/core/types.ts`、`src/fsm-proto/core/machine.ts`、`src/fsm-proto/runtime/interpreter.ts`、新增可选 `src/fsm-proto/core/inspect.ts`。
- 目标测试：现有 `src/fsm-proto/fsm-proto.spec.ts`（initial、LCA exit/enter、internal、hub 行为）须保持通过。

---

1. 目的与约束

目的：提高子状态机内部转移的查找性能、加强可视化/调试导出能力，并为后续功能（优先级、反向索引、路由规则）提供基础。

约束：尽量保证向后兼容，初期通过 feature-flag 或配置选项可切回旧行为。

非目标：不在本次重构中改变现有外部 runtime API 的基本契约（如 `createMachine`/`interpret` 的主要行为），除非经过明确的版本或开关声明。

---

2. 概念模型（简要）

核心概念：状态（StateNode）、转移（Transition）、机器（Machine）、子机邻接表（SubmachineOutgoing）、树级转移（TreeTransitions）。

示例类型（供实现参考，需与现有 `core/types.ts` 对齐）：

```typescript
type AnyEvent = { type: string };

interface Transition<E extends AnyEvent = AnyEvent> {
  id?: string;
  source?: string; // 编译时填充
  target?: string; // 绝对 id
  event?: E['type'];
  internal?: boolean;
  guard?: (ctx: any, evt?: any) => boolean;
  actions?: Array<(args: { context: any; event?: any }) => any>;
}

interface StateNode {
  id: string; // 点分路径
  parent?: string;
  initial?: string;
  entry?: any[];
  exit?: any[];
  on?: Record<string, Transition | Transition[]>;
  states?: Record<string, StateNode>;
}

interface Machine {
  id?: string;
  nodes: Map<string, StateNode>;
  submachineOutgoing: Map<string, Map<string, Map<string, Transition[]>>>; // rootId -> (sourceId -> eventType -> transitions[])
  treeTransitions: Transition[];
  compileErrors?: string[];
}
```

语义要点：
- `submachineOutgoing` 仅包含目标仍位于相同子机（rootId）范围内的转移。
- `treeTransitions` 包含跨子机或跨级的转移，解释器按层级（上抛/下钻/LCA）处理。

---

3. 编译流程（createMachine / compileHybrid）

目标：在 createMachine 完成树展开后执行 compileHybrid，将转移分类为子机内部邻接表或树级转移。

步骤（高层）：
1. 展开 `states`，构建 `nodes: Map<id, StateNode>`，计算 `parent` 字段。
2. 对每个 node 的 `on` 条目：
   - 标准化转移（数组/单值统一、补 event 字段）。
   - 计算 `sourceSubRoot`（源节点所属的最近复合节点 rootId）。
   - 若 `target` 在 `sourceSubRoot` 范围内 -> 写入 `submachineOutgoing.get(sourceSubRoot)`（按 source/event 索引）。
   - 否则 -> push 到 `treeTransitions`。
3. 可选：生成 `incoming` 反向索引与 `compileErrors` 日志。

伪代码：

```typescript
for (const [sourceId, node] of nodes) {
  for (const [eventType, raw] of Object.entries(node.on || {})) {
    const arr = Array.isArray(raw) ? raw : [raw];
    for (const tr of arr) {
      const t = { ...tr, source: sourceId, event: eventType };
      const root = findContainingSubmachineRoot(nodes, sourceId);
      if (isInSubmachine(root, t.target)) addOutgoing(submachineOutgoing[root], sourceId, eventType, t);
      else treeTransitions.push(t);
    }
  }
}
```

复杂度：O(N + M)（N 节点数，M 转移数），主要开销为字符串前缀检查与 Map 插入。

---

4. 运行时解释器（事件解析策略）

目标：事件分发优先在最近的包含子机内部匹配，未命中则上抛到父子机，最后在树级转移中查找跨子机规则。

查找顺序（给定当前 leaf id 与 eventType）：
1. 找到当前 leaf 所属的最近复合子机（从 leaf 向上，直到包含 `states` 的节点）。
2. 在该子机的邻接表中尝试按 `sourceId,eventType` 查找候选转移（可扩展为 ancestor 查找）。
3. 若命中并 guard 通过 -> 执行（internal: true 则仅 run actions，否则按 exit/enter/LCA 流程切换状态）。
4. 若未命中 -> 将查找上抛到父子机（重复 2）；到达根后在 `treeTransitions` 中查找并处理跨级转移。

跨级转移触发顺序（LCA）：
- 计算 source 与 target 的 LCA。执行：从当前 leaf 退出到 LCA（exit handlers），然后从 LCA 进入 target（enter handlers，遵循 target 的 initial 展开）。

异常处理：
- guard 异常视为 false 并记录警告；
- target 不存在的转移若未开启 strict 模式，则记录 compileErrors 并在运行时忽略该转移；strict 模式会在编译或 interpret 时抛错。

---

5. API 建议（向后兼容为主）

主要接口：
- `createMachine(config)` -> returns Machine（默认执行 hybrid compile，可通过选项关闭）。
- `compileHybrid(machine)` -> 为已构建 machine 生成 `submachineOutgoing` 与 `treeTransitions`（便于单元测试）。
- `interpret(machine, opts)` -> 运行时，事件分发采用混合查找策略。

调试/导出：
- `listSubmachineEdges(machine, subRootId)` -> 列表格式输出子机边集合。
- `listTreeTransitions(machine)` -> 输出 treeTransitions。
- `exportSubmachineDOT(machine, subRootId)` -> DOT 文本，供 Graphviz 渲染。

错误与模式：
- 默认宽容模式（记录 compileErrors）；提供 `strict: true` 选项在编译或 interpret 时抛错。

---

6. 测试矩阵（必须通过）

保留并扩展 `src/fsm-proto/fsm-proto.spec.ts`：
- initial 展开到最深 leaf
- 祖先 on 查找 + LCA exit/enter（现有测试）
- internal transition 行为（不触发 enter/exit，仅执行 actions）
- 子机内部邻接表匹配（新增测试）：定义复合节点并验证内部转移能在邻接表匹配到且被优先触发
- 跨子机转移（treeTransitions）（新增测试）：验证上抛、LCA exit/enter、目标 initial 展开
- compileErrors 记录（目标缺失/非法 internal 跨级别标记）
- hub 行为（现有测试 coverage）

验收条件：
- 所有单元测试通过（包括新增用例）。
- 在不启用 strict 模式下，编译器记录但不阻止构建。

---

7. 迁移计划

分阶段逐渐替换：
- Phase A（低风险）：在 `core` 中实现 `compileHybrid` 并暴露为独立函数，默认不开启自动使用。
- Phase B（集成）：在 `createMachine` 中根据 `opts.enableHybrid` 启用新编译，调整 interpret 的解析顺序并保持旧逻辑可切回。
- Phase C（收敛）：在经过验证并合并测试后，将 hybrid 模式设为默认；随后移除 fallback 代码路径。

回滚策略：使用 feature flag 或参数控制；任一阶段回滚仅需恢复 flag 并回退相应 PR。

---

8. 开发/交付清单

变更文件（建议）：
- 修改：
  - `src/fsm-proto/core/types.ts`（扩展类型）
  - `src/fsm-proto/core/machine.ts`（新增/集成 `compileHybrid`）
  - `src/fsm-proto/runtime/interpreter.ts`（按需调整事件解析）
- 新增（可选）：
  - `src/fsm-proto/core/inspect.ts`（DOT/JSON 导出工具）
  - 新增或扩展的单元测试文件（基于 `fsm-proto.spec.ts`）

交付里程碑（估时）：
- 设计与文档：0.5 天
- 类型与编译器实现：2 天
- 运行时集成与单元测试：2 天
- 可视化与文档补充：1 天
- 性能基准与优化：1 天

---

9. 附录：简短伪代码与检查

- isInSubmachine(rootId, targetId):
  - return targetId && (targetId === rootId || targetId.startsWith(rootId + '.'))

- findContainingSubmachineRoot(nodes, id):
  - 向上查找包含 `states` 的最近 ancestor 并返回其 id

结束语

本文件为精简的、可执行的需求说明，足以作为实现 `compileHybrid` 并在 `runtime` 中逐步集成的规范。下一步我可以把类型草案落到 `src/fsm-proto/core/types.ts` 并实现 `compileHybrid`（先作为独立函数与单元测试），如你同意我将继续实现并提交。
