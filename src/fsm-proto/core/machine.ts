/**
 * machine.ts
 *
 * 状态机构建与路径解析工具：
 * - createMachine：规范化状态树为扁平 nodes 映射，保存 parent/initialChild/children/on/entry/exit；
 * - resolveInitialLeaf：把可能是 compound 的路径沿 initial 子状态一路下钻到最终 leaf；
 * - resolveTargetPath：把相对 target（不含 '.'）解析到 sourcePath 的同级父空间，便于在 transition 中使用短 target；
 * - pathChain/assertMachineWellFormed：辅助生成 root->leaf 链与验证机器完整性。
 *
 * 约定：所有内部节点以 `${root}.${child}` 的全路径表示，便于在解释器中按路径直接查找。
 */
import { ancestorsFromRoot, splitPath } from './ids';
import type { Machine, NormalizedNode, StateNodeConfig, TransitionDef, EventObject } from './types';

function normalizeOn<C, E extends EventObject>(
  on?: Record<string, TransitionDef<C, E> | Array<TransitionDef<C, E>>>
): Record<string, Array<TransitionDef<C, E>>> | undefined {
  if (!on) return undefined;
  const res: Record<string, Array<TransitionDef<C, E>>> = {};
  for (const k of Object.keys(on)) {
    const v = on[k];
    res[k] = Array.isArray(v) ? v : [v];
  }
  return res;
}

export function createMachine<C, E extends EventObject>(cfg: StateNodeConfig<C, E>): Machine<C, E> {
  const rootId = cfg.id ?? 'root';
  if (!cfg.states) throw new Error('machine root must have `states`');
  if (!cfg.initial) throw new Error('machine root must have `initial`');

  const nodes: Record<string, NormalizedNode<C, E>> = {};

  function walk(node: StateNodeConfig<C, E>, fullPath: string, parent?: string) {
    const childrenKeys = node.states ? Object.keys(node.states) : undefined;

    nodes[fullPath] = {
      id: fullPath,
      parent,
      initialChild: node.initial,
      children: childrenKeys,
      on: normalizeOn(node.on),
      entry: node.entry,
      exit: node.exit,
    };

    if (node.states) {
      for (const key of Object.keys(node.states)) {
        const child = node.states[key];
        // 子状态路径统一使用 `${parent}.${key}`，避免 root 节点特殊处理导致路径不一致
        const childPath = `${fullPath}.${key}`;
        walk({ ...child, id: child.id ?? key }, childPath, fullPath);
      }
    }
  }

  walk(cfg, rootId, undefined);

  // root.initial 是 root 的直接子 key，因此 full path 为 `${rootId}.${cfg.initial}`
  const initial = resolveInitialLeaf(nodes, `${rootId}.${cfg.initial}`);
  return { id: rootId, initial, nodes };
}

/**
 * 给定一个可能是 compound 的状态路径，沿 initial 一路下钻，得到最终 leaf。
 */
export function resolveInitialLeaf<C, E extends EventObject>(
  nodes: Record<string, NormalizedNode<C, E>>,
  start: string
): string {
  let cur = start;
  let guard = 0;
  while (guard++ < 1000) {
    const node = nodes[cur];
    if (!node) throw new Error(`unknown state path: ${cur}`);
    if (!node.initialChild) return cur;

    const nextPath = `${cur}.${node.initialChild}`;
    if (!nodes[nextPath]) {
      throw new Error(`invalid initial: ${cur} -> ${nextPath} not found`);
    }
    cur = nextPath;
  }
  throw new Error('resolveInitialLeaf exceeded max depth (possible cycle)');
}

/**
 * 将相对 target（如 "child"）解析为绝对路径。
 * 规则：如果 target 含 '.' 则视为绝对路径；否则相对到 sourcePath。
 */
export function resolveTargetPath(sourcePath: string, target: string): string {
  if (target.includes('.')) return target;
  // 相对 target 的语义：相对到 sourcePath 的父节点（同级跳转更常见）。
  // 例如：sourcePath = "root.view"，target = "editing" => "root.editing"。
  const parts = sourcePath.split('.').filter(Boolean);
  parts.pop();
  return [...parts, target].join('.');
}

/**
 * 获取从 root->leaf 的路径数组。
 */
export function pathChain(path: string): string[] {
  return ancestorsFromRoot(path);
}

export function assertMachineWellFormed<C, E extends EventObject>(m: Machine<C, E>) {
  const root = m.id;
  if (!m.nodes[root]) throw new Error(`missing root node: ${root}`);
  for (const k of Object.keys(m.nodes)) {
    const n = m.nodes[k];
    if (n.parent && !m.nodes[n.parent]) throw new Error(`missing parent for ${k}: ${n.parent}`);
    if (!splitPath(k).length) throw new Error(`invalid empty path node key: ${k}`);
  }

  // initial leaf must exist
  if (!m.nodes[m.initial]) throw new Error(`initial leaf not found: ${m.initial}`);

  // initial chain sanity for each node that has initialChild
  for (const k of Object.keys(m.nodes)) {
    const n = m.nodes[k];
    if (!n.initialChild) continue;
    const childPath = `${k}.${n.initialChild}`;
    if (!m.nodes[childPath]) throw new Error(`node ${k} initialChild points to missing child ${childPath}`);
  }
}
