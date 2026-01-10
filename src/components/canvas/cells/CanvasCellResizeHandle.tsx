import React from 'react'
import type { CellNode } from '../../cellTypes'
import type { Camera } from '../utils/geometry'
import { screenToWorld } from '../utils/geometry'

export type CanvasCellResizeHandleProps = {
  cell: CellNode
  isVisible: boolean

  camera: Camera
  canvasRefForPointerCapture: React.MutableRefObject<HTMLCanvasElement | null>

  resizingCellRef: React.MutableRefObject<
    | null
    | {
        id: string
        pointerId: number
        startWorld: { x: number; y: number }
        startSize: { w: number; h: number }
        aspect: number
      }
  >
}

export default function CanvasCellResizeHandle(props: CanvasCellResizeHandleProps) {
  const { cell, isVisible, camera, canvasRefForPointerCapture, resizingCellRef } = props

  if (!isVisible) return null

  return (
    <div
      className="cell-resize-handle"
      style={{ left: cell.size.w - 10, top: cell.size.h - 10 }}
      onPointerDown={(ev) => {
        ev.preventDefault()
        ev.stopPropagation()

        const canvasEl = canvasRefForPointerCapture.current
        if (!canvasEl) return

        const wrap = canvasEl.parentElement?.parentElement as HTMLDivElement | null
        // 结构约定：canvasEl 在 `.canvas-workspace` 内，而 workspace 在 `.canvas-wrap` 内。
        // 这里不依赖 className，只按当前 DOM 层级取 wrap；若未来结构调整，应把 wrapEl 作为显式 prop 传入。

        if (!wrap) return

        canvasEl.setPointerCapture(ev.pointerId)

        const wrapRect = wrap.getBoundingClientRect()
        const canvasRect = canvasEl.getBoundingClientRect()

        const xCssInWorkspace = ev.clientX - wrapRect.left + wrap.scrollLeft
        const yCssInWorkspace = ev.clientY - wrapRect.top + wrap.scrollTop

        const screen = {
          x: (xCssInWorkspace / canvasRect.width) * canvasEl.width,
          y: (yCssInWorkspace / canvasRect.height) * canvasEl.height,
        }

        const world = screenToWorld(screen, camera)

        resizingCellRef.current = {
          id: cell.id,
          pointerId: ev.pointerId,
          startWorld: world,
          startSize: { ...cell.size },
          aspect: cell.size.w / Math.max(1, cell.size.h),
        }
      }}
      title="拖拽缩放（Shift 锁定比例）"
    />
  )
}
