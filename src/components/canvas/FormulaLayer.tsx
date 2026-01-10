import katex from 'katex'
import type React from 'react'
import { screenToWorld, type Camera, worldToScreen } from './utils/geometry'

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

  camera: Camera
  canvasEl: HTMLCanvasElement | null
  wrapEl: HTMLDivElement | null

  onSelectFormula: (id: string | null) => void
  onStartDrag: (args: { id: string; pointerId: number; startWorld: { x: number; y: number }; startFormula: { x: number; y: number } }) => void
}

export default function FormulaLayer(props: FormulaLayerProps) {
  const { formulas, selectedFormulaId, camera, canvasEl, wrapEl, onSelectFormula, onStartDrag } = props

  if (!canvasEl || !wrapEl) return null

  const canvasRect = canvasEl.getBoundingClientRect()
  const wrapRect = wrapEl.getBoundingClientRect()

  const clientToScreenPx = (clientX: number, clientY: number) => {
    const xCssInWorkspace = clientX - wrapRect.left + wrapEl.scrollLeft
    const yCssInWorkspace = clientY - wrapRect.top + wrapEl.scrollTop

    return {
      x: (xCssInWorkspace / canvasRect.width) * canvasEl.width,
      y: (yCssInWorkspace / canvasRect.height) * canvasEl.height,
    }
  }

  const worldToCss = (world: { x: number; y: number }) => {
    const screenPx = worldToScreen(world, camera)
    const xCssInWorkspace = (screenPx.x / canvasEl.width) * canvasRect.width
    const yCssInWorkspace = (screenPx.y / canvasEl.height) * canvasRect.height

    return {
      left: xCssInWorkspace - wrapEl.scrollLeft,
      top: yCssInWorkspace - wrapEl.scrollTop,
    }
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

              const screen = clientToScreenPx(ev.clientX, ev.clientY)
              const world = screenToWorld(screen, camera)

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
