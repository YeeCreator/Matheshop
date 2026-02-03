/**
 * cellSelectionUtils
 *
 * 与 cell 内“表达式 token 选择/内联编辑器归属判断”相关的小工具集合：
 * - 用于判断某个 token 是否为当前选中 token；
 * - 用于判断当前 active inline editor 是否属于某个 cell。
 *
 * 这些函数设计为纯函数，便于在渲染阶段与事件处理中复用。
 */
import type { InlineSelection } from '../exprSelection'

export type SelectedExprToken = null | { cellId: string; tokenId: string }

/**
 * 判断给定 token 是否为当前选中的 token。
 * @returns 若 selected 指向同一 cellId 且 tokenId 相同则返回 true，否则 false
 */
export function isSelectedToken(args: {
  selected: SelectedExprToken
  cellId: string
  tokenId: string
}) {
  const { selected, cellId, tokenId } = args
  return selected?.cellId === cellId && selected.tokenId === tokenId
}

/**
 * 判断当前激活的内联编辑器是否属于指定 cell。
 * @returns activeInlineEditor 存在且其 cellId 与入参 cellId 相同则返回 true，否则 false
 */
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
