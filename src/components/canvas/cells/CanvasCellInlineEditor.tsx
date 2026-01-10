import InlineExprEditor from '../InlineExprEditor'

export type CanvasCellInlineEditorProps = {
  anchorCss: { left: number; top: number }
  draft: string

  onChangeDraft: (next: string) => void
  onApply: () => void
  onCancel: () => void
}

export default function CanvasCellInlineEditor(props: CanvasCellInlineEditorProps) {
  const { anchorCss, draft, onChangeDraft, onApply, onCancel } = props

  return (
    <InlineExprEditor
      anchorCss={anchorCss}
      draft={draft}
      onChangeDraft={onChangeDraft}
      onApply={onApply}
      onCancel={onCancel}
    />
  )
}

