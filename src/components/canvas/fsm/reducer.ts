// 画布交互 FSM：纯 reducer/transition（不直接操作 React state）
// 设计：reducer 只负责计算 nextState/nextContext，并产出 commands 给外层执行。

import type { CanvasFsmCommand, CanvasInteractionContext, CanvasInteractionEvent, CanvasInteractionState } from './types'

export type CanvasFsmStepResult = {
  state: CanvasInteractionState
  ctx: CanvasInteractionContext
  commands: CanvasFsmCommand[]
}

export function canvasFsmStep(
  state: CanvasInteractionState,
  ctx: CanvasInteractionContext,
  ev: CanvasInteractionEvent,
): CanvasFsmStepResult {
  const commands: CanvasFsmCommand[] = []

  switch (ev.kind) {
    case 'SET_LINK_MODE': {
      const nextCtx: CanvasInteractionContext = {
        ...ctx,
        modes: {
          ...ctx.modes,
          isLinkMode: ev.isLinkMode,
          linkFromId: ev.isLinkMode ? ctx.modes.linkFromId : null,
        },
      }
      return { state, ctx: nextCtx, commands }
    }

    case 'SET_LINK_FROM': {
      return { state, ctx: { ...ctx, modes: { ...ctx.modes, linkFromId: ev.linkFromId } }, commands }
    }

    case 'HOVER_PORT_SET': {
      return { state, ctx: { ...ctx, hoverPort: ev.hover }, commands }
    }

    case 'SELECTION_BOX_CLEAR': {
      commands.push({ kind: 'SET_SELECTION_BOX', box: null })
      return { state, ctx: { ...ctx, selectionBox: null }, commands }
    }

    case 'EDGE_DRAG_START': {
      commands.push({ kind: 'SET_HOVER_PORT', hover: null })
      return {
        state: {
          tag: 'draggingEdge',
          pointerId: ev.pointerId,
          fromId: ev.fromId,
          fromPort: ev.fromPort,
          toId: null,
          toPort: null,
          pointerWorld: ev.pointerWorld,
        },
        ctx: { ...ctx, hoverPort: null },
        commands,
      }
    }

    case 'CANVAS_POINTER_DOWN': {
      if (ctx.modes.isLinkMode && (ev.pointer.button ?? 0) === 0) {
        return {
          state: { tag: 'idle' },
          ctx: { ...ctx, modes: { ...ctx.modes, linkFromId: null } },
          commands,
        }
      }

      if ((ev.pointer.button ?? 0) === 0 && !ctx.modes.isLinkMode) {
        const box = { start: ev.screen, end: ev.screen }
        commands.push({ kind: 'SET_SELECTION_BOX', box })
        return {
          state: { tag: 'boxSelecting', start: ev.screen },
          ctx: { ...ctx, selectionBox: box },
          commands,
        }
      }

      return { state, ctx, commands }
    }

    case 'CANVAS_POINTER_MOVE': {
      if (state.tag === 'boxSelecting') {
        const box = { start: state.start, end: ev.screen }
        commands.push({ kind: 'SET_SELECTION_BOX', box })
        return {
          state,
          ctx: { ...ctx, selectionBox: box },
          commands,
        }
      }

      if (state.tag === 'draggingEdge' && state.pointerId === ev.pointer.pointerId) {
        return {
          state: { ...state, pointerWorld: ev.world },
          ctx,
          commands,
        }
      }

      return { state, ctx, commands }
    }

    case 'CANVAS_POINTER_UP_OR_CANCEL': {
      if (state.tag === 'boxSelecting') {
        commands.push({ kind: 'SET_SELECTION_BOX', box: null })
        return {
          state: { tag: 'idle' },
          ctx: { ...ctx, selectionBox: null },
          commands,
        }
      }

      if (state.tag === 'draggingEdge' && state.pointerId === ev.pointer.pointerId) {
        const target = ctx.hoverPort

        if (target && !(target.cellId === state.fromId && target.port === state.fromPort)) {
          commands.push({
            kind: 'ENSURE_EDGE',
            fromId: state.fromId,
            toId: target.cellId,
            fromPort: state.fromPort,
            toPort: target.port,
          })
          commands.push({ kind: 'PUSH_HISTORY', label: '创建连接' })
        }

        commands.push({ kind: 'SET_HOVER_PORT', hover: null })
        return {
          state: { tag: 'idle' },
          ctx: { ...ctx, hoverPort: null },
          commands,
        }
      }

      return { state, ctx, commands }
    }

    default: {
      return { state, ctx, commands }
    }
  }
}

