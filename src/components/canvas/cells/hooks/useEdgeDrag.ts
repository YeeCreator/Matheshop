/**
 * useEdgeDrag.ts
 *
 * 连线拖拽（edge drag）状态的辅助 hook：
 * - draggingEdgeRef 持有当前拖拽边的临时状态（from/to/port/pointerWorld 等），用于渲染预览与命中判断；
 * - isDraggingEdge：判断当前是否处于拖拽连线中；
 * - resetDraggingEdge：清空拖拽状态并触发一次渲染（scheduleRender），用于 pointerup/cancel 收尾。
 *
 * 说明：采用 ref 可避免频繁 setState 导致的重渲染抖动；由调用方决定何时 scheduleRender。
 */
import type React from 'react'
import type { CellId, PortSide } from '../../../cellTypes'

export type DraggingEdgeState =
  | null
  | {
      pointerId: number
      fromId: CellId
      fromPort: PortSide
      toId: CellId | null
      toPort: PortSide | null
      pointerWorld: { x: number; y: number }
    }

export type UseEdgeDragArgs = {
  draggingEdgeRef: React.MutableRefObject<DraggingEdgeState>
  scheduleRender: () => void
}

export function useEdgeDrag(args: UseEdgeDragArgs) {
  const { draggingEdgeRef, scheduleRender } = args

  const isDraggingEdge = () => draggingEdgeRef.current != null

  const resetDraggingEdge = () => {
    draggingEdgeRef.current = null
    scheduleRender()
  }

  return { isDraggingEdge, resetDraggingEdge }
}
