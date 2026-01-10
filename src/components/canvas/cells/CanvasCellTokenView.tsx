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

