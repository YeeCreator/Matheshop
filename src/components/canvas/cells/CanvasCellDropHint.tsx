/**
 * CanvasCellDropHint
 *
 * Drop Hint 的占位组件：
 * - 当前 UI 样式由 `.cell.is-drop-hint` 这一 class 驱动；
 * - 组件本身暂不渲染任何 DOM（返回 null），作为后续增强预留
 *   （例如插入线、提示标签、可视化落点等）。
 */
export default function CanvasCellDropHint(props: { isDropHint: boolean }) {
  void props
  // 当前样式由 `.cell.is-drop-hint` 驱动；此组件作为后续增强（例如显示插入线/提示标签）预留。
  return null
}
