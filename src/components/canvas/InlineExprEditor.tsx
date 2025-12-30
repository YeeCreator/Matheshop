import { useEffect, useRef } from 'react'

export type InlineExprEditorProps = {
  anchorCss: { left: number; top: number }
  draft: string
  onChangeDraft: (v: string) => void
  onApply: () => void
  onCancel: () => void
}

export default function InlineExprEditor(props: InlineExprEditorProps) {
  const { anchorCss, draft, onChangeDraft, onApply, onCancel } = props

  const inputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    const t = window.setTimeout(() => inputRef.current?.focus(), 0)
    return () => window.clearTimeout(t)
  }, [])

  return (
    <div
      className="inline-expr-editor"
      style={{ left: anchorCss.left, top: anchorCss.top }}
      onPointerDown={(ev) => {
        // 避免被画布/单元框拖拽吃掉
        ev.stopPropagation()
      }}
    >
      <input
        ref={inputRef}
        className="inline-expr-editor-input"
        value={draft}
        onChange={(e) => onChangeDraft(e.target.value)}
        onKeyDown={(ev) => {
          if (ev.key === 'Escape') {
            ev.preventDefault()
            onCancel()
            return
          }
          if (ev.key === 'Enter') {
            ev.preventDefault()
            onApply()
          }
        }}
      />

      <div className="inline-expr-editor-actions">
        <button type="button" onClick={onApply}>
          应用
        </button>
        <button type="button" onClick={onCancel}>
          取消
        </button>
      </div>
    </div>
  )
}
