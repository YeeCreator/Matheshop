import { parseArithExpr, type Token } from '../../../../engine/engine_ts/src/index'
import { parseBlocksFromText, renderBlocksToHtml } from '../utils/blocks'
import { findCellById } from '../domain/cellTree'
import type { CellNode } from '../../cellTypes'

export type CellRenderModel = {
  headerLabel: string
  htmlContent: string
  isPureArithExpr: boolean
  arithTokens: Token[] | null
}

export function getCellHeaderLabel(cell: CellNode) {
  const title = cell.kind === 'group' ? (cell.collapsed ? 'Group (collapsed)' : 'Group') : 'Cell'
  if (cell.kind === 'group') return title
  if (cell.seq != null) return `Cell #${cell.seq}`
  return title
}

export function getCellRenderModel(args: { cell: CellNode; cells: CellNode[] }): CellRenderModel {
  const { cell, cells } = args

  const findCellContent = (id: string) => {
    const n = findCellById(cells, id)
    if (!n) return null
    return n.content
  }

  const blocks = cell.blocks && cell.blocks.length > 0 ? cell.blocks : parseBlocksFromText(cell.content)
  const htmlContent = renderBlocksToHtml(blocks, {
    findCellContent: (id) => findCellContent(id),
  })

  let arithTokens: Token[] | null = null
  let isPureArithExpr = false

  try {
    const parsed = parseArithExpr(cell.content)
    arithTokens = parsed.tokens

    const compact = (cell.content ?? '').replace(/\s+/g, '')
    const rebuilt = parsed.tokens
      .map((t) => t.text)
      .join('')
      .replace(/\s+/g, '')

    isPureArithExpr = parsed.tokens.length > 0 && compact.length > 0 && compact === rebuilt
  } catch {
    arithTokens = null
    isPureArithExpr = false
  }

  return {
    headerLabel: getCellHeaderLabel(cell),
    htmlContent,
    isPureArithExpr,
    arithTokens,
  }
}

