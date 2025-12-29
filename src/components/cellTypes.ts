export type CellId = string

export type Vec2 = { x: number; y: number }

export type Size = { w: number; h: number }

export type CellKind = 'cell' | 'group'

// --- Obsidian Canvas 风格：连接线 ---
export type EdgeId = string

export type PortSide = 'n' | 'e' | 's' | 'w'

export type CanvasEdge = {
  id: EdgeId
  from: CellId
  to: CellId

  /** 可选：连接端口（节点四边） */
  fromPort?: PortSide
  toPort?: PortSide

  /** 预留：未来可以给边加样式/标签/箭头等 */
  label?: string
}

export type TextBlock = {
  id: string
  type: 'text'
  text: string
}

export type LatexBlock = {
  id: string
  type: 'latex'
  latex: string
  displayMode?: boolean
}

export type CellRefBlock = {
  id: string
  type: 'cellRef'
  targetCellId: CellId
}

export type CellBlock = TextBlock | LatexBlock | CellRefBlock

export type CellNode = {
  id: CellId

  /** 父单元框 id；null 表示根节点（直接挂在画布 world 上）*/
  parentId: CellId | null

  /**
   * local 坐标：相对父单元框内容区（或根 world 原点）。
   * 平时拖拽/布局都只更新 localPos。
   */
  localPos: Vec2

  /**
   * world 坐标缓存：用于渲染/命中测试。
   * 只有当嵌套关系改变（parentId 变化、或父链结构变更）时才重新计算。
   */
  worldPos: Vec2

  /** 以 CSS 像素为单位的尺寸（先不随 zoom 缩放，后续可调整策略） */
  size: Size

  /** 单元类型：普通 cell 或 group（可折叠的容器） */
  kind: CellKind

  /** group 折叠状态（kind === 'group' 时有效） */
  collapsed?: boolean

  /**
   * 结构化内容：用于渲染/后续符号计算。
   * 过渡期保留 content 字段，用于向 blocks 迁移。
   */
  blocks?: CellBlock[]

  /** 多行内容：旧字段（兼容）；未来以 blocks 为准 */
  content: string

  /** 子单元框（嵌套结构） */
  children: CellNode[]

  /** 连接线（自由双向连接） */
  edges?: CanvasEdge[]
}
