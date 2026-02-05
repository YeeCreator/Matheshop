/**
 * viewportCoords
 *
 * 统一的坐标换算工具（viewport-kit 版本）。
 *
 * 目标：在迁移过程中，避免每个 Layer 各自实现一套“canvas 像素 ↔ workspace CSS ↔ wrap 滚动”的换算。
 *
 * 约定（重要）：
 * - world：业务世界坐标（cell/edge/formula 的存储坐标）。
 * - screenCssPx：wrap 容器本地的 CSS 像素坐标（viewport-kit 的 screen 坐标语义）。
 * - workspaceCssPx：workspace 内的 CSS 坐标（需要加上 wrap.scrollLeft/Top 才能得到）。
 *
 * 现状（matheshop 画布结构）：
 * - wrap（可滚动视口）包含一个超大 workspace（8000x8000）以及覆盖其上的 canvas/SVG/DOM 层。
 * - 因此 DOM 定位通常要基于“workspace 内的 CSS 坐标”，最后再减去 wrap.scroll 得到视口内位置。
 */

import type { Camera2D } from 'viewport-kit'
import { screenToWorld, worldToScreen } from 'viewport-kit'

export type CssPoint = { x: number; y: number }
export type WorldPoint = { x: number; y: number }

export function clientToLocalCssPoint(wrapEl: HTMLDivElement, clientX: number, clientY: number): CssPoint {
  const rect = wrapEl.getBoundingClientRect()
  return { x: clientX - rect.left, y: clientY - rect.top }
}

export function localCssToWorkspaceCss(wrapEl: HTMLDivElement, localCss: CssPoint): CssPoint {
  return { x: localCss.x + wrapEl.scrollLeft, y: localCss.y + wrapEl.scrollTop }
}

export function workspaceCssToLocalCss(wrapEl: HTMLDivElement, workspaceCss: CssPoint): CssPoint {
  return { x: workspaceCss.x - wrapEl.scrollLeft, y: workspaceCss.y - wrapEl.scrollTop }
}

export function worldToWorkspaceCss(camera: Camera2D, world: WorldPoint): CssPoint {
  // viewport-kit：worldToScreen(camera, world)
  const s = worldToScreen(camera, world)
  return { x: s.x, y: s.y }
}

export function localCssToWorld(camera: Camera2D, localCss: CssPoint): WorldPoint {
  // viewport-kit：screenToWorld(camera, screen)
  const w = screenToWorld(camera, localCss)
  return { x: w.x, y: w.y }
}

export function worldToLocalCss(_wrapEl: HTMLDivElement, camera: Camera2D, world: WorldPoint): CssPoint {
  // 重要：viewport-kit 的 screen/overlay 坐标语义是“容器本地 CSS px”。
  // 因此这里不应再叠加或扣除 wrap.scrollLeft/Top。
  // 如果某些历史层仍然以“workspace 内 CSS 坐标”定位，请改用 worldToWorkspaceCss + workspaceCssToLocalCss。
  const s = worldToScreen(camera, world)
  return { x: s.x, y: s.y }
}

/**
 * 兼容旧结构：把 world 映射到“workspace 内 CSS 坐标”，然后再减 wrap.scroll 得到视口内坐标。
 *
 * 说明：这是为还未完成迁移的 Layer 保留的过渡 API。
 */
export function worldToLocalCssWithScroll(wrapEl: HTMLDivElement, camera: Camera2D, world: WorldPoint): CssPoint {
  const ws = worldToWorkspaceCss(camera, world)
  return workspaceCssToLocalCss(wrapEl, ws)
}
