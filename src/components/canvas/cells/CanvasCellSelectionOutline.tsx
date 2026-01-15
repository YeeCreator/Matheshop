/**
 * CanvasCellSelectionOutline
 *
 * 选中态外框的占位组件：
 * - 当前选中样式由 `.cell.is-selected` class 驱动；
 * - 组件暂不渲染任何 DOM（返回 null），为后续增强预留
 *   （例如更复杂的 outline、八方向控制点、多选框等）。
 */
export type CanvasCellSelectionOutlineProps = {
  isSelected: boolean
}

export default function CanvasCellSelectionOutline({ isSelected }: CanvasCellSelectionOutlineProps) {
  void isSelected
  // 当前样式由 `.cell.is-selected` 驱动；此组件作为后续增强（更复杂 outline/多选框）预留。
  return null
}
