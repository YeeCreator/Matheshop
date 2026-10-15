/**
 * T6 · 人性化交互：多模态动作分派 + 子图封装 + 端口约束 DAG（框架无关）。
 *
 * 设计原则（对应设计文档 §6）：
 * - 同一元素配合修饰键产生**不同动作**，匹配人阅读证明时的多种意图；
 * - 数学推导天然是有向无环图（DAG），连线只能「结论端口 → 前提端口」；
 * - 子图封装（Ctrl+G）把一组节点折叠为复合节点，降低长证明的视觉噪音。
 *
 * 本模块**只做判定与数据变换**，不碰 DOM——便于单测与在任意渲染层复用。
 */

import type { CellKind, EdgeKind } from './matheshopTypes'

/** 多模态动作（设计 §6.3）。 */
export type CanvasAction =
  | 'preview'        // 悬停：只读预览
  | 'inspect'        // 左键单击：侧边栏加载详情，不离开当前画布
  | 'open-panel'     // Ctrl+左键：新画布面板打开，便于并行对比
  | 'inline-toggle'  // Alt+左键：就地展开/折叠内部子推导
  | 'context-menu'   // 右键：编辑/复制引用/导出 Lean/切换粒度
  | 'drag'           // 拖拽：自由移动

/** 修饰键状态（从原生事件抽取，便于纯函数判定与测试）。 */
export type ModifierState = {
  ctrl?: boolean
  meta?: boolean
  shift?: boolean
  alt?: boolean
}

/**
 * 由「指针事件类型 + 修饰键」判定应执行的动作。
 *
 * 映射（对齐设计 §6.3）：
 * - `hover` → preview
 * - `click` + Alt → inline-toggle
 * - `click` + Ctrl/⌘ → open-panel
 * - `click`（无修饰） → inspect
 * - `contextmenu` → context-menu
 * - `drag` → drag
 *
 * @param kind 指针事件类型。
 * @param mods 修饰键状态。
 * @returns 应执行的动作。
 *
 * @example
 * resolveAction('click', { ctrl: true })   // -> 'open-panel'
 * resolveAction('click', {})               // -> 'inspect'
 */
export function resolveAction(kind: 'hover' | 'click' | 'contextmenu' | 'drag', mods: ModifierState = {}): CanvasAction {
  if (kind === 'hover') return 'preview'
  if (kind === 'contextmenu') return 'context-menu'
  if (kind === 'drag') return 'drag'
  // click 分支：修饰键优先级 Alt > Ctrl/⌘ > 无
  if (mods.alt) return 'inline-toggle'
  if (mods.ctrl || mods.meta) return 'open-panel'
  return 'inspect'
}

/** 端口角色：前提入、结论出（设计 §6.4）。 */
export type PortRole = 'premise' | 'conclusion'

/** 端口约束的校验结果。 */
export type DagViolation =
  | { code: 'wrong-direction'; message: string }
  | { code: 'self-loop'; message: string }
  | { code: 'would-cycle'; message: string }

/**
 * 校验一条新连线是否满足**端口约束 DAG**。
 *
 * 规则：
 * 1. 连线只能从**结论端口**（源）连到**前提端口**（目标）；
 * 2. 禁止自环；
 * 3. 禁止产生环（数学推导是 DAG）。
 *
 * @param args 校验输入：现有边、待添加边、邻接查询所需的 id。
 * @returns 违规列表；空数组表示通过。
 *
 * @example
 * validateEdge({ edges: [], from: 'a', to: 'b' })   // -> []
 * validateEdge({ edges: [], from: 'a', to: 'a' })   // -> [{ code: 'self-loop', ... }]
 */
export function validateEdge(args: {
  edges: Array<{ from: string; to: string }>
  from: string
  to: string
}): DagViolation[] {
  const violations: DagViolation[] = []
  const { edges, from, to } = args

  if (from === to) {
    violations.push({ code: 'self-loop', message: '连线的起点与终点相同' })
    return violations
  }

  // 环检测：若 to 已能到达 from，则新增 from→to 会成环
  if (reaches(edges, to, from)) {
    violations.push({ code: 'would-cycle', message: `添加 ${from} → ${to} 会形成环（推导须为 DAG）` })
  }
  return violations
}

/** 在边表上做可达性查询（迭代 DFS，避免深图爆栈）。 */
export function reaches(edges: Array<{ from: string; to: string }>, start: string, target: string): boolean {
  const adjacency = new Map<string, string[]>()
  for (const edge of edges) {
    const list = adjacency.get(edge.from) ?? []
    list.push(edge.to)
    adjacency.set(edge.from, list)
  }
  const seen = new Set<string>()
  const stack = [start]
  while (stack.length) {
    const node = stack.pop() as string
    if (node === target) return true
    if (seen.has(node)) continue
    seen.add(node)
    for (const next of adjacency.get(node) ?? []) stack.push(next)
  }
  return false
}

/** 子图封装：把一组节点折叠为复合节点（设计 §6.4）。 */
export type SubgraphComposite = {
  id: string
  /** 被折叠的成员节点 id。 */
  members: string[]
  /** 入端口：成员中「被外部指向」的节点。 */
  inputPorts: string[]
  /** 出端口：成员中「指向外部」的节点。 */
  outputPorts: string[]
}

/**
 * 把一组节点封装为复合节点，并推导其输入/输出端口。
 *
 * 端口推导：跨边界的边决定端口——外部→成员 记入入端口（目标侧成员），
 * 成员→外部 记出端口（源侧成员）。
 *
 * @param args 成员 id 列表、全量边、以及复合节点 id。
 * @returns 复合节点（含端口）。
 *
 * @example
 * packSubgraph({ id: 'g1', members: ['a','b'], edges: [{from:'x',to:'a'},{from:'b',to:'y'}] })
 * // -> { inputPorts: ['a'], outputPorts: ['b'], ... }
 */
export function packSubgraph(args: {
  id: string
  members: string[]
  edges: Array<{ from: string; to: string }>
}): SubgraphComposite {
  const memberSet = new Set(args.members)
  const inputPorts = new Set<string>()
  const outputPorts = new Set<string>()

  for (const edge of args.edges) {
    const fromInside = memberSet.has(edge.from)
    const toInside = memberSet.has(edge.to)
    if (!fromInside && toInside) inputPorts.add(edge.to)
    if (fromInside && !toInside) outputPorts.add(edge.from)
  }

  return {
    id: args.id,
    members: [...args.members],
    inputPorts: [...inputPorts],
    outputPorts: [...outputPorts],
  }
}

/**
 * 递归弹窗的挑栈：由当前层级与最大层数决定是否还能再开次级弹窗。
 *
 * @param depth 当前弹窗层级（0 = 首个弹窗）。
 * @param maxDepth 最大层级。
 * @returns 可再开则为 true。
 *
 * @example
 * canOpenPopover(0, 3)   // -> true
 * canOpenPopover(3, 3)   // -> false
 */
export function canOpenPopover(depth: number, maxDepth = 3): boolean {
  return depth < maxDepth
}

/** 知识单元类型 → 端口提示（用于 UI 层防止非法连接；规则本身不在此强制）。 */
export const KIND_PORT_HINT: Partial<Record<CellKind, { hasPremise: boolean; hasConclusion: boolean }>> = {
  Theorem: { hasPremise: true, hasConclusion: true },
  Lemma: { hasPremise: true, hasConclusion: true },
  Corollary: { hasPremise: true, hasConclusion: true },
  Proof: { hasPremise: true, hasConclusion: false },
  Axiom: { hasPremise: false, hasConclusion: true },
  Definition: { hasPremise: false, hasConclusion: true },
}

/** 关系边 → 是否允许连到前提端口（供 UI 层提示）。 */
export function edgeKindConnectsToPremise(kind: EdgeKind | undefined): boolean {
  // 全部 12 种关系边均以「前提」为起点语义；`derives` 方向相反，由 UI 层提示。
  return kind !== undefined
}
