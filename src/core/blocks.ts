import katex from 'katex'
import type { CellBlock, LatexBlock, TextBlock } from './matheshopTypes'

const createBlockId = () => globalThis.crypto?.randomUUID?.() ?? `block-${Date.now()}-${Math.random().toString(16).slice(2)}`

const escapeHtml = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

const containsCjk = /[\u3400-\u9fff]/
const mathLikePattern = /\\|\^|_|=|\+|-|\*|\/|\(|\)|\[|\]|\{|\}|\d/

function looksLikeMathLine(line: string): boolean {
  const value = line.trim()
  if (!value) return false
  if (containsCjk.test(value)) return false
  if (mathLikePattern.test(value)) return true
  return /^[A-Za-z]+$/.test(value)
}

function pushImplicitBlocks(blocks: CellBlock[], text: string): void {
  const normalized = text.replace(/\r\n/g, '\n')
  const lines = normalized.split('\n')

  for (const line of lines) {
    if (!line.trim()) continue
    if (looksLikeMathLine(line)) {
      blocks.push({ id: createBlockId(), type: 'latex', latex: line.trim(), displayMode: true } satisfies LatexBlock)
      continue
    }

    blocks.push({ id: createBlockId(), type: 'text', text: line } satisfies TextBlock)
  }
}

export function parseBlocksFromText(raw: string): CellBlock[] {
  const source = raw ?? ''
  const blocks: CellBlock[] = []
  const latexPattern = /\$\$([\s\S]*?)\$\$/g
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = latexPattern.exec(source))) {
    const before = source.slice(lastIndex, match.index)
    if (before.trim().length > 0) {
      pushImplicitBlocks(blocks, before)
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
    pushImplicitBlocks(blocks, rest)
  }

  if (blocks.length === 0) {
    blocks.push({ id: createBlockId(), type: 'text', text: '' } satisfies TextBlock)
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