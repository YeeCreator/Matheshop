import { describe, expect, it } from 'vitest'
import { SymbolTable, deriveAnchors } from './symbolTable'

const makeTable = () => {
  const table = new SymbolTable()
  table.replaceAll([
    { id: 'sym:A', name: 'A', aliases: ['adjacency'], scope: 'global', description: '邻接矩阵' },
    { id: 'sym:x', name: 'x', aliases: [], scope: 'global' },
    { id: 'sym:t', name: 't', aliases: [], scope: 'local:proof-1' },
  ])
  return table
}

describe('symbolTable · 契约4 登记与查询', () => {
  it('按 id 查找', () => {
    const table = makeTable()
    expect(table.find('sym:A')?.name).toBe('A')
    expect(table.find('nope')).toBeUndefined()
  })

  it('按主名或别名查找', () => {
    const table = makeTable()
    expect(table.findByName('A')?.id).toBe('sym:A')
    expect(table.findByName('adjacency')?.id).toBe('sym:A')
    expect(table.findByName('zzz')).toBeUndefined()
  })

  it('upsert 去重（同 id 更新）', () => {
    const table = makeTable()
    table.upsert({ id: 'sym:A', name: 'A', aliases: ['adj'], scope: 'global', description: '改后' })
    expect(table.find('sym:A')?.description).toBe('改后')
    expect(table.getSnapshot().entries).toHaveLength(3)
  })

  it('remove 生效且订阅通知', () => {
    const table = makeTable()
    let calls = 0
    const off = table.subscribe(() => (calls += 1))
    table.remove('sym:x')
    expect(table.find('sym:x')).toBeUndefined()
    expect(calls).toBeGreaterThanOrEqual(2) // 订阅即时回调 + 变更
    off()
  })
})

describe('symbolTable · 公式变量锚点推导', () => {
  it('命中符号表的字母产出锚点，未命中跳过', () => {
    const table = makeTable()
    const anchors = deriveAnchors('A_{ij} = y + x', table)
    const names = anchors.map((a) => a.name).sort()
    expect(names).toEqual(['A', 'x']) // y 未登记
    expect(anchors.find((a) => a.name === 'A')?.symbolId).toBe('sym:A')
  })
})
