export type Vec2 = { x: number; y: number }

export type Size = { w: number; h: number }

export type CellId = string

export type EdgeId = string


export type TextBlock = {
  id: string
  type: 'text'
  text: string
}

/** D6 推导状态标记：前端据此视觉区分猜想与已验证公式（对齐学术轨 raw/rewritten/proven/conjecture）。 */
export type DerivationStatus = 'raw' | 'rewritten' | 'proven' | 'conjecture'

/** D4 冻结标记 + 占位符 id：圈选子式冻结时打标，下发计算以 id 屏蔽、回填按 id 恢复。 */
export type FrozenMark = {
  placeholderId: string
  reason?: string
}

export type LatexBlock = {
  id: string
  type: 'latex'
  latex: string
  displayMode: boolean
  /** 冻结占位符 id（该 block 被冻结时分配），下发计算时屏蔽内部结构。 */
  placeholderId?: string
  /** 该 block 是否处于冻结态（视图层高亮，导出 LaTeX 时不泄露）。 */
  frozen?: boolean
}

export type CellBlock = TextBlock | LatexBlock

export type MatheshopCell = {
  id: CellId
  seq: number
  position: Vec2
  size: Size
  color: string
  content: string
  blocks: CellBlock[]
  /** D6 推导状态：CNL 候选结果为 conjecture，经校验/重写后升级；渲染层据此视觉区分。 */
  status?: DerivationStatus
  /** D4 冻结标记：单元被子式冻结时承载占位符登记（视图层，不入对象层 IR）。 */
  frozen?: FrozenMark
}

export type MatheshopEdge = {
  id: EdgeId
  from: CellId
  to: CellId
}

export type MatheshopHistoryEntry = {
  id: string
  label: string
  createdAt: string
}

export type MatheshopTool = 'text'