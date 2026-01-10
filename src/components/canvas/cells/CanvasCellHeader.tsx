
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

