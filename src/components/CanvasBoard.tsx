import { useCallback, useEffect, useRef, useState } from 'react'
import katex from 'katex'

export type Tool = 'text'

export type HistoryEntry = {
  id: string
  label: string
  at: number
}

export type CanvasHistorySource = 'user' | 'system'

export type CanvasBoardProps = {
  tool: Tool
  color: string
  onHistoryPush: (entry: HistoryEntry, source?: CanvasHistorySource) => void
  requestClearToken: number
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n))
}

function resizeCanvasToDisplaySize(canvas: HTMLCanvasElement) {
  const rect = canvas.getBoundingClientRect()
  const dpr = window.devicePixelRatio || 1
  const nextWidth = Math.max(1, Math.floor(rect.width * dpr))
  const nextHeight = Math.max(1, Math.floor(rect.height * dpr))
  if (canvas.width !== nextWidth || canvas.height !== nextHeight) {
    canvas.width = nextWidth
    canvas.height = nextHeight
    return true
  }
  return false
}

type Camera = {
  x: number
  y: number
  zoom: number
}

type Stroke = {
  id: string
  tool: 'brush' | 'eraser'
  color: string
  size: number
  points: Array<{ x: number; y: number }>
}

type FormulaItem = {
  id: string
  latex: string
  x: number
  y: number
  color: string
  fontSize: number
}

function worldToScreen(world: { x: number; y: number }, cam: Camera) {
  return { x: (world.x - cam.x) * cam.zoom, y: (world.y - cam.y) * cam.zoom }
}

// (worldToScreen currently unused; keep only screenToWorld for drawing input)

function screenToWorld(screen: { x: number; y: number }, cam: Camera) {
  return { x: screen.x / cam.zoom + cam.x, y: screen.y / cam.zoom + cam.y }
}

function getCanvasScreenPoint(canvas: HTMLCanvasElement, clientX: number, clientY: number) {
  const rect = canvas.getBoundingClientRect()
  const xCss = clientX - rect.left
  const yCss = clientY - rect.top
  const sx = (xCss / rect.width) * canvas.width
  const sy = (yCss / rect.height) * canvas.height
  return { x: sx, y: sy }
}

export default function CanvasBoard(props: CanvasBoardProps) {
  const { tool, color, onHistoryPush, requestClearToken } = props

  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const wrapRef = useRef<HTMLDivElement | null>(null)

  // 目前先保留 strokes 的实现但不再提供 UI/入口；后续如确定完全不需要，可再删。
  const strokesRef = useRef<Stroke[]>([])
  const redoRef = useRef<Stroke[]>([])
  const backgroundRef = useRef<string>('#ffffff')

  const cameraRef = useRef<Camera>({ x: 0, y: 0, zoom: 1 })

  const [formulas, setFormulas] = useState<FormulaItem[]>([])

  const [selectedFormulaId, setSelectedFormulaId] = useState<string | null>(null)
  const draggingFormulaRef = useRef<
    | null
    | {
        id: string
        pointerId: number
        startWorld: { x: number; y: number }
        startFormula: { x: number; y: number }
      }
  >(null)

  const didInitRef = useRef(false)
  const lastClearTokenRef = useRef<number>(0)

  const rafRef = useRef<number | null>(null)
  const scheduleRender = useCallback(() => {
    if (rafRef.current != null) return
    rafRef.current = window.requestAnimationFrame(() => {
      rafRef.current = null
      render()
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const [isPanning, setIsPanning] = useState(false)
  const panStartRef = useRef<{
    pointerId: number
    startScreen: { x: number; y: number }
    startCam: Camera
  } | null>(null)

  const [isSpaceDown, setIsSpaceDown] = useState(false)

  const [editor, setEditor] = useState<
    | null
    | {
        id: string
        latex: string
        world: { x: number; y: number }
        css: { left: number; top: number }
      }
  >(null)

  const editorInputRef = useRef<HTMLTextAreaElement | null>(null)

  const [renderTick, setRenderTick] = useState(0)

  const bumpRenderTick = useCallback(() => {
    setRenderTick((x) => x + 1)
  }, [])

  const render = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // Clear in screen space.
    ctx.save()
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.fillStyle = backgroundRef.current
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.restore()

    const cam = cameraRef.current

    // 可选网格
    const gridSize = 100
    const gridPx = gridSize * cam.zoom
    if (gridPx >= 20) {
      ctx.save()
      ctx.setTransform(cam.zoom, 0, 0, cam.zoom, -cam.x * cam.zoom, -cam.y * cam.zoom)
      ctx.lineWidth = 1 / cam.zoom
      ctx.strokeStyle = 'rgba(0,0,0,0.06)'

      const viewWorldTopLeft = screenToWorld({ x: 0, y: 0 }, cam)
      const viewWorldBottomRight = screenToWorld({ x: canvas.width, y: canvas.height }, cam)

      const startX = Math.floor(viewWorldTopLeft.x / gridSize) * gridSize
      const endX = Math.ceil(viewWorldBottomRight.x / gridSize) * gridSize
      const startY = Math.floor(viewWorldTopLeft.y / gridSize) * gridSize
      const endY = Math.ceil(viewWorldBottomRight.y / gridSize) * gridSize

      ctx.beginPath()
      for (let x = startX; x <= endX; x += gridSize) {
        ctx.moveTo(x, startY)
        ctx.lineTo(x, endY)
      }
      for (let y = startY; y <= endY; y += gridSize) {
        ctx.moveTo(startX, y)
        ctx.lineTo(endX, y)
      }
      ctx.stroke()
      ctx.restore()
    }

    bumpRenderTick()
  }, [bumpRenderTick])

  // init + resize observer
  useEffect(() => {
    const canvas = canvasRef.current
    const wrap = wrapRef.current
    if (!canvas || !wrap) return

    // React 19 + StrictMode 下，开发环境可能会重复挂载/执行 effect。
    // 这里用 didInitRef 保证不会把用户刚插入的内容“重置掉”。
    if (!didInitRef.current) {
      didInitRef.current = true
      resizeCanvasToDisplaySize(canvas)
      backgroundRef.current = '#ffffff'
      strokesRef.current = []
      redoRef.current = []
      setFormulas([])
      cameraRef.current = { x: 0, y: 0, zoom: 1 }
      render()
      onHistoryPush({ id: crypto.randomUUID(), label: '初始化画布', at: Date.now() }, 'system')
    }

    const ro = new ResizeObserver(() => {
      const didResize = resizeCanvasToDisplaySize(canvas)
      if (!didResize) return
      render()
      onHistoryPush({ id: crypto.randomUUID(), label: '画布缩放', at: Date.now() }, 'system')
    })

    ro.observe(wrap)
    return () => {
      ro.disconnect()
      if (rafRef.current != null) window.cancelAnimationFrame(rafRef.current)
    }
  }, [onHistoryPush, render])

  const commitFormula = useCallback(
    (latexRaw: string, world: { x: number; y: number }) => {
      const latex = latexRaw.trim()
      if (!latex) return

      const next: FormulaItem = {
        id: crypto.randomUUID(),
        latex,
        x: world.x,
        y: world.y,
        color,
        fontSize: 22,
      }

      setFormulas((prev) => [...prev, next])
      onHistoryPush({ id: crypto.randomUUID(), label: '插入公式', at: Date.now() }, 'user')
      scheduleRender()
    },
    [color, onHistoryPush, scheduleRender],
  )

  const openEditorAtPointer = useCallback((clientX: number, clientY: number) => {
    const canvas = canvasRef.current
    const wrap = wrapRef.current
    if (!canvas || !wrap) return

    const screen = getCanvasScreenPoint(canvas, clientX, clientY)
    const world = screenToWorld(screen, cameraRef.current)

    const rect = wrap.getBoundingClientRect()
    const left = clientX - rect.left
    const top = clientY - rect.top

    setEditor({ id: crypto.randomUUID(), latex: '', world, css: { left, top } })
  }, [])

  useEffect(() => {
    if (!editor) return
    const t = window.setTimeout(() => editorInputRef.current?.focus(), 0)
    return () => window.clearTimeout(t)
  }, [editor])

  // 清空请求：清空公式（也会清空 strokes）
  useEffect(() => {
    if (requestClearToken === 0) return
    if (requestClearToken === lastClearTokenRef.current) return
    lastClearTokenRef.current = requestClearToken

    strokesRef.current = []
    redoRef.current = []
    setFormulas([])
    setEditor(null)

    render()
    onHistoryPush({ id: crypto.randomUUID(), label: '清空画布', at: Date.now() }, 'user')
  }, [requestClearToken, onHistoryPush, render])

  // 空格键按住 -> 临时进入平移手势
  useEffect(() => {
    const down = (ev: KeyboardEvent) => {
      if (ev.code === 'Space') {
        // 避免页面滚动
        ev.preventDefault()
        setIsSpaceDown(true)
      }
    }
    const up = (ev: KeyboardEvent) => {
      if (ev.code === 'Space') {
        setIsSpaceDown(false)
      }
    }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
    }
  }, [])

  // Esc 取消选中 / 取消拖拽
  useEffect(() => {
    const onKeyDown = (ev: KeyboardEvent) => {
      if (ev.key !== 'Escape') return
      draggingFormulaRef.current = null
      setIsPanning(false)
      panStartRef.current = null
      setSelectedFormulaId(null)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return

    // 如果正在拖拽公式，不要让画布再吃到新的 pointerdown
    if (draggingFormulaRef.current) {
      e.preventDefault()
      return
    }

    e.preventDefault()

    const isMiddle = e.button === 1
    const isMiddleByButtons = (e.buttons & 4) === 4

    // 中键 或 空格+左键：拖拽平移
    if (isMiddle || isMiddleByButtons || (isSpaceDown && e.button === 0)) {
      canvas.setPointerCapture(e.pointerId)
      setIsPanning(true)
      const screen = getCanvasScreenPoint(canvas, e.clientX, e.clientY)
      panStartRef.current = { pointerId: e.pointerId, startScreen: screen, startCam: { ...cameraRef.current } }
      return
    }

    // 文本/公式：左键点击插入
    if (tool === 'text' && e.button === 0) {
      setSelectedFormulaId(null)
      openEditorAtPointer(e.clientX, e.clientY)
      scheduleRender()
    }
  }

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return

    // 拖拽公式：优先级最高
    if (draggingFormulaRef.current && draggingFormulaRef.current.pointerId === e.pointerId) {
      e.preventDefault()
      const screen = getCanvasScreenPoint(canvas, e.clientX, e.clientY)
      const world = screenToWorld(screen, cameraRef.current)
      const d = draggingFormulaRef.current
      const dx = world.x - d.startWorld.x
      const dy = world.y - d.startWorld.y

      setFormulas((prev) =>
        prev.map((f) => (f.id === d.id ? { ...f, x: d.startFormula.x + dx, y: d.startFormula.y + dy } : f)),
      )
      scheduleRender()
      return
    }

    if (isPanning && (e.buttons & 4) === 0 && !(isSpaceDown && (e.buttons & 1) === 1)) {
      setIsPanning(false)
      panStartRef.current = null
    }

    if (!isPanning) return

    e.preventDefault()
    const s = panStartRef.current
    if (!s) return
    const screen = getCanvasScreenPoint(canvas, e.clientX, e.clientY)
    const dxScreen = screen.x - s.startScreen.x
    const dyScreen = screen.y - s.startScreen.y
    const cam = s.startCam

    cameraRef.current = {
      x: cam.x - dxScreen / cam.zoom,
      y: cam.y - dyScreen / cam.zoom,
      zoom: cam.zoom,
    }

    scheduleRender()
  }

  const handlePointerUpOrCancel = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return
    e.preventDefault()

    // 结束拖拽公式
    if (draggingFormulaRef.current && draggingFormulaRef.current.pointerId === e.pointerId) {
      try {
        canvas.releasePointerCapture(e.pointerId)
      } catch {
        // ignore
      }
      draggingFormulaRef.current = null
      scheduleRender()
      return
    }

    if (isPanning) {
      setIsPanning(false)
      panStartRef.current = null
    }
  }

  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return

    // 拿走滚轮，避免页面滚动
    e.preventDefault()

    const cam = cameraRef.current

    // Shift + 滚轮：横向平移
    if (e.shiftKey && !e.ctrlKey) {
      cameraRef.current = {
        ...cam,
        x: cam.x + e.deltaY / cam.zoom,
      }
      scheduleRender()
      return
    }

    // 普通滚轮：缩放（以鼠标位置为中心）
    const screen = getCanvasScreenPoint(canvas, e.clientX, e.clientY)
    const worldBefore = screenToWorld(screen, cam)

    const zoomIntensity = 0.0028
    const factor = Math.exp(-e.deltaY * zoomIntensity)
    const nextZoom = clamp(cam.zoom * factor, 0.1, 8)

    cameraRef.current = {
      zoom: nextZoom,
      x: worldBefore.x - screen.x / nextZoom,
      y: worldBefore.y - screen.y / nextZoom,
    }

    scheduleRender()
  }

  return (
    <div className="canvas-shell">
      <div className="canvas-wrap" ref={wrapRef}>
        <canvas
          ref={canvasRef}
          className="canvas"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUpOrCancel}
          onPointerCancel={handlePointerUpOrCancel}
          onWheel={handleWheel}
        />

        <div className="formula-layer" data-tick={renderTick}>
          {(() => {
            const cam = cameraRef.current
            const canvas = canvasRef.current
            const wrap = wrapRef.current
            if (!canvas || !wrap) return null

            const rect = wrap.getBoundingClientRect()

            return formulas.map((f: FormulaItem) => {
              const screenPx = worldToScreen({ x: f.x, y: f.y }, cam)
              const xCss = (screenPx.x / canvas.width) * rect.width
              const yCss = (screenPx.y / canvas.height) * rect.height

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
                  style={{ left: xCss, top: yCss, color: f.color, fontSize: f.fontSize }}
                  onPointerDown={(ev) => {
                    // 让公式可交互：阻止事件冒泡到 canvas
                    ev.preventDefault()
                    ev.stopPropagation()

                    const canvasEl = canvasRef.current
                    if (!canvasEl) return

                    setSelectedFormulaId(f.id)

                    // 左键开始拖拽
                    if (ev.button !== 0) return

                    canvasEl.setPointerCapture(ev.pointerId)

                    const screen = getCanvasScreenPoint(canvasEl, ev.clientX, ev.clientY)
                    const world = screenToWorld(screen, cameraRef.current)

                    draggingFormulaRef.current = {
                      id: f.id,
                      pointerId: ev.pointerId,
                      startWorld: world,
                      startFormula: { x: f.x, y: f.y },
                    }
                  }}
                  dangerouslySetInnerHTML={{ __html: html }}
                />
              )
            })
          })()}
        </div>

        {editor && (
          <div
            className="latex-editor"
            style={{ left: editor.css.left, top: editor.css.top }}
            onPointerDown={(ev) => {
              ev.stopPropagation()
            }}
          >
            <div className="latex-editor-row">
              <textarea
                ref={editorInputRef}
                className="latex-editor-input"
                placeholder={'输入 LaTeX 或普通文本（例如：\\\\frac{a}{b}）'}
                value={editor.latex}
                rows={3}
                onChange={(ev) => setEditor((prev) => (prev ? { ...prev, latex: ev.target.value } : prev))}
                onKeyDown={(ev) => {
                  if (ev.key === 'Escape') {
                    ev.preventDefault()
                    setEditor(null)
                    return
                  }
                  if (ev.key === 'Enter' && (ev.ctrlKey || ev.metaKey)) {
                    ev.preventDefault()
                    commitFormula(editor.latex, editor.world)
                    setEditor(null)
                  }
                }}
              />
            </div>

            <div className="latex-editor-actions">
              <button
                type="button"
                onClick={() => {
                  commitFormula(editor.latex, editor.world)
                  setEditor(null)
                }}
              >
                确定
              </button>
              <button type="button" onClick={() => setEditor(null)}>
                取消
              </button>
              <span className="latex-editor-hint">Ctrl/⌘ + Enter 确定，Esc 取消</span>
            </div>

            <div className="latex-editor-preview">
              {(() => {
                if (!editor.latex.trim()) return <span className="latex-editor-preview-empty">预览</span>
                try {
                  const html = katex.renderToString(editor.latex, {
                    throwOnError: false,
                    displayMode: true,
                    output: 'html',
                  })
                  return <div dangerouslySetInnerHTML={{ __html: html }} />
                } catch {
                  // 若不是合法 LaTeX，则按纯文本显示
                  return <div style={{ whiteSpace: 'pre-wrap' }}>{editor.latex}</div>
                }
              })()}
            </div>
          </div>
        )}
      </div>
      <div className="small-muted">
        当前模式：文本/公式 ｜ 缩放：{cameraRef.current.zoom.toFixed(2)}x ｜ 平移：中键拖拽 / 空格+拖拽
      </div>
    </div>
  )
}

