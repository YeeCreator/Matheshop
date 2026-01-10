import React from 'react'
import type { CellNode } from '../../cellTypes'
import type { Camera } from '../utils/geometry'
import { getCanvasScreenPoint, screenToWorld } from '../utils/geometry'

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

        canvasEl.setPointerCapture(ev.pointerId)
        const screen = getCanvasScreenPoint(canvasEl, ev.clientX, ev.clientY)
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

