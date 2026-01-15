/**
 * CanvasCellInlineEditor
 *
 * cell 内联表达式编辑器的轻量包装：
 * - 将上层计算得到的定位信息 `anchorCss` 透传给 `InlineExprEditor`；
 * - 由上层持有/驱动 `draft` 状态，并通过回调处理：
 *   - `onChangeDraft`：输入变更
 *   - `onApply`：应用提交
 *   - `onCancel`：取消编辑（恢复/关闭）
 *
 * 说明：该组件本身不包含状态机逻辑，负责纯展示与事件透传。
 */
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
