/**
 * 契约3 · 关系数据单源与多视图投影（框架无关核心）。
 *
 * 范式二的核心：**同一套底层数据的多种视图投影**，而非多张独立的图。
 * 底层为关系数据 `{ i, j, weight, label }`，投影为矩阵视图（代数视角）
 * 与网络图视图（拓扑视角），二者共用同一数据源并双向联动高亮。
 *
 * 本模块只做数据投影与邻域计算，**不含任何渲染**；渲染由视图层承担。
 */

/** 契约3 · 关系数据单源：i→j 的影响/依赖，权重与可选标签。 */
export type RelationDatum = {
  /** 源个体（矩阵的行）。 */
  i: number
  /** 目标个体（矩阵的列）。 */
  j: number
  weight: number
  label?: string
}

/** 邻域高亮选择：`row` = 某源个体（出邻域），`column` = 某目标个体（入邻域），`node` = 某个体（双向）。 */
export type RelationFocus =
  | { kind: 'row'; index: number }
  | { kind: 'column'; index: number }
  | { kind: 'node'; index: number }
  | null

/** 契约1 高亮结果：矩阵与网络两视图共用的选中集合。 */
export type HighlightSets = {
  /** 高亮的行集合（源个体）。 */
  rows: Set<number>
  /** 高亮的列集合（目标个体）。 */
  columns: Set<number>
  /** 高亮的边（以 `i→j` 的 `${i}-${j}` 键表示）。 */
  edges: Set<string>
  /** 高亮的节点集合。 */
  nodes: Set<number>
}

const edgeKey = (i: number, j: number): string => `${i}-${j}`

/** 由关系数据求出全部涉事个体（升序去重）。 */
export function collectIndices(relations: RelationDatum[]): number[] {
  const set = new Set<number>()
  for (const relation of relations) {
    set.add(relation.i)
    set.add(relation.j)
  }
  return Array.from(set).sort((left, right) => left - right)
}

/**
 * 矩阵视图投影：行＝源 i、列＝目标 j、单元格＝权重。
 *
 * @param relations 关系数据单源。
 * @returns 行/列索引表 + 权重查询函数（供表格渲染）。
 *
 * @example
 * const m = projectMatrix([{ i: 0, j: 1, weight: 2 }])
 * m.weight(0, 1) // -> 2
 */
export function projectMatrix(relations: RelationDatum[]): {
  indices: number[]
  weight: (i: number, j: number) => number | undefined
} {
  const table = new Map<string, number>()
  for (const relation of relations) {
    table.set(edgeKey(relation.i, relation.j), (table.get(edgeKey(relation.i, relation.j)) ?? 0) + relation.weight)
  }
  return {
    indices: collectIndices(relations),
    weight: (i, j) => table.get(edgeKey(i, j)),
  }
}

/** 网络视图投影：节点集合 + 有向边表。 */
export function projectNetwork(relations: RelationDatum[]): {
  nodes: number[]
  edges: Array<{ i: number; j: number; weight: number; label?: string }>
} {
  return {
    nodes: collectIndices(relations),
    edges: relations.map((relation) => ({ i: relation.i, j: relation.j, weight: relation.weight, label: relation.label })),
  }
}

/**
 * 由焦点求两视图共用的高亮集合——这是双向联动的**唯一真相**。
 *
 * - `row i`：高亮第 i 行（i 影响他者＝出邻域）；
 * - `column j`：高亮第 j 列（j 受他者影响＝入邻域）；
 * - `node n`：双向（出 + 入）。
 *
 * @param relations 关系数据单源。
 * @param focus 当前焦点。
 * @returns 高亮集合（空集表示无高亮）。
 *
 * @example
 * highlightFor(relations, { kind: 'row', index: 0 }).nodes // -> Set { 0, ...出邻域 }
 */
export function highlightFor(relations: RelationDatum[], focus: RelationFocus): HighlightSets {
  const rows = new Set<number>()
  const columns = new Set<number>()
  const edges = new Set<string>()
  const nodes = new Set<number>()

  if (!focus) {
    return { rows, columns, edges, nodes }
  }

  const wantOut = focus.kind === 'row' || focus.kind === 'node'
  const wantIn = focus.kind === 'column' || focus.kind === 'node'
  const index = focus.index

  if (wantOut) {
    rows.add(index)
    nodes.add(index)
    for (const relation of relations) {
      if (relation.i === index) {
        edges.add(edgeKey(relation.i, relation.j))
        nodes.add(relation.j)
        columns.add(relation.j)
      }
    }
  }

  if (wantIn) {
    columns.add(index)
    nodes.add(index)
    for (const relation of relations) {
      if (relation.j === index) {
        edges.add(edgeKey(relation.i, relation.j))
        nodes.add(relation.i)
        rows.add(relation.i)
      }
    }
  }

  return { rows, columns, edges, nodes }
}

/** 把关系数据渲染为表格行（行＝源 i，各列为目标 j 的权重）。 */
export function toTableRows(relations: RelationDatum[]): Array<Record<string, unknown>> {
  const { indices, weight } = projectMatrix(relations)
  return indices.map((i) => {
    const row: Record<string, unknown> = { id: String(i), source: i }
    for (const j of indices) {
      const value = weight(i, j)
      row[`c${j}`] = value === undefined ? '' : String(value)
    }
    return row
  })
}
