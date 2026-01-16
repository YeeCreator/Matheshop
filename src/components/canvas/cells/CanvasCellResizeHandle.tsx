/**
 * CanvasCellResizeHandle
 *
 * cell 右下角缩放把手：
 * - `isVisible` 为 false 时不渲染；
 * - PointerDown 时将 client 坐标换算为 canvas screen 再换算为 world，用于后续 resize 计算；
 * - 若传入 `onResizeStart`，则把 resize 起始信息交给上层（CanvasBoard）接管；否则走兼容逻辑：在 canvas 上 pointer capture，并写入 `resizingCellRef`。
 *
 * 备注：`startCenterWorld` 由上层 CanvasCell 计算传入，用于以中心点为基准的缩放/约束策略。
 */
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

  /** 由上层接管 resize 起点与后续 move/up 处理 */
  onResizeStart?: (args: {
    pointerId: number
    cellId: string
    startWorld: { x: number; y: number }
    startSize: { w: number; h: number }
    aspect: number
    startCenterWorld: { x: number; y: number }
  }) => void

  /** 画布视口容器（用于正确的坐标换算） */
  wrapEl: HTMLDivElement | null

  /** cell 中心点 world（由上层 CanvasCell 计算传入） */
  startCenterWorld: { x: number; y: number }
}

export default function CanvasCellResizeHandle(props: CanvasCellResizeHandleProps) {
  const { cell, isVisible, camera, canvasRefForPointerCapture, resizingCellRef, onResizeStart, wrapEl, startCenterWorld } = props

  if (!isVisible) return null

  return (
    <div
      className="cell-resize-handle"
      style={{ left: cell.size.w - 10, top: cell.size.h - 10 }}
      onPointerDown={(ev) => {
        ev.preventDefault()
        ev.stopPropagation()

        const canvasEl = canvasRefForPointerCapture.current
        const wrap = wrapEl
        if (!canvasEl || !wrap) return

        const wrapRect = wrap.getBoundingClientRect()
        const canvasRect = canvasEl.getBoundingClientRect()

        const xCssInWorkspace = ev.clientX - wrapRect.left + wrap.scrollLeft
        const yCssInWorkspace = ev.clientY - wrapRect.top + wrap.scrollTop

        const screen = {
          x: (xCssInWorkspace / canvasRect.width) * canvasEl.width,
          y: (yCssInWorkspace / canvasRect.height) * canvasEl.height,
        }

        const world = screenToWorld(screen, camera)

        const payload = {
          pointerId: ev.pointerId,
          cellId: cell.id,
          startWorld: world,
          startSize: { ...cell.size },
          aspect: cell.size.w / Math.max(1, cell.size.h),
          startCenterWorld,
        }

        // 交给上层处理
        if (onResizeStart) {
          onResizeStart(payload)
          return
        }

        // 兼容：未传入回调时，保持旧逻辑
        canvasEl.setPointerCapture(ev.pointerId)

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
