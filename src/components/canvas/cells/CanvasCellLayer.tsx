import React from 'react'
import type { CellId, CellNode, PortSide } from '../../cellTypes'
import type { Camera } from '../utils/geometry'
import { worldToScreen } from '../utils/geometry'
import { findCellById } from '../domain/cellTree'
import { parseBlocksFromText, renderBlocksToHtml } from '../utils/blocks'
import { parseArithExpr } from '../../../../engine/engine_ts/src/index'
import type { InlineSelection } from '../exprSelection'
import CanvasCell from './CanvasCell'

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
  camera: Camera
  canvasEl: HTMLCanvasElement | null
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
}

export default function CanvasCellLayer(props: CanvasCellLayerProps) {
  const {
    cells,
    camera,
    canvasEl,
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
  } = props

  const content = (() => {
    if (!canvasEl || !wrapEl) return null
    const rect = wrapEl.getBoundingClientRect()

    const renderCell = (c: CellNode, depth: number, parentWorld: { x: number; y: number }) => {
      const worldNow = { x: parentWorld.x + c.localPos.x, y: parentWorld.y + c.localPos.y }

      const screenPx = worldToScreen(worldNow, camera)
      const xCss = (screenPx.x / canvasEl.width) * rect.width
      const yCss = (screenPx.y / canvasEl.height) * rect.height

      const isSelected = selectedCellId === c.id
      const isEditing = editingCellId === c.id
      const isDropHint = dropHintCellId === c.id

      const title = c.kind === 'group' ? (c.collapsed ? 'Group (collapsed)' : 'Group') : 'Cell'
      const headerLabel = (() => {
        if (c.kind === 'group') return title
        if (c.seq != null) return `Cell #${c.seq}`
        return title
      })()

      const findCellContent = (id: string) => {
        const n = findCellById(cells, id)
        if (!n) return null
        return n.content
      }

      const blocks = c.blocks && c.blocks.length > 0 ? c.blocks : parseBlocksFromText(c.content)
      const htmlContent = renderBlocksToHtml(blocks, {
        findCellContent: (id) => findCellContent(id),
      })

      let arithTokens: ReturnType<typeof parseArithExpr>['tokens'] | null = null
      let isPureArithExpr: boolean
      try {
        const parsed = parseArithExpr(c.content)
        arithTokens = parsed.tokens
        const compact = (c.content ?? '').replace(/\s+/g, '')
        const rebuilt = parsed.tokens
          .map((t: { text: string }) => t.text)
          .join('')
          .replace(/\s+/g, '')
        isPureArithExpr = parsed.tokens.length > 0 && compact.length > 0 && compact === rebuilt
      } catch {
        arithTokens = null
        isPureArithExpr = false
      }

      return (
        <CanvasCell
          key={c.id}
          cell={c}
          depth={depth}
          cssRect={{ left: xCss, top: yCss }}
          parentWorld={parentWorld}
          worldNow={worldNow}
          camera={camera}
          wrapEl={wrapEl}
          canvasRefForPointerCapture={canvasRefForPointerCapture}
          isSelected={isSelected}
          isEditing={isEditing}
          isDropHint={isDropHint}
          headerLabel={headerLabel}
          htmlContent={htmlContent}
          isPureArithExpr={isPureArithExpr}
          arithTokens={(arithTokens as Array<{ text: string }> | null) ?? null}
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
          setActiveInlineEditor={setActiveInlineEditor as React.Dispatch<React.SetStateAction<any>>}
          renderChild={(child, nextDepth, nextParentWorld) => renderCell(child, nextDepth, nextParentWorld)}
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
