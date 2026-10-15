import katex from 'katex'
import type { CellBlock, ConceptIconBlock, ConceptShape, LatexBlock, TextBlock } from './matheshopTypes'

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

      if (block.type === 'conceptIcon') {
        return renderConceptIcon(block)
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

/**
 * 渲染概念象形图标（契约1 契约1 · 低密度档）。
 *
 * 形态只表**类别**、不承载推理信息：空心网格＝邻接矩阵、圆点连线＝图网络等。
 * 图标以 inline SVG 内联，便于随粒度轴单节点升降。
 *
 * @param block 概念图标 block。
 * @returns SVG 内联字符串。
 *
 * @example
 * renderConceptIcon({ id: 'b1', type: 'conceptIcon', shape: 'matrix' })
 */
export function renderConceptIcon(block: ConceptIconBlock): string {
  const body = CONCEPT_ICON_SVG[block.shape] ?? CONCEPT_ICON_SVG.generic
  const caption = block.caption ? `<div class="matheshop-concept-icon__caption">${escapeHtml(block.caption)}</div>` : ''
  return (
    `<div class="matheshop-cell-block matheshop-cell-block--concept-icon" data-shape="${block.shape}">` +
    `<svg viewBox="0 0 48 48" width="48" height="48" aria-hidden="true">${body}</svg>${caption}</div>`
  )
}

/** 各形态的极简线稿（只表类别特征，不含数值）。 */
const CONCEPT_ICON_SVG: Record<ConceptShape, string> = {
  // 空心网格方框 ＝ 邻接矩阵
  matrix:
    '<rect x="8" y="8" width="32" height="32" fill="none" stroke="currentColor" stroke-width="1.5"/>' +
    '<path d="M18 8v32M28 8v32M8 18h32M8 28h32" stroke="currentColor" stroke-width="0.8" opacity="0.55"/>',
  // 圆点连线 ＝ 图网络
  network:
    '<path d="M14 18L26 12M14 18L20 32M26 12L38 24M20 32L38 24M20 32L32 36M38 24L32 36" stroke="currentColor" stroke-width="1"/>' +
    '<circle cx="14" cy="18" r="3.2" fill="none" stroke="currentColor" stroke-width="1.4"/>' +
    '<circle cx="26" cy="12" r="3.2" fill="none" stroke="currentColor" stroke-width="1.4"/>' +
    '<circle cx="20" cy="32" r="3.2" fill="none" stroke="currentColor" stroke-width="1.4"/>' +
    '<circle cx="38" cy="24" r="3.2" fill="none" stroke="currentColor" stroke-width="1.4"/>' +
    '<circle cx="32" cy="36" r="3.2" fill="none" stroke="currentColor" stroke-width="1.4"/>',
  // 三根相交短线 ＝ 三维坐标
  space3d: '<path d="M24 24V8M24 24L10 34M24 24L38 34" stroke="currentColor" stroke-width="1.6"/>',
  // 极简手势线稿 ＝ 右手定则
  handRule:
    '<path d="M18 32V14M26 32V10M34 32V16" stroke="currentColor" stroke-width="1.6"/>' +
    '<path d="M14 32h24" stroke="currentColor" stroke-width="1.6"/>' +
    '<path d="M34 10l6 4-6 4" fill="none" stroke="currentColor" stroke-width="1.2"/>',
  // 圆环 ＝ 定义域
  domain: '<circle cx="24" cy="24" r="14" fill="none" stroke="currentColor" stroke-width="1.6"/>',
  // 通用兜底
  generic: '<rect x="12" y="12" width="24" height="24" rx="3" fill="none" stroke="currentColor" stroke-width="1.5"/>',
}