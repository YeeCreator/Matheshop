/**
 * useCanvasFsm.ts
 *
 * 画布交互 FSM 的 React 适配层：
 * - 通过 useReducer 驱动 state/ctx 的演进；
 * - 每次 dispatch 前合并外部最新 camera（用于坐标换算一致性）及外部 selection/modes（渐进迁移期对齐）；
 * - reducer 产出的 commands 通过 onCommands 回调交由 CanvasBoard 执行（副作用落地层）。
 *
 * 目标：
 * - 将 CanvasBoard 中分散的互斥交互逻辑逐步迁移到 FSM，同时保持现有外部 state 不被强制重构。
 */

import { useCallback, useMemo, useReducer } from 'react'
import type { Camera } from '../utils/geometry'
import type { CellId } from '../../cellTypes'
import type { CanvasFsmCommand, CanvasInteractionContext, CanvasInteractionEvent, CanvasInteractionState } from './types'
import { canvasFsmStep } from './reducer'

export type CanvasFsmModel = {
  state: CanvasInteractionState
  ctx: CanvasInteractionContext
}

type CanvasFsmAction = CanvasInteractionEvent

function makeInitialContext(args: {
  camera: Camera
  dragStartThresholdPx?: number
  dragHoldMs?: number
}): CanvasInteractionContext {
  return {
    camera: args.camera,
    selection: {
      selectedCellId: null,
      selectedEdgeId: null,
      selectedFormulaId: null,
      multiSelectedIds: [],
    },
    modes: {
      isLinkMode: false,
      linkFromId: null,
    },
    hoverPort: null,
    selectionBox: null,
    thresholds: {
      dragStartThresholdPx: args.dragStartThresholdPx ?? 4,
      dragHoldMs: args.dragHoldMs ?? 150,
    },
  }
}

export function useCanvasFsm(args: {
  camera: Camera
  getFreshCamera: () => Camera
  onCommands: (cmds: CanvasFsmCommand[]) => void
  /** 用于把外部 selection 与 FSM 对齐（渐进迁移期可不传） */
  externalSelectedCellId?: CellId | null
  externalSelectedEdgeId?: string | null
  externalSelectedFormulaId?: string | null
  externalMultiSelectedIds?: CellId[]
  externalIsLinkMode?: boolean
  externalLinkFromId?: CellId | null
}) {
  const initCtx = useMemo(() => makeInitialContext({ camera: args.camera }), [args.camera])

  const [model, dispatchBase] = useReducer(
    (cur: CanvasFsmModel, action: CanvasFsmAction): CanvasFsmModel => {
      // 合并当前相机（相机由外部更新；FSM 只是引用用于屏幕/世界换算一致性）
      const mergedCtx: CanvasInteractionContext = {
        ...cur.ctx,
        camera: args.getFreshCamera(),
        selection: {
          ...cur.ctx.selection,
          selectedCellId: args.externalSelectedCellId ?? cur.ctx.selection.selectedCellId,
          selectedEdgeId: args.externalSelectedEdgeId ?? cur.ctx.selection.selectedEdgeId,
          selectedFormulaId: args.externalSelectedFormulaId ?? cur.ctx.selection.selectedFormulaId,
          multiSelectedIds: args.externalMultiSelectedIds ?? cur.ctx.selection.multiSelectedIds,
        },
        modes: {
          ...cur.ctx.modes,
          isLinkMode: args.externalIsLinkMode ?? cur.ctx.modes.isLinkMode,
          linkFromId: args.externalLinkFromId ?? cur.ctx.modes.linkFromId,
        },
      }

      const res = canvasFsmStep(cur.state, mergedCtx, action)
      if (res.commands.length > 0) args.onCommands(res.commands)
      return { state: res.state, ctx: res.ctx }
    },
    { state: { tag: 'idle' }, ctx: initCtx },
  )

  const dispatch = useCallback(
    (ev: CanvasInteractionEvent) => {
      dispatchBase(ev)
    },
    [dispatchBase],
  )

  return { model, dispatch }
}
