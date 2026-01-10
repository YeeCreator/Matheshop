// 画布交互 FSM：基础类型定义（可渐进迁移）
// 说明：这里的“状态”用于表达互斥的主交互；“上下文”用于保存跨状态共享的数据。

import type { CellId, PortSide } from '../../cellTypes'
import type { Camera } from '../utils/geometry'

export type CanvasPointer = {
  pointerId: number
  button?: number
  buttons?: number
  shiftKey?: boolean
  altKey?: boolean
  ctrlKey?: boolean
  metaKey?: boolean
}

export type ScreenPoint = { x: number; y: number }
export type WorldPoint = { x: number; y: number }

export type HoverPort = { cellId: CellId; port: PortSide }

export type InteractionModeFlags = {
  isLinkMode: boolean
  linkFromId: CellId | null
}

export type CanvasSelection = {
  selectedCellId: CellId | null
  selectedEdgeId: string | null
  selectedFormulaId: string | null
  /** 多选：用于多选拖动等 */
  multiSelectedIds: CellId[]
}

export type CanvasInteractionContext = {
  camera: Camera
  selection: CanvasSelection
  modes: InteractionModeFlags
  hoverPort: HoverPort | null
  /** 框选（screen 坐标） */
  selectionBox: null | { start: ScreenPoint; end: ScreenPoint }
  /** 拖拽阈值等参数 */
  thresholds: {
    dragStartThresholdPx: number
    dragHoldMs: number
  }
}

export type CanvasInteractionState =
  | { tag: 'idle' }
  | { tag: 'boxSelecting'; start: ScreenPoint }
  | {
      tag: 'draggingEdge'
      pointerId: number
      fromId: CellId
      fromPort: PortSide
      toId: CellId | null
      toPort: PortSide | null
      pointerWorld: WorldPoint
    }

export type CanvasInteractionEvent =
  | {
      kind: 'CANVAS_POINTER_DOWN'
      pointer: CanvasPointer
      screen: ScreenPoint
      world: WorldPoint
    }
  | {
      kind: 'CANVAS_POINTER_MOVE'
      pointer: CanvasPointer
      screen: ScreenPoint
      world: WorldPoint
    }
  | {
      kind: 'CANVAS_POINTER_UP_OR_CANCEL'
      pointer: CanvasPointer
      screen: ScreenPoint
      world: WorldPoint
    }
  | {
      kind: 'SET_LINK_MODE'
      isLinkMode: boolean
    }
  | {
      kind: 'SET_LINK_FROM'
      linkFromId: CellId | null
    }
  | {
      kind: 'EDGE_DRAG_START'
      pointerId: number
      fromId: CellId
      fromPort: PortSide
      pointerWorld: WorldPoint
    }
  | { kind: 'HOVER_PORT_SET'; hover: HoverPort | null }
  | { kind: 'SELECTION_BOX_CLEAR' }

export type CanvasFsmCommand =
  | { kind: 'SET_SELECTION_BOX'; box: null | { start: ScreenPoint; end: ScreenPoint } }
  | { kind: 'SET_HOVER_PORT'; hover: HoverPort | null }
  | { kind: 'ENSURE_EDGE'; fromId: CellId; toId: CellId; fromPort?: PortSide; toPort?: PortSide }
  | { kind: 'PUSH_HISTORY'; label: string }
