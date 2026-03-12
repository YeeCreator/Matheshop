import type { Token } from './symbolicTypes'
import type { InlineSelection } from './canvas/exprSelection'
import type { ChangeEvent } from 'react'
import {
  Button,
  ErrorText,
  FieldLabel,
  InfoRow,
  MutedText,
  Row,
  Stack,
  TextArea,
} from 'main-ui-react'

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
    return <MutedText>未选中表达式节点。点击单元内的 token 以进入局部编辑。</MutedText>
  }

  const { cellId, selection, draft, parseError } = active

  return (
    <Stack gap={10}>
      <InfoRow label="Cell" value={cellId} />
      <InfoRow
        label="Selection"
        value={selection.kind === 'tokenRange' ? `token[${selection.start}..${selection.end}]` : selection.kind}
      />

      {parseError && (
        <ErrorText>
          解析错误：{parseError}
        </ErrorText>
      )}

      <FieldLabel label="局部编辑">
        <TextArea
          value={draft}
          onChange={(e: ChangeEvent<HTMLTextAreaElement>) => onChangeDraft(e.target.value)}
          rows={3}
        />
      </FieldLabel>

      <Row gap={8}>
        <Button onClick={onApply}>应用</Button>
        <Button variant="ghost" onClick={onCancel}>取消</Button>
      </Row>

      <details style={{ marginTop: 10 }}>
        <summary>Tokens（调试）</summary>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
          {tokens ? tokens.map((t, i) => (
            <div key={`${t.nodeId}:${i}`} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <span style={{ opacity: 0.6, fontSize: 12 }}>{i}</span>
              <span className={`expr-token expr-token--${t.kind}`}>{t.text || '␀'}</span>
            </div>
          )) : <MutedText>无 token</MutedText>}
        </div>
      </details>
    </Stack>
  )
}
