import React from 'react'
import type { CellId, CellNode, PortSide } from '../../cellTypes'
import type { Camera } from '../utils/geometry'
import { getCanvasScreenPoint, screenToWorld } from '../utils/geometry'
import CanvasCellPorts from './CanvasCellPorts'
import CanvasCellResizeHandle from './CanvasCellResizeHandle'
import CanvasCellBody from './CanvasCellBody'
import type { InlineSelection } from '../exprSelection'

export type CanvasCellProps = {
  cell: CellNode
  depth: number

  cssRect: { left: number; top: number }

  parentWorld: { x: number; y: number }
  worldNow: { x: number; y: number }

  camera: Camera
  wrapEl: HTMLDivElement | null
  canvasRefForPointerCapture: React.MutableRefObject<HTMLCanvasElement | null>

  isSelected: boolean
  isEditing: boolean
  isDropHint: boolean

  headerLabel: string

  // content rendering
  htmlContent: string
  isPureArithExpr: boolean
  arithTokens: Array<{ text: string }> | null

  // ports / edges
  hoverPort: null | { cellId: CellId; port: PortSide }
  setHoverPort: (v: null | { cellId: CellId; port: PortSide }) => void
  draggingEdgeRef: React.MutableRefObject<
    | null
    | {
        pointerId: number
        fromId: CellId
        fromPort: PortSide
        toId: CellId | null
        toPort: PortSide | null
        pointerWorld: { x: number; y: number }
      }
  >

  // resizing
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

  // link mode
  isLinkMode: boolean
  linkFromId: CellId | null
  setLinkFromId: (v: CellId | null) => void
  ensureEdge: (from: CellId, to: CellId, fromPort?: PortSide, toPort?: PortSide) => void

  // selection / editing state
  editingCellId: string | null
  // selectedCellId 不在本组件内读取，避免无用依赖
  setSelectedCellId: (v: string | null) => void
  setEditingCellId: (v: string | null) => void

  // drag-start timer
  dragStartTimerRef: React.MutableRefObject<number | null>

  // drag begin
  draggingCellPointerDown: (args: {
    ev: React.PointerEvent
    cell: CellNode
    parentWorld: { x: number; y: number }
    screen: { x: number; y: number }
    world: { x: number; y: number }
  }) => void

  multiSelectedIds: string[]

  // editing commit
  commitCellEditing: (cellId: string, opts?: { runEval?: boolean }) => void
  estimateCellSizeFromText: (textRaw: string) => { w: number; h: number }
  setCells: React.Dispatch<React.SetStateAction<CellNode[]>>
  scheduleRender: () => void

  // token selection
  selectedExprToken: null | { cellId: string; tokenId: string }
  setSelectedExprToken: (v: null | { cellId: string; tokenId: string }) => void
  activeInlineEditor: null | {
    cellId: string
    selection: InlineSelection
    draft: string
    anchorCss: { left: number; top: number }
  }
  setActiveInlineEditor: React.Dispatch<React.SetStateAction<CanvasCellProps['activeInlineEditor']>>

  renderChild: (child: CellNode, depth: number, parentWorld: { x: number; y: number }) => React.ReactNode
}

export default function CanvasCell(props: CanvasCellProps) {
  const {
    cell: c,
    depth,
    cssRect,
    parentWorld,
    worldNow,
    camera,
    wrapEl,
    canvasRefForPointerCapture,
    isSelected,
    isEditing,
    isDropHint,
    headerLabel,
    htmlContent,
    isPureArithExpr,
    arithTokens,
    hoverPort,
    setHoverPort,
    draggingEdgeRef,
    resizingCellRef,
    isLinkMode,
    linkFromId,
    setLinkFromId,
    ensureEdge,
    editingCellId,
    setSelectedCellId,
    setEditingCellId,
    dragStartTimerRef,
    draggingCellPointerDown,
    multiSelectedIds,
    commitCellEditing,
    estimateCellSizeFromText,
    setCells,
    scheduleRender,
    selectedExprToken,
    setSelectedExprToken,
    activeInlineEditor,
    setActiveInlineEditor,
    renderChild,
  } = props

  return (
    <div
      key={c.id}
      className={`cell${isSelected ? ' is-selected' : ''}${isDropHint ? ' is-drop-hint' : ''}`}
      style={{ left: cssRect.left, top: cssRect.top, width: c.size.w, height: c.size.h }}
      onPointerDown={(ev) => {
        // 如果正在编辑别的 cell，点到这个 cell 视为“完成编辑”
        if (editingCellId && editingCellId !== c.id && ev.button === 0) {
          commitCellEditing(editingCellId)
        }

        const t = ev.target as HTMLElement | null
        const tag = t?.tagName?.toLowerCase()
        const isEditable = t instanceof HTMLElement ? t.isContentEditable : false

        if (tag === 'textarea' || tag === 'input' || isEditable) {
          ev.stopPropagation()
          return
        }

        ev.preventDefault()
        ev.stopPropagation()

        // 连线模式：点击节点选择起点/终点
        if (isLinkMode && ev.button === 0) {
          setSelectedCellId(c.id)
          if (linkFromId == null) {
            setLinkFromId(c.id)
          } else {
            ensureEdge(linkFromId, c.id)
            setLinkFromId(null)
          }
          scheduleRender()
          return
        }

        setSelectedCellId(c.id)

        if (ev.button !== 0) return

        // 拖拽启动的定时器由上层统一管理
        if (dragStartTimerRef.current != null) {
          window.clearTimeout(dragStartTimerRef.current)
          dragStartTimerRef.current = null
        }

        const canvasEl = canvasRefForPointerCapture.current
        if (!canvasEl) return

        const screen = getCanvasScreenPoint(canvasEl, ev.clientX, ev.clientY)
        const world = screenToWorld(screen, camera)

        draggingCellPointerDown({ ev, cell: c, parentWorld, screen, world })

        if (multiSelectedIds.length > 1 && multiSelectedIds.includes(c.id)) return
      }}
      onDoubleClick={(ev) => {
        ev.preventDefault()
        ev.stopPropagation()
        setSelectedCellId(c.id)
        setEditingCellId(c.id)
      }}
    >
      <CanvasCellPorts
        cellId={c.id}
        cellSize={c.size}
        camera={camera}
        canvasRefForPointerCapture={canvasRefForPointerCapture}
        hoverPort={hoverPort}
        setHoverPort={setHoverPort}
        draggingEdgeRef={draggingEdgeRef}
        scheduleRender={scheduleRender}
      />

      <CanvasCellResizeHandle
        cell={c}
        isVisible={isSelected}
        camera={camera}
        canvasRefForPointerCapture={canvasRefForPointerCapture}
        resizingCellRef={resizingCellRef}
      />

      {isSelected && (
        <div className="cell-header">
          <span className="cell-title">{headerLabel}</span>
          <span className="cell-depth" title="嵌套深度（调试）">
            #{depth}
          </span>
        </div>
      )}

      <CanvasCellBody
        cell={c}
        isEditing={isEditing}
        isLinkMode={isLinkMode}
        htmlContent={htmlContent}
        isPureArithExpr={isPureArithExpr}
        arithTokens={arithTokens}
        selectedExprToken={selectedExprToken}
        setSelectedExprToken={setSelectedExprToken}
        activeInlineEditor={activeInlineEditor}
        setActiveInlineEditor={setActiveInlineEditor}
        wrapEl={wrapEl}
        estimateCellSizeFromText={estimateCellSizeFromText}
        setCells={setCells}
        setSelectedCellId={setSelectedCellId}
        setEditingCellId={setEditingCellId}
        commitCellEditing={commitCellEditing}
        scheduleRender={scheduleRender}
        dragStartTimerRef={dragStartTimerRef}
      />

      {!c.collapsed && c.children.length > 0 && (
        <div className="cell-children">{c.children.map((ch) => renderChild(ch, depth + 1, worldNow))}</div>
      )}
    </div>
  )
}
