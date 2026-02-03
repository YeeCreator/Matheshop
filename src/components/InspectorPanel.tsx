import type { Token } from './symbolicTypes'
import type { InlineSelection } from './canvas/exprSelection'

export type InspectorPanelProps = {
  active: {
    cellId: string
    selection: InlineSelection
    draft: string
    parseError?: string
  } | null
  tokens: Token[] | null
  onChangeDraft: (draft: string) => void
  onApply: () => void
  onCancel: () => void
}

export default function InspectorPanel(props: InspectorPanelProps) {
  const { active, tokens, onChangeDraft, onApply, onCancel } = props

  if (!active) {
    return (
      <div className="panel">
        <h3>Inspector</h3>
        <div className="small-muted">未选中表达式节点。点击单元内的 token 以进入局部编辑。</div>
      </div>
    )
  }

  const { cellId, selection, draft, parseError } = active

  return (
    <div className="panel">
      <h3>Inspector</h3>

      <div className="inspector-row">
        <div className="inspector-k">Cell</div>
        <div className="inspector-v">{cellId}</div>
      </div>

      <div className="inspector-row">
        <div className="inspector-k">Selection</div>
        <div className="inspector-v">
          {selection.kind === 'tokenRange' ? `token[${selection.start}..${selection.end}]` : selection.kind}
        </div>
      </div>

      {parseError && (
        <div className="inspector-error">
          解析错误：{parseError}
        </div>
      )}

      <label className="inspector-label">
        局部编辑
        <textarea
          className="inspector-textarea"
          value={draft}
          onChange={(e) => onChangeDraft(e.target.value)}
          rows={3}
        />
      </label>

      <div className="inspector-actions">
        <button type="button" onClick={onApply}>
          应用
        </button>
        <button type="button" onClick={onCancel}>
          取消
        </button>
      </div>

      <details style={{ marginTop: 10 }}>
        <summary>Tokens（调试）</summary>
        <div className="inspector-tokens">
          {tokens ? tokens.map((t, i) => (
            <div key={`${t.nodeId}:${i}`} className="inspector-token">
              <span className="inspector-token-i">{i}</span>
              <span className={`expr-token expr-token--${t.kind}`}>{t.text || '␀'}</span>
            </div>
          )) : <div className="small-muted">无 token</div>}
        </div>
      </details>
    </div>
  )
}

