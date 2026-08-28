export type Vec2 = { x: number; y: number }

export type Size = { w: number; h: number }

export type CellId = string

export type EdgeId = string


export type TextBlock = {
  id: string
  type: 'text'
  text: string
}

export type LatexBlock = {
  id: string
  type: 'latex'
  latex: string
  displayMode: boolean
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