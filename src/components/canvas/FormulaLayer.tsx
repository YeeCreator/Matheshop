/**
 * FormulaLayer.tsx
 *
 * LaTeX 公式的 DOM 渲染层（基于 KaTeX）：
 * - 将每个公式的 world 坐标通过 camera 换算为 workspace 内 CSS 定位（absolute/fixed 由样式决定）；
 * - 使用 katex.renderToString 生成 HTML 并通过 dangerouslySetInnerHTML 注入（HTML 来源于 KaTeX 输出）；
 * - 支持选中与拖拽：
 *   - PointerDown 阻止冒泡到 canvas；
 *   - 左键开始拖拽，capture pointer，并向上层回传拖拽起点（startWorld + startFormula）。
 *
 * 坐标换算：
 * client(浏览器) -> wrap 本地 CSS 坐标 -> world(画布逻辑坐标)。
 */
import katex from 'katex'
import type React from 'react'
import type { Camera2D } from 'viewport-2d-kit'
import { clientToLocalCssPoint, localCssToWorld, worldToLocalCssWithScroll } from 'viewport-2d-kit'

type FormulaItem = {
  id: string
  latex: string
  x: number
  y: number
  color: string
  fontSize: number
}

export type FormulaLayerProps = {
  formulas: FormulaItem[]
  selectedFormulaId: string | null

  camera: Camera2D
  canvasEl: HTMLCanvasElement | null
  wrapEl: HTMLDivElement | null

  onSelectFormula: (id: string | null) => void
  onStartDrag: (args: { id: string; pointerId: number; startWorld: { x: number; y: number }; startFormula: { x: number; y: number } }) => void
}

export default function FormulaLayer(props: FormulaLayerProps) {
  const { formulas, selectedFormulaId, camera, canvasEl, wrapEl, onSelectFormula, onStartDrag } = props

  if (!canvasEl || !wrapEl) return null

  const worldToCss = (world: { x: number; y: number }) => {
    const local = worldToLocalCssWithScroll(wrapEl, camera, world)
    return { left: local.x, top: local.y }
  }

  return (
    <div className="formula-layer">
      {formulas.map((f) => {
        const css = worldToCss({ x: f.x, y: f.y })

        let html = ''
        try {
          html = katex.renderToString(f.latex, {
            throwOnError: false,
            displayMode: true,
            output: 'html',
          })
        } catch {
          html = `<span style="color:#c00">LaTeX 渲染失败</span>`
        }

        const isSelected = selectedFormulaId === f.id

        return (
          <div
            key={f.id}
            className={`formula-item${isSelected ? ' is-selected' : ''}`}
            style={{ left: css.left, top: css.top, color: f.color, fontSize: f.fontSize }}
            onPointerDown={(ev: React.PointerEvent<HTMLDivElement>) => {
              // 让公式可交互：阻止事件冒泡到 canvas
              ev.preventDefault()
              ev.stopPropagation()

              onSelectFormula(f.id)

              // 左键开始拖拽
              if (ev.button !== 0) return

              canvasEl.setPointerCapture(ev.pointerId)

              const world = (() => {
                const screen = clientToLocalCssPoint(wrapEl, ev.clientX, ev.clientY)
                return localCssToWorld(camera, screen)
              })()

              onStartDrag({
                id: f.id,
                pointerId: ev.pointerId,
                startWorld: world,
                startFormula: { x: f.x, y: f.y },
              })
            }}
            dangerouslySetInnerHTML={{ __html: html }}
          />
        )
      })}
    </div>
  )
}
