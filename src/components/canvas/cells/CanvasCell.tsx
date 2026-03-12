/**
 * CanvasCell
 *
 * 单个 cell 的 UI 容器组件（渲染 + 交互入口）：
 * - 负责将 cell 的 world 布局结果（cssRect）渲染为 DOM 绝对定位；
 * - 组合子组件：Header/Body/Ports/ResizeHandle/Children，以及选中/落点提示占位层；
 * - 处理 pointer 事件并将“拖拽/缩放”等互斥交互委托给上层（CanvasBoard 内的交互状态 refs）。
 *
 * 事件约定：
 * - 对输入控件（textarea/input/contentEditable）不拦截，避免影响编辑体验；
 * - 其它区域 pointerdown 会 preventDefault + stopPropagation，防止画布层误吃事件。
 *
 * 坐标约定：
 * - 迁移后统一使用 viewport-kit 的语义：screen = wrap 容器本地 CSS px。
 */
import React from 'react'
import type { CellId, CellNode, PortSide } from '../../cellTypes'
import CanvasCellPorts from './CanvasCellPorts'
import CanvasCellResizeHandle from './CanvasCellResizeHandle'
import CanvasCellBody from './CanvasCellBody'
import CanvasCellHeader from './CanvasCellHeader'
import CanvasCellChildren from './CanvasCellChildren'
import CanvasCellSelectionOutline from './CanvasCellSelectionOutline'
import CanvasCellDropHint from './CanvasCellDropHint'
import type { InlineSelection } from '../exprSelection'
import type { Token } from '../../../../engine/engine_ts/src/index'
import type { Camera2D } from 'viewport-kit'
import { clientToLocalCssPoint, localCssToWorld } from 'viewport-kit'

export type CanvasCellProps = {
  cell: CellNode
  depth: number

  cssRect: { left: number; top: number }

  parentWorld: { x: number; y: number }
  worldNow: { x: number; y: number }

  camera: Camera2D
  wrapEl: HTMLDivElement | null
  canvasRefForPointerCapture: React.MutableRefObject<HTMLCanvasElement | null>

  isSelected: boolean
  isEditing: boolean
  isDropHint: boolean

  headerLabel: string

  // content rendering
  htmlContent: string
  isPureArithExpr: boolean
  arithTokens: Token[] | null

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

  onToggleCollapse?: (cellId: CellId) => void

  /** 渐进演进：由上层 CanvasBoard 接管 resize 起点与后续 move/up 处理 */
  onResizeStart?: (args: {
    pointerId: number
    cellId: string
    startWorld: { x: number; y: number }
    startSize: { w: number; h: number }
    aspect: number
    startCenterWorld: { x: number; y: number }
  }) => void
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
    onToggleCollapse,
  } = props

  // 旧的 getScreenFromWrap 已废弃：坐标入口迁移到 viewport-kit（screen=wrap 本地 CSS px）。

  // cell 当前中心点 world（用于中心缩放锚点）
  const cellCenterWorld = {
    x: worldNow.x + c.size.w / 2,
    y: worldNow.y + c.size.h / 2,
  }

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

        const screen = (() => {
          const wrap = wrapEl
          if (!wrap) return null
          return clientToLocalCssPoint(wrap, ev.clientX, ev.clientY)
        })()
        if (!screen) return

        const world = localCssToWorld(camera, screen)

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
      <CanvasCellSelectionOutline isSelected={isSelected} />
      <CanvasCellDropHint isDropHint={isDropHint} />

      <CanvasCellPorts
        cellId={c.id}
        cellSize={c.size}
        camera={camera}
        canvasRefForPointerCapture={canvasRefForPointerCapture}
        wrapEl={wrapEl}
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
        onResizeStart={props.onResizeStart}
        wrapEl={wrapEl}
        startCenterWorld={cellCenterWorld}
      />

      {isSelected && (
        <CanvasCellHeader
          headerLabel={headerLabel}
          depth={depth}
          isGroup={c.kind === 'group'}
          isCollapsed={!!c.collapsed}
          onToggleCollapse={c.kind === 'group' ? () => onToggleCollapse?.(c.id) : undefined}
        />
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

      <CanvasCellChildren
        collapsed={c.collapsed}
        childrenNodes={c.children}
        depth={depth}
        parentWorld={worldNow}
        renderChild={renderChild}
      />
    </div>
  )
}
