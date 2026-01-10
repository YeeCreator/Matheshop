import type { InlineSelection } from '../exprSelection'

export type SelectedExprToken = null | { cellId: string; tokenId: string }

export function isSelectedToken(args: {
  selected: SelectedExprToken
  cellId: string
  tokenId: string
}) {
  const { selected, cellId, tokenId } = args
  return selected?.cellId === cellId && selected.tokenId === tokenId
}

export function isInlineEditorForCell(args: {
  activeInlineEditor:
    | null
    | {
        cellId: string
        selection: InlineSelection
        draft: string
        anchorCss: { left: number; top: number }
      }
  cellId: string
}) {
  return args.activeInlineEditor?.cellId === args.cellId
}

