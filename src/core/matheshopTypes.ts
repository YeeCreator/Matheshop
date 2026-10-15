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

export type CellBlock = TextBlock | LatexBlock | ConceptIconBlock

/** 契约1 契约1 · 概念象形图标：形态只表类别、不承载推理（低密度档渲染）。 */
export type ConceptShape = 'matrix' | 'network' | 'space3d' | 'handRule' | 'domain' | 'generic'

export type ConceptIconBlock = {
  id: string
  type: 'conceptIcon'
  /** 形态类别（不承载推理信息，仅索引心智模型）。 */
  shape: ConceptShape
  /** 可选短标签（不写公式、不带下标）。 */
  caption?: string
}

/** 契约1 · 知识单元类型（视图层枚举；缺省视为普通文本单元）。 */
export type CellKind =
  | 'Definition'
  | 'Axiom'
  | 'Lemma'
  | 'Theorem'
  | 'Corollary'
  | 'Proof'
  | 'Example'
  | 'CounterExample'
  | 'Exercise'
  | 'ConceptSketch'
  | 'VisualModel'

/** 契约2 · 语义关系边类型（12 值，与学术轨 IR 边类型同源命名）。 */
export type EdgeKind =
  | 'uses'
  | 'implies'
  | 'illustrates'
  | 'contradicts'
  | 'derives'
  | 'equivalent'
  | 'counterexample'
  | 'refutes'
  | 'analogous'
  | 'dual'
  | 'specializes'
  | 'generalizes'

export type MatheshopCell = {
  id: CellId
  seq: number
  position: Vec2
  size: Size
  color: string
  content: string
  blocks: CellBlock[]
  /** 契约1 知识单元类型（视图层枚举；缺省视为普通文本单元）。 */
  kind?: CellKind
  /** D6 推导状态：CNL 候选结果为 conjecture，经校验/重写后升级；渲染层据此视觉区分。 */
  status?: DerivationStatus
  /** D4 冻结标记：单元被子式冻结时承载占位符登记（视图层，不入对象层 IR）。 */
  frozen?: FrozenMark
  /**
   * 契约1 视图层元属性：连续语义粒度（0..1）。
   * 低密度≈概念象形图标，高密度≈完整 LaTeX。不入对象层 IR，导出不泄露。
   */
  density?: number
}

export type MatheshopEdge = {
  id: EdgeId
  from: CellId
  to: CellId
  /** 契约2 语义关系边类型（缺省 = 无类型链接，兼容旧数据）。 */
  kind?: EdgeKind
  /** 注释边：如「A→B：此处用三角不等式放缩」。 */
  label?: string
}

export type MatheshopHistoryEntry = {
  id: string
  label: string
  createdAt: string
}

export type MatheshopTool = 'text'