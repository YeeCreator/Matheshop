/**
 * ExprTokenView.tsx
 *
 * 表达式 token 的视图组件：
 * - 以 <span> 列表渲染 Token[]，并根据 selectedTokenId 高亮选中项；
 * - 单击 token：回传 tokenId/tokenIndex 以及用于定位弹层的 anchorRect；
 * - 双击 token：请求进入编辑（同样回传 anchorRect）；
 * - 点击组件空白处：仅取消 token 选中（stopPropagation，避免影响外层 cell/canvas 的选中逻辑）。
 */
import type React from 'react'
import type { Token } from '../../../engine/engine_ts/src/index'

export type ExprTokenViewProps = {
  tokens: Token[]
  selectedTokenId: string | null
  onSelectToken: (args: { tokenId: string; tokenIndex: number; anchorRect: DOMRect }) => void
  onDeselect: () => void
  onRequestEdit: (args: { tokenIndex: number; anchorRect: DOMRect }) => void
}

export default function ExprTokenView(props: ExprTokenViewProps) {
  const { tokens, selectedTokenId, onSelectToken, onDeselect, onRequestEdit } = props

  return (
    <div
      className="expr-token-view"
      onPointerDown={(ev: React.PointerEvent) => {
        // 点击 token view 空白处：只取消 token 选中，不影响 cell 选中
        ev.stopPropagation()
        onDeselect()
      }}
    >
      {tokens.map((t, idx) => {
        const isSelected = selectedTokenId === t.nodeId
        const cls = `expr-token expr-token--${t.kind}${isSelected ? ' is-selected' : ''}`

        return (
          <span
            key={`${t.nodeId}:${idx}`}
            className={cls}
            data-expr-node-id={t.nodeId}
            onPointerDown={(ev: React.PointerEvent<HTMLSpanElement>) => {
              ev.stopPropagation()
              const rect = ev.currentTarget.getBoundingClientRect()
              onSelectToken({ tokenId: t.nodeId, tokenIndex: idx, anchorRect: rect })
            }}
            onDoubleClick={(ev: React.MouseEvent<HTMLSpanElement>) => {
              ev.stopPropagation()
              const rect = ev.currentTarget.getBoundingClientRect()
              onRequestEdit({ tokenIndex: idx, anchorRect: rect })
            }}
          >
            {t.text}
          </span>
        )
      })}
    </div>
  )
}
