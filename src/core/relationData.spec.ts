import { describe, expect, it } from 'vitest'
import {
  collectIndices,
  highlightFor,
  projectMatrix,
  projectNetwork,
  toTableRows,
  type RelationDatum,
} from './relationData'

/** 契约3 测试夹具：4 个体、5 条有向关系。 */
const RELATIONS: RelationDatum[] = [
  { i: 0, j: 1, weight: 2 },
  { i: 0, j: 2, weight: 1 },
  { i: 1, j: 2, weight: 3 },
  { i: 2, j: 0, weight: 1.5 },
  { i: 3, j: 2, weight: 1, label: '弱影响' },
]

describe('relationData · 契约3 数据同源投影', () => {
  it('个体集合升序去重', () => {
    expect(collectIndices(RELATIONS)).toEqual([0, 1, 2, 3])
  })

  it('矩阵投影按 i→j 取权重', () => {
    const matrix = projectMatrix(RELATIONS)
    expect(matrix.indices).toEqual([0, 1, 2, 3])
    expect(matrix.weight(0, 1)).toBe(2)
    expect(matrix.weight(0, 2)).toBe(1)
    expect(matrix.weight(3, 2)).toBe(1)
    expect(matrix.weight(1, 0)).toBeUndefined()
  })

  it('同 i→j 多条时权重累加', () => {
    const matrix = projectMatrix([...RELATIONS, { i: 0, j: 1, weight: 4 }])
    expect(matrix.weight(0, 1)).toBe(6)
  })

  it('网络投影保留有向边与标签', () => {
    const network = projectNetwork(RELATIONS)
    expect(network.nodes).toEqual([0, 1, 2, 3])
    expect(network.edges).toHaveLength(5)
    expect(network.edges[4].label).toBe('弱影响')
  })
})

describe('relationData · 双向联动高亮', () => {
  it('选行 i：高亮出邻域（行 i + i 的出边）', () => {
    const { rows, edges, nodes } = highlightFor(RELATIONS, { kind: 'row', index: 0 })
    expect(rows.has(0)).toBe(true)
    expect(edges.has('0-1')).toBe(true)
    expect(edges.has('0-2')).toBe(true)
    // 0 无入边，故不应含其他边
    expect(edges.has('1-2')).toBe(false)
    expect(nodes.has(1)).toBe(true)
  })

  it('选列 j：高亮入邻域（列 j + 指向 j 的边）', () => {
    const { columns, edges } = highlightFor(RELATIONS, { kind: 'column', index: 2 })
    expect(columns.has(2)).toBe(true)
    expect(edges.has('0-2')).toBe(true)
    expect(edges.has('1-2')).toBe(true)
    expect(edges.has('3-2')).toBe(true)
    expect(edges.has('2-0')).toBe(false)
  })

  it('选节点 n：双向（出 + 入）', () => {
    const { edges } = highlightFor(RELATIONS, { kind: 'node', index: 2 })
    expect(edges.has('0-2')).toBe(true) // 入
    expect(edges.has('2-0')).toBe(true) // 出
  })

  it('无焦点时全空', () => {
    const { rows, columns, edges, nodes } = highlightFor(RELATIONS, null)
    expect([rows.size, columns.size, edges.size, nodes.size]).toEqual([0, 0, 0, 0])
  })
})

describe('relationData · 表格投影', () => {
  it('行＝源 i，列为目标 j 的权重', () => {
    const rows = toTableRows(RELATIONS)
    expect(rows).toHaveLength(4)
    expect(rows[0]).toMatchObject({ id: '0', source: 0, c1: '2', c2: '1' })
    expect(rows[0].c0).toBe('')
  })
})
