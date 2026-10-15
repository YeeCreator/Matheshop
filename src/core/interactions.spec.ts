import { describe, expect, it } from 'vitest'
import { canOpenPopover, packSubgraph, reaches, resolveAction, validateEdge } from './interactions'

describe('interactions · 多模态动作分派（设计 §6.3）', () => {
  it('悬停 → 预览；右键 → 菜单；拖拽 → 移动', () => {
    expect(resolveAction('hover')).toBe('preview')
    expect(resolveAction('contextmenu')).toBe('context-menu')
    expect(resolveAction('drag')).toBe('drag')
  })

  it('左键按修饰键分流：Alt > Ctrl/⌘ > 无', () => {
    expect(resolveAction('click', {})).toBe('inspect')
    expect(resolveAction('click', { ctrl: true })).toBe('open-panel')
    expect(resolveAction('click', { meta: true })).toBe('open-panel')
    expect(resolveAction('click', { alt: true })).toBe('inline-toggle')
    expect(resolveAction('click', { alt: true, ctrl: true })).toBe('inline-toggle')
  })
})

describe('interactions · 端口约束 DAG（设计 §6.4）', () => {
  it('自环被拒', () => {
    const v = validateEdge({ edges: [], from: 'a', to: 'a' })
    expect(v.map((x) => x.code)).toEqual(['self-loop'])
  })

  it('成环被拒', () => {
    const edges = [{ from: 'a', to: 'b' }, { from: 'b', to: 'c' }]
    const v = validateEdge({ edges, from: 'c', to: 'a' })
    expect(v.map((x) => x.code)).toEqual(['would-cycle'])
  })

  it('合法边通过', () => {
    const edges = [{ from: 'a', to: 'b' }]
    expect(validateEdge({ edges, from: 'b', to: 'c' })).toEqual([])
    expect(validateEdge({ edges: [], from: 'a', to: 'b' })).toEqual([])
  })

  it('可达性查询（迭代 DFS）', () => {
    const edges = [{ from: 'a', to: 'b' }, { from: 'b', to: 'c' }]
    expect(reaches(edges, 'a', 'c')).toBe(true)
    expect(reaches(edges, 'c', 'a')).toBe(false)
  })
})

describe('interactions · 子图封装与端口（设计 §6.4）', () => {
  it('跨边界边推导入/出端口', () => {
    const composite = packSubgraph({
      id: 'g1',
      members: ['a', 'b'],
      edges: [
        { from: 'x', to: 'a' },  // 外部 → 成员：入端口 a
        { from: 'b', to: 'y' },  // 成员 → 外部：出端口 b
        { from: 'a', to: 'b' },  // 内部边：不产生端口
      ],
    })
    expect(composite.inputPorts).toEqual(['a'])
    expect(composite.outputPorts).toEqual(['b'])
    expect(composite.members).toEqual(['a', 'b'])
  })

  it('无跨边界边时端口为空', () => {
    const composite = packSubgraph({ id: 'g2', members: ['a'], edges: [{ from: 'a', to: 'a' }] })
    expect(composite.inputPorts).toEqual([])
    expect(composite.outputPorts).toEqual([])
  })
})

describe('interactions · 递归弹窗层级', () => {
  it('未达上限可再开', () => {
    expect(canOpenPopover(0, 3)).toBe(true)
    expect(canOpenPopover(2, 3)).toBe(true)
    expect(canOpenPopover(3, 3)).toBe(false)
  })
})
