/**
 * CanvasCellBlockView
 *
 * cell 的“块渲染”视图：
 * - 仅负责把上层计算得到的 htmlContent 渲染到 DOM；
 * - 使用 dangerouslySetInnerHTML：HTML 由 blocks 渲染器产出（受控来源），本组件不做二次处理。
 *
 * 说明：该组件保持纯展示，便于未来替换为更安全/更结构化的渲染方式。
 */

export type CanvasCellBlockViewProps = {
  htmlContent: string
}

export default function CanvasCellBlockView(props: CanvasCellBlockViewProps) {
  return <div className="cell-blocks" dangerouslySetInnerHTML={{ __html: props.htmlContent }} />
}
