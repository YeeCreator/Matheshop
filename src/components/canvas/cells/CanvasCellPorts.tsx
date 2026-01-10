import React from 'react'
import type { CellId, PortSide } from '../../cellTypes'
import type { Camera } from '../utils/geometry'
import { getCanvasScreenPoint, screenToWorld } from '../utils/geometry'

export type CanvasCellPortsProps = {
  cellId: CellId
  cellSize: { w: number; h: number }

  camera: Camera
  canvasRefForPointerCapture: React.MutableRefObject<HTMLCanvasElement | null>

  hoverPort: null | { cellId: CellId; port: PortSide }
  setHoverPort: (v: null | { cellId: CellId; port: PortSide }) => void

  draggingEdgeRef: React.MutableRefObject<
    | null
    | {
        pointerId: number
        fromId: CellId
        fromPort: PortSide
        toId: CellId | null
        toPort: PortSide | null
        pointerWorld: { x: number; y: number }
      }
  >

  scheduleRender: () => void
}

export default function CanvasCellPorts(props: CanvasCellPortsProps) {
  const {
    cellId,
    cellSize,
    camera,
    canvasRefForPointerCapture,
    hoverPort,
    setHoverPort,
    draggingEdgeRef,
    scheduleRender,
  } = props

  const ports: Array<{ port: PortSide; x: number; y: number }> = [
    { port: 'n', x: cellSize.w / 2, y: 8 },
    { port: 'e', x: cellSize.w - 8, y: cellSize.h / 2 },
    { port: 's', x: cellSize.w / 2, y: cellSize.h - 8 },
    { port: 'w', x: 8, y: cellSize.h / 2 },
  ]

  return (
    <div className="cell-ports">
      {ports.map((p) => {
        const isHover = hoverPort?.cellId === cellId && hoverPort.port === p.port
        return (
          <div
            key={p.port}
            className={`cell-port${isHover ? ' is-hover' : ''}`}
            style={{ left: p.x, top: p.y }}
            onPointerDown={(ev) => {
              ev.preventDefault()
              ev.stopPropagation()

              const canvasEl = canvasRefForPointerCapture.current
              if (!canvasEl) return

              canvasEl.setPointerCapture(ev.pointerId)

              const screen = getCanvasScreenPoint(canvasEl, ev.clientX, ev.clientY)
              const world = screenToWorld(screen, camera)

              draggingEdgeRef.current = {
                pointerId: ev.pointerId,
                fromId: cellId,
                fromPort: p.port,
                toId: null,
                toPort: null,
                pointerWorld: world,
              }

              setHoverPort(null)
              scheduleRender()
            }}
          />
        )
      })}
    </div>
  )
}
