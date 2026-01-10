import type React from 'react'
import type { CellNode } from '../../../cellTypes'

export type UseCellDragArgs = {
  dragStartTimerRef: React.MutableRefObject<number | null>
  draggingCellPointerDown: (args: {
    ev: React.PointerEvent
    cell: CellNode
    parentWorld: { x: number; y: number }
    screen: { x: number; y: number }
    world: { x: number; y: number }
  }) => void
}

export function useCellDrag(args: UseCellDragArgs) {
  const { dragStartTimerRef, draggingCellPointerDown } = args

  const clearDragStartTimer = () => {
    if (dragStartTimerRef.current != null) {
      window.clearTimeout(dragStartTimerRef.current)
      dragStartTimerRef.current = null
    }
  }

  const startCellDrag = (payload: {
    ev: React.PointerEvent
    cell: CellNode
    parentWorld: { x: number; y: number }
    screen: { x: number; y: number }
    world: { x: number; y: number }
  }) => {
    clearDragStartTimer()
    draggingCellPointerDown(payload)
  }

  return { clearDragStartTimer, startCellDrag }
}

