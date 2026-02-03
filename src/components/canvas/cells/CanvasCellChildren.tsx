/**
 * CanvasCellChildren
 *
 * 渲染某个 cell 的子节点容器（children 区域）。
 * - 当 `collapsed` 为真时不渲染（返回 null），用于组节点折叠。
 * - 当 `childrenNodes` 为空时不渲染，避免产生多余 DOM。
 * - 实际子节点的渲染由 `renderChild(child, nextDepth, parentWorld)` 委托给上层，
 *   以便复用 layout/坐标计算与递归渲染策略。
 */
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
