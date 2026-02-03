/**
 * cellTree.ts
 *
 * Canvas 中 CellNode 树结构的纯函数工具集：
 * - 递归查找/更新/删除节点（按 id）
 * - 计算每个节点在 world 坐标系下的位置与矩形（用于命中测试）
 * - 拖拽 drop 父节点选择（禁止 drop 到自身或自身子树）
 * - 重算整棵树的 worldPos（从父节点 world 累加 localPos）
 *
 * 约定：
 * - world 坐标为画布逻辑坐标（与 camera 变换配套），与 DOM/CSS 像素不同。
 * - group 节点在 collapsed 时，其子树不参与命中收集。
 */
import type { CellNode } from '../../cellTypes'

export type CellWorldHit = {
  id: string
  parentId: string | null
  depth: number
  world: { x: number; y: number }
  rect: { x: number; y: number; w: number; h: number }
}

export function findCellById(list: CellNode[], id: string): CellNode | null {
  for (const c of list) {
    if (c.id === id) return c
    const hit = findCellById(c.children, id)
    if (hit) return hit
  }
  return null
}

export function updateCellById(list: CellNode[], id: string, updater: (c: CellNode) => CellNode): CellNode[] {
  return list.map((c) => {
    if (c.id === id) return updater(c)
    if (c.children.length === 0) return c
    return { ...c, children: updateCellById(c.children, id, updater) }
  })
}

export function removeCellById(list: CellNode[], id: string): { next: CellNode[]; removed: CellNode | null } {
  let removed: CellNode | null = null

  const next = list
    .map((c) => {
      if (c.id === id) {
        removed = c
        return null
      }
      if (c.children.length === 0) return c
      const r = removeCellById(c.children, id)
      if (r.removed) removed = r.removed
      return { ...c, children: r.next }
    })
    .filter((x): x is CellNode => x != null)

  return { next, removed }
}

export function addChildToParent(list: CellNode[], parentId: string, child: CellNode): CellNode[] {
  return updateCellById(list, parentId, (p) => ({ ...p, children: [...p.children, child] }))
}

export function collectCellWorldHits(list: CellNode[]) {
  const hits: CellWorldHit[] = []

  const walk = (node: CellNode, parentWorld: { x: number; y: number }, depth: number) => {
    const world = { x: parentWorld.x + node.localPos.x, y: parentWorld.y + node.localPos.y }
    hits.push({
      id: node.id,
      parentId: node.parentId,
      depth,
      world,
      rect: { x: world.x, y: world.y, w: node.size.w, h: node.size.h },
    })

    if (node.kind === 'group' && node.collapsed) return
    for (const ch of node.children) walk(ch, world, depth + 1)
  }

  for (const root of list) walk(root, { x: 0, y: 0 }, 0)
  return hits
}

export function pickDropParentId(args: { cellsList: CellNode[]; draggedId: string; pointerWorld: { x: number; y: number } }) {
  const { cellsList, draggedId, pointerWorld } = args
  const hits = collectCellWorldHits(cellsList)

  // 不能 drop 到自己/自己的子树：先取 dragged 的 subtree ids
  const idToNode = new Map<string, CellNode>()
  const buildIndex = (nodes: CellNode[]) => {
    for (const n of nodes) {
      idToNode.set(n.id, n)
      buildIndex(n.children)
    }
  }
  buildIndex(cellsList)

  const banned = new Set<string>()
  const mark = (id: string) => {
    banned.add(id)
    const n = idToNode.get(id)
    if (!n) return
    for (const ch of n.children) mark(ch.id)
  }
  mark(draggedId)

  const inside = (r: { x: number; y: number; w: number; h: number }) => {
    return (
      pointerWorld.x >= r.x &&
      pointerWorld.x <= r.x + r.w &&
      pointerWorld.y >= r.y &&
      pointerWorld.y <= r.y + r.h
    )
  }

  const candidates = hits
    .filter((h) => !banned.has(h.id) && inside(h.rect))
    .sort((a, b) => b.depth - a.depth)

  return candidates[0]?.id ?? null
}

export function recomputeWorldForSubtree(node: CellNode, parentWorld: { x: number; y: number }): CellNode {
  const worldPos = { x: parentWorld.x + node.localPos.x, y: parentWorld.y + node.localPos.y }
  return {
    ...node,
    worldPos,
    children: node.children.map((ch) => recomputeWorldForSubtree(ch, worldPos)),
  }
}

export function recomputeWorldAll(list: CellNode[]) {
  return list.map((c) => recomputeWorldForSubtree(c, { x: 0, y: 0 }))
}
