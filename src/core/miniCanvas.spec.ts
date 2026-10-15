import { describe, expect, it } from 'vitest'
import { DEFAULT_MAX_NESTING_DEPTH, asMiniCanvas, canNest, deriveSubBoardRef } from './miniCanvas'
import type { MatheshopCell } from './matheshopTypes'

const cell = (partial: Partial<MatheshopCell>): MatheshopCell => ({
  id: 'c1', seq: 1, position: { x: 0, y: 0 }, size: { w: 240, h: 132 },
  color: '#111', content: '', blocks: [], ...partial,
})

describe('miniCanvas · 便签引用', () => {
  it('只有 kind=MiniCanvas 且带 subBoard 才算便签', () => {
    expect(asMiniCanvas(cell({ kind: 'Theorem' }))).toBeNull()
    expect(asMiniCanvas(cell({ kind: 'MiniCanvas' }))).toBeNull()
    const ref = deriveSubBoardRef('wb-2', null)
    expect(asMiniCanvas(cell({ kind: 'MiniCanvas', subBoard: ref }))).toEqual(ref)
  })

  it('depth 由父层派生（主画布为第 0 层）', () => {
    const first = deriveSubBoardRef('wb-2', null)
    expect(first).toEqual({ subBoardId: 'wb-2', depth: 1, view: 'thumbnail' })
    const second = deriveSubBoardRef('wb-3', first)
    expect(second.depth).toBe(2)
    expect(second.view).toBe('thumbnail')
  })
})

describe('miniCanvas · 嵌套深度约束', () => {
  it('主画布可嵌第 1 层', () => {
    expect(canNest(null)).toBe(true)
  })

  it('达到上限后不再允许内嵌', () => {
    const atLimit = deriveSubBoardRef('wb-9', { subBoardId: 'wb-8', depth: DEFAULT_MAX_NESTING_DEPTH, view: 'expanded' })
    expect(canNest(atLimit)).toBe(false)
    expect(canNest({ subBoardId: 'x', depth: DEFAULT_MAX_NESTING_DEPTH - 1, view: 'thumbnail' })).toBe(true)
  })

  it('最大深度可覆盖', () => {
    const ref = deriveSubBoardRef('wb-2', null)
    expect(canNest(ref, 1)).toBe(false)
    expect(canNest(ref, 2)).toBe(true)
  })
})
