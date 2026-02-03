/**
 * useCellDrag.ts
 *
 * cell 拖拽相关的轻量 hook：
 * - 统一管理“拖拽启动计时器”的清理（避免重复触发/悬挂 timer）
 * - 提供 startCellDrag：在清理 timer 后调用上层注入的 draggingCellPointerDown 进入拖拽流程
 *
 * 说明：该 hook 不持有业务状态，仅封装流程与副作用（clearTimeout）。
 */
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
