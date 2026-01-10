import React from 'react'
import type { CellNode } from '../../cellTypes'

export type CanvasCellChildrenProps = {
  collapsed: boolean | undefined
  childrenNodes: CellNode[]
  depth: number
  parentWorld: { x: number; y: number }
  renderChild: (child: CellNode, depth: number, parentWorld: { x: number; y: number }) => React.ReactNode
}

export default function CanvasCellChildren(props: CanvasCellChildrenProps) {
  const { collapsed, childrenNodes, depth, parentWorld, renderChild } = props

  if (collapsed) return null
  if (childrenNodes.length === 0) return null

  return <div className="cell-children">{childrenNodes.map((ch) => renderChild(ch, depth + 1, parentWorld))}</div>
}

