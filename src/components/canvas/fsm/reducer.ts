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

    case 'VIEWPORT_PAN_START': {
      commands.push({ kind: 'CAPTURE_POINTER', pointerId: ev.pointerId })
      return {
        state: { tag: 'panningViewport', pointerId: ev.pointerId, startScreen: ev.startScreen, startCam: ev.startCam },
        ctx,
        commands,
      }
    }

    case 'VIEWPORT_PAN_MOVE': {
      if (state.tag !== 'panningViewport' || state.pointerId !== ev.pointerId) return { state, ctx, commands }

      const dxScreen = ev.screen.x - state.startScreen.x
      const dyScreen = ev.screen.y - state.startScreen.y
      const cam = state.startCam

      commands.push({
        kind: 'SET_CAMERA',
        camera: {
          x: cam.x - dxScreen / cam.zoom,
          y: cam.y - dyScreen / cam.zoom,
          zoom: cam.zoom,
        },
      })

      return { state, ctx, commands }
    }

    case 'VIEWPORT_PAN_END': {
      if (state.tag !== 'panningViewport' || state.pointerId !== ev.pointerId) return { state, ctx, commands }
      commands.push({ kind: 'RELEASE_POINTER', pointerId: ev.pointerId })
      return { state: { tag: 'idle' }, ctx, commands }
    }

    case 'VIEWPORT_WHEEL': {
      const cam = ctx.camera
      const isZoomGesture = ev.ctrlKey || ev.metaKey

      // Shift + wheel：横向平移（保持历史行为）
      if (ev.shiftKey && !isZoomGesture) {
        commands.push({ kind: 'SET_CAMERA', camera: { ...cam, x: cam.x + ev.deltaY / cam.zoom } })
        return { state, ctx, commands }
      }

      // 平移（默认）
      if (!isZoomGesture) {
        commands.push({ kind: 'SET_CAMERA', camera: { ...cam, x: cam.x + ev.deltaX / cam.zoom, y: cam.y + ev.deltaY / cam.zoom } })
        return { state, ctx, commands }
      }

      // 缩放（以鼠标/手指位置为中心）
      const zoomIntensity = 0.0028
      const factor = Math.exp(-ev.deltaY * zoomIntensity)
      const nextZoom = Math.min(64, Math.max(0.08, cam.zoom * factor))

      commands.push({
        kind: 'SET_CAMERA',
        camera: {
          zoom: nextZoom,
          x: (cam.x + ev.screen.x / cam.zoom) - ev.screen.x / nextZoom,
          y: (cam.y + ev.screen.y / cam.zoom) - ev.screen.y / nextZoom,
        },
      })

      return { state, ctx, commands }
    }

    case 'CELL_DRAG_ARM': {
      return {
        state: {
          tag: 'draggingCell',
          pointerId: ev.pointerId,
          cellId: ev.cellId,
          startWorld: ev.startWorld,
          startScreen: ev.startScreen,
          startPos: ev.startPos,
          heldReady: false,
          movedReady: false,
          isDragging: false,
          didMove: false,
        },
        ctx,
        commands,
      }
    }

    case 'CELL_DRAG_HOLD_READY': {
      if (state.tag !== 'draggingCell' || state.pointerId !== ev.pointerId) return { state, ctx, commands }
      return { state: { ...state, heldReady: true }, ctx, commands }
    }

    case 'CELL_DRAG_MOVE': {
      if (state.tag !== 'draggingCell' || state.pointerId !== ev.pointerId) return { state, ctx, commands }

      // 进入拖拽前：必须同时满足“按住 >= hold”且“移动超过阈值”
      if (!state.isDragging) {
        const dx = ev.screen.x - state.startScreen.x
        const dy = ev.screen.y - state.startScreen.y
        const dist = Math.hypot(dx, dy)

        const movedReady = state.movedReady || dist >= ctx.thresholds.dragStartThresholdPx
        const shouldStart = movedReady && state.heldReady

        if (!shouldStart) {
          return { state: { ...state, movedReady }, ctx, commands }
        }

        commands.push({ kind: 'CAPTURE_POINTER', pointerId: ev.pointerId })

        // 进入拖拽后，继续用同一个 move 计算位置
        state = { ...state, movedReady, isDragging: true }
      }

      const dxWorld = ev.world.x - state.startWorld.x
      const dyWorld = ev.world.y - state.startWorld.y

      const nextPos = { x: state.startPos.x + dxWorld, y: state.startPos.y + dyWorld }
      commands.push({ kind: 'UPDATE_CELL_POS', cellId: state.cellId, localPos: nextPos })
      commands.push({ kind: 'CLEAR_DROP_HINT' })

      const didMove = state.didMove || Math.abs(dxWorld) > 0 || Math.abs(dyWorld) > 0
      return { state: { ...state, didMove }, ctx, commands }
    }

    case 'CELL_DRAG_END': {
      if (state.tag !== 'draggingCell' || state.pointerId !== ev.pointerId) return { state, ctx, commands }

      if (state.isDragging) {
        commands.push({ kind: 'RELEASE_POINTER', pointerId: ev.pointerId })
      }
      if (state.isDragging && state.didMove) {
        commands.push({ kind: 'PUSH_HISTORY', label: '移动单元框' })
      }
      return { state: { tag: 'idle' }, ctx, commands }
    }

    case 'CELL_RESIZE_START': {
      commands.push({ kind: 'CAPTURE_POINTER', pointerId: ev.pointerId })
      return {
        state: {
          tag: 'resizingCell',
          pointerId: ev.pointerId,
          cellId: ev.cellId,
          startWorld: ev.startWorld,
          startSize: ev.startSize,
          aspect: ev.aspect,
          startCenterWorld: ev.startCenterWorld,
        },
        ctx,
        commands,
      }
    }

    case 'CELL_RESIZE_MOVE': {
      if (state.tag !== 'resizingCell' || state.pointerId !== ev.pointerId) return { state, ctx, commands }

      const center = state.startCenterWorld
      const dxFromCenter = ev.world.x - center.x
      const dyFromCenter = ev.world.y - center.y

      let nextW = Math.max(40, Math.abs(dxFromCenter) * 2)
      let nextH = Math.max(28, Math.abs(dyFromCenter) * 2)

      if (ev.shiftKey) {
        const aspect = state.aspect > 0 ? state.aspect : 1
        if (Math.abs(dyFromCenter) >= Math.abs(dxFromCenter)) {
          nextW = nextH * aspect
        } else {
          nextH = nextW / aspect
        }
      }

      // world 中心锚定：topLeft(world) = center - size/2
      const nextLocalPos = { x: center.x - nextW / 2, y: center.y - nextH / 2 }

      commands.push({
        kind: 'UPDATE_CELL_SIZE_CENTER_ANCHORED',
        cellId: state.cellId,
        size: { w: nextW, h: nextH },
        localPos: nextLocalPos,
      })

      return { state, ctx, commands }
    }

    case 'CELL_RESIZE_END': {
      if (state.tag !== 'resizingCell' || state.pointerId !== ev.pointerId) return { state, ctx, commands }
      commands.push({ kind: 'RELEASE_POINTER', pointerId: ev.pointerId })
      commands.push({ kind: 'PUSH_HISTORY', label: '缩放单元节点' })
      return { state: { tag: 'idle' }, ctx, commands }
    }

    default: {
      return { state, ctx, commands }
    }
  }
}

