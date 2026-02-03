import katex from 'katex'
import type { CellBlock, LatexBlock, TextBlock } from '../../cellTypes'

function escapeHtml(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

export function parseBlocksFromText(raw: string): CellBlock[] {
  const trimmed = raw ?? ''

  // 最小解析：
  // - $$...$$ => display latex block
  // - 其他全部作为 text block
  const blocks: CellBlock[] = []

  const latexRe = /\$\$([\s\S]*?)\$\$/g
  let lastIndex = 0
  let m: RegExpExecArray | null

  while ((m = latexRe.exec(trimmed))) {
    const start = m.index
    const end = latexRe.lastIndex
    const before = trimmed.slice(lastIndex, start)
    if (before.trim().length > 0) {
      blocks.push({ id: crypto.randomUUID(), type: 'text', text: before } satisfies TextBlock)
    }
    const latex = (m[1] ?? '').trim()
    blocks.push({ id: crypto.randomUUID(), type: 'latex', latex, displayMode: true } satisfies LatexBlock)
    lastIndex = end
  }

  const rest = trimmed.slice(lastIndex)
  if (rest.trim().length > 0 || blocks.length === 0) {
    blocks.push({ id: crypto.randomUUID(), type: 'text', text: rest } satisfies TextBlock)
  }

  return blocks
}

export function renderBlocksToHtml(blocks: CellBlock[], opts: { findCellContent: (id: string) => string | null }) {
  const parts: string[] = []

  for (const b of blocks) {
    if (b.type === 'text') {
      parts.push(`<div class="cell-block-text">${escapeHtml(b.text)}</div>`)
      continue
    }

    if (b.type === 'latex') {
      try {
        const html = katex.renderToString(b.latex, {
          throwOnError: false,
          displayMode: b.displayMode ?? true,
          output: 'html',
        })
        parts.push(`<div class="cell-block-latex">${html}</div>`)
      } catch {
        parts.push(`<div class="cell-block-error">LaTeX 渲染失败</div>`)
      }
      continue
    }

    if (b.type === 'cellRef') {
      const txt = opts.findCellContent(b.targetCellId) ?? '(missing)'
      parts.push(
        `<div class="cell-block-ref">↪ 引用 ${escapeHtml(b.targetCellId)}: ${escapeHtml(txt.slice(0, 60))}</div>`,
      )
      continue
    }
  }

  return parts.join('')
}

