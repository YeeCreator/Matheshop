/**
 * CanvasCellLayer
 *
 * 负责在可滚动 workspace 中渲染所有 cell 的顶层 React Layer：
 * - 将 cell 的 world 坐标通过 camera 投影，并结合 canvas/wrap 的尺寸与滚动偏移换算为 CSS 坐标；
 * - 递归渲染 cell 树（通过 `renderChild` 回调继续下钻）；
 * - 将选择、编辑、hover port、连线模式、拖拽边、缩放等交互状态集中下发给 `CanvasCell`。
 *
 * 坐标系统说明：
 * - 本层统一使用 viewport-kit 语义：world -> wrap 本地 CSS 坐标。
 */
import React from 'react'
import type { CellId, CellNode, PortSide } from '../../cellTypes'
import { updateCellById } from '../domain/cellTree'
import type { InlineSelection } from '../exprSelection'
import CanvasCell from './CanvasCell'
import { getCellRenderModel } from './getCellRenderModel'
import type { Camera2D } from 'viewport-kit'
import { worldToLocalCssWithScroll } from 'viewport-kit'

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

export type ResizingCellState =
  | null
  | {
      id: string
      pointerId: number
      startWorld: { x: number; y: number }
      startSize: { w: number; h: number }
      aspect: number
    }

export type CanvasCellLayerProps = {
  cells: CellNode[]
  camera: Camera2D

  wrapEl: HTMLDivElement | null
  renderTick: number

  selectedCellId: string | null
  editingCellId: string | null
  dropHintCellId: string | null

  hoverPort: null | { cellId: CellId; port: PortSide }
  setHoverPort: (v: null | { cellId: CellId; port: PortSide }) => void

  isLinkMode: boolean
  linkFromId: CellId | null
  setLinkFromId: (v: CellId | null) => void
  ensureEdge: (from: CellId, to: CellId, fromPort?: PortSide, toPort?: PortSide) => void

  multiSelectedIds: string[]

  selectedExprToken: null | { cellId: string; tokenId: string }
  setSelectedExprToken: (v: null | { cellId: string; tokenId: string }) => void

  activeInlineEditor: null | {
    cellId: string
    selection: InlineSelection
    draft: string
    anchorCss: { left: number; top: number }
  }
  setActiveInlineEditor: (
    v:
      | null
      | {
          cellId: string
          selection: InlineSelection
          draft: string
          anchorCss: { left: number; top: number }
        }
      | ((
          prev:
            | null
            | {
                cellId: string
                selection: InlineSelection
                draft: string
                anchorCss: { left: number; top: number }
              },
        ) =>
          | null
          | {
              cellId: string
              selection: InlineSelection
              draft: string
              anchorCss: { left: number; top: number }
            }),
  ) => void

  estimateCellSizeFromText: (textRaw: string) => { w: number; h: number }

  setCells: React.Dispatch<React.SetStateAction<CellNode[]>>
  setSelectedCellId: (v: string | null) => void
  setEditingCellId: (v: string | null) => void

  commitCellEditing: (cellId: string, opts?: { runEval?: boolean }) => void
  scheduleRender: () => void

  draggingEdgeRef: React.MutableRefObject<DraggingEdgeState>
  resizingCellRef: React.MutableRefObject<ResizingCellState>

  canvasRefForPointerCapture: React.MutableRefObject<HTMLCanvasElement | null>

  dragStartTimerRef: React.MutableRefObject<number | null>
  draggingCellPointerDown: (args: { ev: React.PointerEvent; cell: CellNode; parentWorld: { x: number; y: number }; screen: { x: number; y: number }; world: { x: number; y: number } }) => void

  onResizeStart?: (args: {
    pointerId: number
    cellId: string
    startWorld: { x: number; y: number }
    startSize: { w: number; h: number }
    aspect: number
    startCenterWorld: { x: number; y: number }
  }) => void
}

export default function CanvasCellLayer(props: CanvasCellLayerProps) {
  const {
    cells,
    camera,
    wrapEl,
    renderTick,
    selectedCellId,
    editingCellId,
    dropHintCellId,
    hoverPort,
    setHoverPort,
    isLinkMode,
    linkFromId,
    setLinkFromId,
    ensureEdge,
    multiSelectedIds,
    selectedExprToken,
    setSelectedExprToken,
    activeInlineEditor,
    setActiveInlineEditor,
    estimateCellSizeFromText,
    setCells,
    setSelectedCellId,
    setEditingCellId,
    commitCellEditing,
    scheduleRender,
    draggingEdgeRef,
    resizingCellRef,
    canvasRefForPointerCapture,
    dragStartTimerRef,
    draggingCellPointerDown,
    onResizeStart,
  } = props

  const content = (() => {
    if (!wrapEl) return null

    const worldToCss = (world: { x: number; y: number }) => {
      const local = worldToLocalCssWithScroll(wrapEl, camera, world)
      return { left: local.x, top: local.y }
    }

    const renderCell = (c: CellNode, depth: number, parentWorld: { x: number; y: number }) => {
      const worldNow = { x: parentWorld.x + c.localPos.x, y: parentWorld.y + c.localPos.y }

      const css = worldToCss(worldNow)

      const isSelected = selectedCellId === c.id
      const isEditing = editingCellId === c.id
      const isDropHint = dropHintCellId === c.id

      const renderModel = getCellRenderModel({ cell: c, cells })

      return (
        <CanvasCell
          key={c.id}
          cell={c}
          depth={depth}
          cssRect={{ left: css.left, top: css.top }}
          parentWorld={parentWorld}
          worldNow={worldNow}
          camera={camera}
          wrapEl={wrapEl}
          canvasRefForPointerCapture={canvasRefForPointerCapture}
          isSelected={isSelected}
          isEditing={isEditing}
          isDropHint={isDropHint}
          headerLabel={renderModel.headerLabel}
          htmlContent={renderModel.htmlContent}
          isPureArithExpr={renderModel.isPureArithExpr}
          arithTokens={renderModel.arithTokens}
          hoverPort={hoverPort}
          setHoverPort={setHoverPort}
          draggingEdgeRef={draggingEdgeRef}
          resizingCellRef={resizingCellRef}
          isLinkMode={isLinkMode}
          linkFromId={linkFromId}
          setLinkFromId={setLinkFromId}
          ensureEdge={ensureEdge}
          editingCellId={editingCellId}
          setSelectedCellId={setSelectedCellId}
          setEditingCellId={setEditingCellId}
          dragStartTimerRef={dragStartTimerRef}
          draggingCellPointerDown={draggingCellPointerDown}
          multiSelectedIds={multiSelectedIds}
          commitCellEditing={commitCellEditing}
          estimateCellSizeFromText={estimateCellSizeFromText}
          setCells={setCells}
          scheduleRender={scheduleRender}
          selectedExprToken={selectedExprToken}
          setSelectedExprToken={setSelectedExprToken}
          activeInlineEditor={activeInlineEditor}
          setActiveInlineEditor={setActiveInlineEditor}
          onToggleCollapse={(cellId) => {
            setCells((prev) => updateCellById(prev, cellId, (n) => ({ ...n, collapsed: !n.collapsed })))
            scheduleRender()
          }}
          renderChild={(child, nextDepth, nextParentWorld) => renderCell(child, nextDepth, nextParentWorld)}
          onResizeStart={onResizeStart}
        />
      )
    }

    return cells.map((c) => renderCell(c, 0, { x: 0, y: 0 }))
  })()

  return (
    <div className="cell-layer" data-tick={renderTick}>
      {content}
    </div>
  )
}
