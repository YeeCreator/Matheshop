/**
 * CanvasCellBody
 *
 * cell 内容区域（body）渲染与编辑交互：
 * - 三种展示分支：
 *   1) isEditing：textarea 编辑器（Enter 提交，Ctrl/⌘+Enter 提交并求值，Esc/blur 提交退出）
 *   2) 纯算术表达式：token 视图 + 行内编辑器（用于替换 tokenRange）
 *   3) 普通内容：块渲染（HTML）
 * - 编辑态输入时会调用 estimateCellSizeFromText 动态估算 size，并做“中心锚定”的 localPos 修正，
 *   以减少尺寸变化造成的跳动。
 *
 * 事件约定：
 * - body 内双击（避开 port/resize 区域）进入编辑；连线模式下禁止进入编辑。
 */
import React from 'react'
import type { CellNode } from '../../cellTypes'
import { updateCellById } from '../domain/cellTree'
import { parseBlocksFromText } from '../utils/blocks'
import type { InlineSelection } from '../exprSelection'
import type { Token } from '../../../../engine/engine_ts/src/index'
import CanvasCellTokenView from './CanvasCellTokenView'
import CanvasCellInlineEditor from './CanvasCellInlineEditor'
import CanvasCellBlockView from './CanvasCellBlockView'

export type CanvasCellBodyProps = {
  cell: CellNode
  isEditing: boolean

  isLinkMode: boolean

  htmlContent: string
  isPureArithExpr: boolean
  arithTokens: Token[] | null

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

  wrapEl: HTMLDivElement | null

  estimateCellSizeFromText: (textRaw: string) => { w: number; h: number }
  setCells: React.Dispatch<React.SetStateAction<CellNode[]>>

  setSelectedCellId: (v: string | null) => void
  setEditingCellId: (v: string | null) => void

  commitCellEditing: (cellId: string, opts?: { runEval?: boolean }) => void
  scheduleRender: () => void

  dragStartTimerRef: React.MutableRefObject<number | null>
}

export default function CanvasCellBody(props: CanvasCellBodyProps) {
  const {
    cell: c,
    isEditing,
    isLinkMode,
    htmlContent,
    isPureArithExpr,
    arithTokens,
    selectedExprToken,
    setSelectedExprToken,
    activeInlineEditor,
    setActiveInlineEditor,
    wrapEl,
    estimateCellSizeFromText,
    setCells,
    setSelectedCellId,
    setEditingCellId,
    commitCellEditing,
    scheduleRender,
    dragStartTimerRef,
  } = props

  return (
    <div
      className="cell-body"
      onDoubleClickCapture={(ev) => {
        const t = ev.target as HTMLElement | null
        if (!t) return

        if (isLinkMode) return

        if (t.closest('.cell-port') || t.closest('.cell-resize-handle') || t.closest('.cell-ports')) return

        if (dragStartTimerRef.current != null) {
          window.clearTimeout(dragStartTimerRef.current)
          dragStartTimerRef.current = null
        }

        ev.preventDefault()
        ev.stopPropagation()
        setSelectedCellId(c.id)
        setEditingCellId(c.id)
      }}
    >
      {isEditing ? (
        <div className="cell-editor-wrap">
          <textarea
            className="cell-editor"
            value={c.content}
            onChange={(ev) => {
              const v = ev.target.value
              const nextSize = estimateCellSizeFromText(v)

              setCells((prev) =>
                updateCellById(prev, c.id, (next) => {
                  const dx = (next.size.w - nextSize.w) / 2
                  const dy = (next.size.h - nextSize.h) / 2
                  return {
                    ...next,
                    content: v,
                    size: nextSize,
                    localPos: { x: next.localPos.x + dx, y: next.localPos.y + dy },
                  }
                }),
              )
            }}
            onKeyDown={(ev) => {
              if (ev.key === 'Escape') {
                ev.preventDefault()
                commitCellEditing(c.id)
                return
              }

              if (ev.key === 'Enter' && ev.shiftKey) return

              if (ev.key === 'Enter' && (ev.ctrlKey || ev.metaKey)) {
                ev.preventDefault()
                commitCellEditing(c.id, { runEval: true })
                return
              }

              if (ev.key === 'Enter') {
                ev.preventDefault()
                commitCellEditing(c.id)
                return
              }
            }}
            onBlur={() => {
              commitCellEditing(c.id)
            }}
          />
        </div>
      ) : isPureArithExpr && arithTokens ? (
        <>
          <CanvasCellTokenView
            tokens={arithTokens}
            selectedTokenId={selectedExprToken?.cellId === c.id ? selectedExprToken.tokenId : null}
            onSelectToken={({ tokenId, tokenIndex, anchorRect }) => {
              setSelectedExprToken({ cellId: c.id, tokenId })

              const w = wrapEl
              const wrapRect = w?.getBoundingClientRect()
              const left = wrapRect ? anchorRect.left - wrapRect.left : anchorRect.left
              const top = wrapRect ? anchorRect.bottom - wrapRect.top + 6 : anchorRect.bottom + 6

              setActiveInlineEditor((prev) => {
                const draft = prev?.cellId === c.id ? prev.draft : arithTokens[tokenIndex]?.text ?? ''
                return {
                  cellId: c.id,
                  selection: { kind: 'tokenRange', start: tokenIndex, end: tokenIndex },
                  draft,
                  anchorCss: { left, top },
                }
              })
            }}
            onDeselect={() => {
              if (selectedExprToken?.cellId === c.id) setSelectedExprToken(null)
              if (activeInlineEditor?.cellId === c.id) setActiveInlineEditor(null)
            }}
            onRequestEdit={({ tokenIndex, anchorRect }) => {
              const w = wrapEl
              const wrapRect = w?.getBoundingClientRect()
              const left = wrapRect ? anchorRect.left - wrapRect.left : anchorRect.left
              const top = wrapRect ? anchorRect.bottom - wrapRect.top + 6 : anchorRect.bottom + 6

              setActiveInlineEditor({
                cellId: c.id,
                selection: { kind: 'tokenRange', start: tokenIndex, end: tokenIndex },
                draft: arithTokens[tokenIndex]?.text ?? '',
                anchorCss: { left, top },
              })
            }}
          />

          {activeInlineEditor?.cellId === c.id && (
            <CanvasCellInlineEditor
              anchorCss={activeInlineEditor.anchorCss}
              draft={activeInlineEditor.draft}
              onChangeDraft={(v) =>
                setActiveInlineEditor((prev) =>
                  prev
                    ? {
                        ...prev,
                        draft: v,
                      }
                    : prev,
                )
              }
              onApply={() => {
                if (!activeInlineEditor) return
                if (activeInlineEditor.cellId !== c.id) return

                const sel = activeInlineEditor.selection
                if (sel.kind !== 'tokenRange') return
                const start = Math.min(sel.start, sel.end)
                const end = Math.max(sel.start, sel.end)

                const before = arithTokens.slice(0, start).map((t) => t.text).join('')
                const after = arithTokens
                  .slice(end + 1)
                  .map((t) => t.text)
                  .join('')
                const nextContent = `${before}${activeInlineEditor.draft}${after}`

                setCells((prev) =>
                  updateCellById(prev, c.id, (next) => ({
                    ...next,
                    content: nextContent,
                    blocks: parseBlocksFromText(nextContent),
                  })),
                )

                setActiveInlineEditor(null)
                scheduleRender()
              }}
              onCancel={() => {
                if (activeInlineEditor?.cellId === c.id) setActiveInlineEditor(null)
              }}
            />
          )}
        </>
      ) : (
        <CanvasCellBlockView htmlContent={htmlContent} />
      )}
    </div>
  )
}

