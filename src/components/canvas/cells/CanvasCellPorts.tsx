/**
 * CanvasCellPorts
 *
 * 渲染 cell 四个方向的连接端口（n/e/s/w）并处理连线拖拽起点：
 * - 端口位置基于 `cellSize` 计算（相对 cell 左上角的局部坐标）；
 * - hover 状态由上层维护（`hoverPort` / `setHoverPort`）；
 * - PointerDown 时：
 *   1) 在 canvas 上进行 pointer capture，保证拖拽过程中持续接收事件；
 *   2) 将浏览器 client 坐标换算为 canvas screen 坐标（考虑 wrap 滚动）；
 *   3) 再将 screen 坐标转换为 world 坐标，写入 `draggingEdgeRef`，由上层渲染连线/命中测试。
 */
import React from 'react'
import type { CellId, PortSide } from '../../cellTypes'
import type { Camera2D } from 'viewport-kit/core'
import { clientToLocalCssPoint, localCssToWorld } from 'viewport-kit/core'

export type CanvasCellPortsProps = {
  cellId: CellId
  cellSize: { w: number; h: number }

  camera: Camera2D
  canvasRefForPointerCapture: React.MutableRefObject<HTMLCanvasElement | null>
  /** 画布视口容器（用于正确的坐标换算） */
  wrapEl: HTMLDivElement | null

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
    wrapEl,
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

              const wrap = wrapEl
              if (!wrap) return
              const screen = clientToLocalCssPoint(wrap, ev.clientX, ev.clientY)

              const world = localCssToWorld(camera, screen)

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
