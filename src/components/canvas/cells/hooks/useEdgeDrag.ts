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

