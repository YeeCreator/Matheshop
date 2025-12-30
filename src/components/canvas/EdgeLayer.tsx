import type React from 'react'
import type { CanvasEdge, CellId, CellNode, PortSide } from '../cellTypes'
import { collectCellWorldHits, findCellById } from './domain/cellTree'
import { worldToScreen, type Camera } from './utils/geometry'

export type EdgeLayerProps = {
  edges: CanvasEdge[]
  selectedEdgeId: string | null
  draggingEdge:
    | null
    | {
        fromId: CellId
        fromPort: PortSide
        toId: CellId | null
        toPort: PortSide | null
        pointerWorld: { x: number; y: number }
      }

  cells: CellNode[]
  camera: Camera

  canvasEl: HTMLCanvasElement | null
  wrapEl: HTMLDivElement | null

  getPortWorld: (cellId: CellId, port: PortSide, hits: ReturnType<typeof collectCellWorldHits>) => { x: number; y: number } | null

  onSelectEdge: (edgeId: string) => void
}

export default function EdgeLayer(props: EdgeLayerProps) {
  const { edges, selectedEdgeId, draggingEdge, cells, camera, canvasEl, wrapEl, getPortWorld, onSelectEdge } = props

  if (!canvasEl || !wrapEl) return null

  const rect = wrapEl.getBoundingClientRect()
  const hits = collectCellWorldHits(cells)

  const worldToCss = (world: { x: number; y: number }) => {
    const screenPx = worldToScreen(world, camera)
    return {
      x: (screenPx.x / canvasEl.width) * rect.width,
      y: (screenPx.y / canvasEl.height) * rect.height,
    }
  }

  const portOrCenter = (cellId: CellId, port: PortSide | undefined) => {
    const n = findCellById(cells, cellId)
    const hit = hits.find((h) => h.id === cellId)
    if (!n || !hit) return null

    if (port) {
      const pw = getPortWorld(cellId, port, hits)
      if (!pw) return null
      return pw
    }
    return { x: hit.world.x + n.size.w / 2, y: hit.world.y + n.size.h / 2 }
  }

  const makeCurveD = (aCss: { x: number; y: number }, bCss: { x: number; y: number }) => {
    const dx = bCss.x - aCss.x
    const dy = bCss.y - aCss.y
    const c1 = { x: aCss.x + dx * 0.25, y: aCss.y + dy * 0.0 }
    const c2 = { x: aCss.x + dx * 0.75, y: aCss.y + dy * 1.0 }
    return `M ${aCss.x} ${aCss.y} C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${bCss.x} ${bCss.y}`
  }

  const edgePaths = edges
    .map((e) => {
      const aW = portOrCenter(e.from, e.fromPort)
      const bW = portOrCenter(e.to, e.toPort)
      if (!aW || !bW) return null
      const a = worldToCss(aW)
      const b = worldToCss(bW)
      const d = makeCurveD(a, b)
      const isSelected = selectedEdgeId === e.id

      return (
        <path
          key={e.id}
          d={d}
          className={`edge-path${isSelected ? ' is-selected' : ''}`}
          onPointerDown={(ev: React.PointerEvent<SVGPathElement>) => {
            // 允许选中边（edge-layer pointer-events 需在 CSS 里打开）
            ev.preventDefault()
            ev.stopPropagation()
            onSelectEdge(e.id)
          }}
        />
      )
    })
    .filter(Boolean)

  const preview = (() => {
    const d = draggingEdge
    if (!d) return null

    const aW = getPortWorld(d.fromId, d.fromPort, hits)
    if (!aW) return null

    const bW = d.toId && d.toPort ? getPortWorld(d.toId, d.toPort, hits) : d.pointerWorld
    if (!bW) return null

    const a = worldToCss(aW)
    const b = worldToCss(bW)
    const dd = makeCurveD(a, b)
    return <path d={dd} className="edge-path edge-path-preview" />
  })()

  return (
    <svg className="edge-layer" width="100%" height="100%">
      {edgePaths}
      {preview}
    </svg>
  )
}

