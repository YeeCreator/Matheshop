/**
 * edges.ts
 *
 * 与连线（edge）相关的领域逻辑（纯函数）：
 * - ensureEdgeUnique：确保边在集合中唯一（考虑无向等价：A->B 与 B->A 视为重复，且端口对称）
 * - getPortWorld：计算 cell 某侧端口在 world 坐标下的位置（基于 hit.world 与 cell size）
 * - pickNearestPort：根据 pointerWorld 在一定吸附半径内挑选最近端口（带 pad 命中范围）
 *
 * 注意：
 * - 这些函数依赖 collectCellWorldHits/findCellById 提供的节点 world 命中信息。
 * - 吸附距离/边距（margin/pad/snapDist）为 UI 体验参数。
 */
import type { CellId, CellNode, PortSide } from '../../cellTypes'
import { collectCellWorldHits, findCellById } from './cellTree'

export function ensureEdgeUnique(
  prev: Array<{ from: CellId; to: CellId; fromPort?: PortSide; toPort?: PortSide }>,
  args: { from: CellId; to: CellId; fromPort?: PortSide; toPort?: PortSide },
) {
  const { from, to, fromPort, toPort } = args
  if (from === to) return prev

  const exists = prev.some(
    (e) =>
      (e.from === from && e.to === to && e.fromPort === fromPort && e.toPort === toPort) ||
      (e.from === to && e.to === from && e.fromPort === toPort && e.toPort === fromPort),
  )
  if (exists) return prev
  return [...prev, { ...args }]
}

export function getPortWorld(args: {
  cells: CellNode[]
  hits: ReturnType<typeof collectCellWorldHits>
  cellId: CellId
  port: PortSide
}): { x: number; y: number } | null {
  const { cells, hits, cellId, port } = args
  const hit = hits.find((h) => h.id === cellId)
  const n = findCellById(cells, cellId)
  if (!n || !hit) return null

  const margin = 10
  const x0 = hit.world.x
  const y0 = hit.world.y
  const w = n.size.w
  const h = n.size.h

  if (port === 'n') return { x: x0 + w / 2, y: y0 + margin }
  if (port === 's') return { x: x0 + w / 2, y: y0 + h - margin }
  if (port === 'w') return { x: x0 + margin, y: y0 + h / 2 }
  return { x: x0 + w - margin, y: y0 + h / 2 }
}

export function pickNearestPort(args: {
  cells: CellNode[]
  pointerWorld: { x: number; y: number }
}): { cellId: CellId; port: PortSide } | null {
  const { cells, pointerWorld } = args

  const hits = collectCellWorldHits(cells)
  const ports: PortSide[] = ['n', 'e', 's', 'w']
  let best: { cellId: CellId; port: PortSide; dist2: number } | null = null

  for (const h of hits) {
    const n = findCellById(cells, h.id)
    if (!n) continue

    const pad = 24
    const inPad =
      pointerWorld.x >= h.rect.x - pad &&
      pointerWorld.x <= h.rect.x + h.rect.w + pad &&
      pointerWorld.y >= h.rect.y - pad &&
      pointerWorld.y <= h.rect.y + h.rect.h + pad
    if (!inPad) continue

    for (const p of ports) {
      const pw = getPortWorld({ cells, hits, cellId: h.id, port: p })
      if (!pw) continue
      const dx = pw.x - pointerWorld.x
      const dy = pw.y - pointerWorld.y
      const d2 = dx * dx + dy * dy
      if (best == null || d2 < best.dist2) best = { cellId: h.id, port: p, dist2: d2 }
    }
  }

  const snapDist = 26
  if (!best || best.dist2 > snapDist * snapDist) return null
  return { cellId: best.cellId, port: best.port }
}
