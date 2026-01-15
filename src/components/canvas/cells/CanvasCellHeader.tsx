/**
 * CanvasCellHeader
 *
 * cell 头部区域：
 * - 展示标题 `headerLabel`；
 * - 展示 `depth`（嵌套深度）用于调试；
 * - 当 `isGroup` 为真时提供折叠/展开按钮，并通过 `onToggleCollapse` 通知上层更新状态。
 *
 * 交互约定：
 * - 点击折叠按钮会 `preventDefault/stopPropagation`，避免触发 cell 本体的选择/拖拽等上层事件。
 */

export type CanvasCellHeaderProps = {
  headerLabel: string
  depth: number

  isGroup: boolean
  isCollapsed: boolean
  onToggleCollapse?: () => void
}

export default function CanvasCellHeader(props: CanvasCellHeaderProps) {
  const { headerLabel, depth, isGroup, isCollapsed, onToggleCollapse } = props

  return (
    <div className="cell-header">
      <span className="cell-title">{headerLabel}</span>
      <span className="cell-depth" title="嵌套深度（调试）">
        #{depth}
      </span>

      {isGroup && (
        <button
          type="button"
          className="cell-collapse"
          onClick={(ev) => {
            ev.preventDefault()
            ev.stopPropagation()
            onToggleCollapse?.()
          }}
          title={isCollapsed ? '展开' : '折叠'}
        >
          {isCollapsed ? '▸' : '▾'}
        </button>
      )}
    </div>
  )
}
