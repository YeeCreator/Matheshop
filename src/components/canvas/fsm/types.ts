/**
 * types.ts
 *
 * 画布交互 FSM 的类型/协议定义：
 * - State：描述互斥的“主交互状态”（idle/框选/平移/拖拽 cell/缩放 cell/拖拽连线等）
 * - Context：保存跨状态共享的数据（camera、selection、modes、hoverPort、selectionBox、阈值参数等）
 * - Event：UI 层输入抽象（pointer/wheel/模式切换）
 * - Command：reducer 产出的“副作用协议”，由外层（CanvasBoard）执行以落地到 React state/DOM。
 *
 * 坐标约定：
 * - ScreenPoint：canvas 像素坐标（受 DPR 影响）
 * - WorldPoint：画布逻辑坐标（受 camera 影响）
 * - LocalPoint：节点相对父节点的局部坐标（用于存储 cell.localPos）
 */

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

export type LocalPoint = { x: number; y: number }

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
      tag: 'panningViewport'
      pointerId: number
      startScreen: ScreenPoint
      startCam: Camera
    }
  | {
      tag: 'draggingCell'
      pointerId: number
      cellId: CellId
      startWorld: WorldPoint
      startScreen: ScreenPoint
      startPos: LocalPoint
      heldReady: boolean
      movedReady: boolean
      isDragging: boolean
      didMove: boolean
    }
  | {
      tag: 'resizingCell'
      pointerId: number
      cellId: CellId
      startWorld: WorldPoint
      startSize: { w: number; h: number }
      aspect: number
      /** 固定中心锚点（world），用于中心对称缩放 */
      startCenterWorld: WorldPoint
      /** 拖拽开始时：指针相对“右下角(handle) world 坐标”的偏移，用于消除起步跳变 */
      startPointerOffsetFromCornerWorld: WorldPoint
      /** 拖拽开始时：cell 右下角（corner）在 world 中的坐标 */
      startCornerWorld: WorldPoint
    }
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
      kind: 'VIEWPORT_PAN_START'
      pointerId: number
      startScreen: ScreenPoint
      startCam: Camera
    }
  | {
      kind: 'VIEWPORT_PAN_MOVE'
      pointerId: number
      screen: ScreenPoint
    }
  | { kind: 'VIEWPORT_PAN_END'; pointerId: number }
  | {
      kind: 'VIEWPORT_WHEEL'
      screen: ScreenPoint
      deltaX: number
      deltaY: number
      shiftKey: boolean
      ctrlKey: boolean
      metaKey: boolean
    }
  | {
      kind: 'CELL_DRAG_ARM'
      pointerId: number
      cellId: CellId
      startWorld: WorldPoint
      startScreen: ScreenPoint
      startPos: LocalPoint
    }
  | { kind: 'CELL_DRAG_HOLD_READY'; pointerId: number }
  | {
      kind: 'CELL_DRAG_MOVE'
      pointerId: number
      screen: ScreenPoint
      world: WorldPoint
    }
  | { kind: 'CELL_DRAG_END'; pointerId: number }
  | {
      kind: 'CELL_RESIZE_START'
      pointerId: number
      cellId: CellId
      startWorld: WorldPoint
      startSize: { w: number; h: number }
      aspect: number
      /** 固定中心锚点（world）。由 UI 层在 resize 开始时计算并传入 */
      startCenterWorld: WorldPoint
      /** 指针相对右下角(handle)的 world 偏移 */
      startPointerOffsetFromCornerWorld: WorldPoint
      /** 拖拽开始时：cell 右下角（corner）在 world 中的坐标 */
      startCornerWorld: WorldPoint
    }
  | {
      kind: 'CELL_RESIZE_MOVE'
      pointerId: number
      world: WorldPoint
      shiftKey: boolean
    }
  | { kind: 'CELL_RESIZE_END'; pointerId: number }
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
  | { kind: 'SET_CAMERA'; camera: Camera }
  | { kind: 'CAPTURE_POINTER'; pointerId: number }
  | { kind: 'RELEASE_POINTER'; pointerId: number }
  | { kind: 'CLEAR_DROP_HINT' }
  | { kind: 'UPDATE_CELL_POS'; cellId: CellId; localPos: LocalPoint }
  | {
      kind: 'UPDATE_CELL_SIZE_CENTER_ANCHORED'
      cellId: CellId
      size: { w: number; h: number }
      /** resize 以世界坐标中心锚定后，直接计算得到新的 localPos（左上角，相对 parent） */
      localPos: LocalPoint
    }
  | { kind: 'PUSH_HISTORY'; label: string }
