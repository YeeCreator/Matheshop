/**
 * getCellRenderModel
 *
 * 为 CanvasCell 提供“渲染模型”（Render Model）的纯函数：
 * - headerLabel：标题（group/collapsed 与 seq 编号规则）
 * - htmlContent：由 blocks 渲染器生成的 HTML（支持引用其它 cell 内容）
 * - isPureArithExpr + arithTokens：当 content 可被解析为算术表达式且“去空白后可完全由 tokens 重建”时，
 *   认为是纯算术表达式，用于启用 token 选择与行内替换编辑。
 *
 * 注意：
 * - 算术解析失败时会降级为普通块渲染。
 * - findCellContent 通过 id 查找其它 cell 的 content，用于 blocks 内的引用渲染。
 */
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
