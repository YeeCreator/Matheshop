import katex from 'katex'
import type { CellBlock, LatexBlock, TextBlock } from './matheshopTypes'

const createBlockId = () => globalThis.crypto?.randomUUID?.() ?? `block-${Date.now()}-${Math.random().toString(16).slice(2)}`

const escapeHtml = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

export function parseBlocksFromText(raw: string): CellBlock[] {
  const source = raw ?? ''
  const blocks: CellBlock[] = []
  const latexPattern = /\$\$([\s\S]*?)\$\$/g
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = latexPattern.exec(source))) {
    const before = source.slice(lastIndex, match.index)
    if (before.trim().length > 0) {
      blocks.push({ id: createBlockId(), type: 'text', text: before } satisfies TextBlock)
    }

    blocks.push({
      id: createBlockId(),
      type: 'latex',
      latex: (match[1] ?? '').trim(),
      displayMode: true,
    } satisfies LatexBlock)

    lastIndex = latexPattern.lastIndex
  }

  const rest = source.slice(lastIndex)
  if (rest.trim().length > 0 || blocks.length === 0) {
    blocks.push({ id: createBlockId(), type: 'text', text: rest } satisfies TextBlock)
  }

  return blocks
}

export function renderBlocksToHtml(blocks: CellBlock[]): string {
  return blocks
    .map((block) => {
      if (block.type === 'text') {
        return `<div class="matheshop-cell-block matheshop-cell-block--text">${escapeHtml(block.text)}</div>`
      }

      const html = katex.renderToString(block.latex, {
        throwOnError: false,
        displayMode: block.displayMode,
        output: 'html',
      })
      return `<div class="matheshop-cell-block matheshop-cell-block--latex">${html}</div>`
    })
    .join('')
}