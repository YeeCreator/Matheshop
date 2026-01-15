/**
 * CanvasCellTokenView
 *
 * cell 内 token 渲染视图的适配层：
 * - 将引擎侧 `Token[]` 与选中 token 状态传递给 `ExprTokenView`；
 * - 由上层通过回调接收交互事件：
 *   - `onSelectToken`：选中某个 token（包含 anchorRect 便于定位弹层/内联编辑器）
 *   - `onDeselect`：取消选中
 *   - `onRequestEdit`：请求编辑指定 token（同样提供 anchorRect）
 *
 * 说明：本组件不实现渲染逻辑，仅做 props 透传与类型边界收敛。
 */
import type { Token } from '../../../../engine/engine_ts/src/index'
import ExprTokenView from '../ExprTokenView'

export type CanvasCellTokenViewProps = {
  tokens: Token[]
  selectedTokenId: string | null

  onSelectToken: (args: { tokenId: string; tokenIndex: number; anchorRect: DOMRect }) => void
  onDeselect: () => void
  onRequestEdit: (args: { tokenIndex: number; anchorRect: DOMRect }) => void
}

export default function CanvasCellTokenView(props: CanvasCellTokenViewProps) {
  return (
    <ExprTokenView
      tokens={props.tokens}
      selectedTokenId={props.selectedTokenId}
      onSelectToken={props.onSelectToken}
      onDeselect={props.onDeselect}
      onRequestEdit={props.onRequestEdit}
    />
  )
}
