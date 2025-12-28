import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

export type Tool = 'select' | 'brush' | 'eraser' | 'fill' | 'text' | 'zoom'

export type HistoryEntry = {
  id: string
  label: string
  at: number
}

export type CanvasHistorySource = 'user' | 'system'

export type CanvasBoardProps = {
  tool: Tool
  color: string
  brushSize: number
  onHistoryPush: (entry: HistoryEntry, source?: CanvasHistorySource) => void
  requestUndoToken: number
  requestClearToken: number
  requestFillToken: number
  /** true when there is something to undo (snapshots length > 1) */
  onCanUndoChange?: (canUndo: boolean) => void
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
  const {
    tool,
    color,
    brushSize,
    onHistoryPush,
    requestUndoToken,
    requestClearToken,
    requestFillToken,
    onCanUndoChange,
  } = props

  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const wrapRef = useRef<HTMLDivElement | null>(null)

  // Infinite-canvas model: store vector strokes in world coordinates.
  const strokesRef = useRef<Stroke[]>([])
  const redoRef = useRef<Stroke[]>([])
  const backgroundRef = useRef<string>('#ffffff')

  const cameraRef = useRef<Camera>({ x: 0, y: 0, zoom: 1 })

  const rafRef = useRef<number | null>(null)
  const scheduleRender = useCallback(() => {
    if (rafRef.current != null) return
    rafRef.current = window.requestAnimationFrame(() => {
      rafRef.current = null
      render()
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const reportCanUndo = useCallback(() => {
    onCanUndoChange?.(strokesRef.current.length > 0)
  }, [onCanUndoChange])

  const [isDrawing, setIsDrawing] = useState(false)
  const activeStrokeRef = useRef<Stroke | null>(null)

  const [isPanning, setIsPanning] = useState(false)
  const panStartRef = useRef<{
    pointerId: number
    startScreen: { x: number; y: number }
    startCam: Camera
  } | null>(null)

  const effectiveSize = useMemo(() => clamp(brushSize, 1, 200), [brushSize])

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

    // Draw grid in world space (optional but helps with orientation on infinite canvas)
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

    // Draw strokes in world space using camera transform.
    ctx.save()
    ctx.setTransform(cam.zoom, 0, 0, cam.zoom, -cam.x * cam.zoom, -cam.y * cam.zoom)

    const drawStroke = (s: Stroke) => {
      const pts = s.points
      if (pts.length === 0) return

      ctx.save()
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      ctx.lineWidth = s.size

      if (s.tool === 'eraser') {
        // "Erase" by drawing with background color. (Later we can switch to real compositing + tiled backing store)
        ctx.globalCompositeOperation = 'source-over'
        ctx.strokeStyle = backgroundRef.current
      } else {
        ctx.globalCompositeOperation = 'source-over'
        ctx.strokeStyle = s.color
      }

      ctx.beginPath()
      ctx.moveTo(pts[0].x, pts[0].y)
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y)
      // If it's a single point, draw a dot
      if (pts.length === 1) {
        ctx.lineTo(pts[0].x + 0.001, pts[0].y + 0.001)
      }
      ctx.stroke()
      ctx.restore()
    }

    for (const s of strokesRef.current) drawStroke(s)
    if (activeStrokeRef.current) drawStroke(activeStrokeRef.current)

    ctx.restore()
  }, [])

  // init + resize observer
  useEffect(() => {
    const canvas = canvasRef.current
    const wrap = wrapRef.current
    if (!canvas || !wrap) return

    const init = () => {
      resizeCanvasToDisplaySize(canvas)
      backgroundRef.current = '#ffffff'
      strokesRef.current = []
      redoRef.current = []
      cameraRef.current = { x: 0, y: 0, zoom: 1 }
      reportCanUndo()
      render()
      onHistoryPush({ id: crypto.randomUUID(), label: '初始化画布', at: Date.now() }, 'system')
    }

    init()

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
  }, [onHistoryPush, render, reportCanUndo])

  const startStroke = (world: { x: number; y: number }) => {
    const next: Stroke = {
      id: crypto.randomUUID(),
      tool: tool === 'eraser' ? 'eraser' : 'brush',
      color,
      size: effectiveSize,
      points: [world],
    }
    activeStrokeRef.current = next
    redoRef.current = []
  }

  const appendStrokePoint = (world: { x: number; y: number }) => {
    const s = activeStrokeRef.current
    if (!s) return
    s.points.push(world)
  }

  const commitStroke = (label: string) => {
    const s = activeStrokeRef.current
    if (!s) return
    activeStrokeRef.current = null

    // avoid committing empty strokes
    if (s.points.length > 0) {
      strokesRef.current = [...strokesRef.current, s]
      reportCanUndo()
      onHistoryPush({ id: crypto.randomUUID(), label, at: Date.now() }, 'user')
    }
  }

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return

    // Avoid browser default behaviors (auto-scroll on middle click, text selection, etc.)
    e.preventDefault()

    const isMiddle = e.button === 1
    // Some browsers/devices report middle press better via buttons bitmask during the gesture.
    const isMiddleByButtons = (e.buttons & 4) === 4

    // Middle mouse button to pan
    if (isMiddle || isMiddleByButtons) {
      canvas.setPointerCapture(e.pointerId)
      setIsPanning(true)
      setIsDrawing(false)
      activeStrokeRef.current = null
      const screen = getCanvasScreenPoint(canvas, e.clientX, e.clientY)
      panStartRef.current = { pointerId: e.pointerId, startScreen: screen, startCam: { ...cameraRef.current } }
      return
    }

    // Shift + left drag to pan (temporary shortcut)
    if (e.button === 0 && (e.shiftKey || ((e.nativeEvent as PointerEvent | undefined)?.shiftKey ?? false))) {
      canvas.setPointerCapture(e.pointerId)
      setIsPanning(true)
      setIsDrawing(false)
      activeStrokeRef.current = null
      const screen = getCanvasScreenPoint(canvas, e.clientX, e.clientY)
      panStartRef.current = { pointerId: e.pointerId, startScreen: screen, startCam: { ...cameraRef.current } }
      return
    }

    // Draw with left button by default.
    if (e.button !== 0) return
    if (tool !== 'brush' && tool !== 'eraser') return

    canvas.setPointerCapture(e.pointerId)
    setIsDrawing(true)

    const screen = getCanvasScreenPoint(canvas, e.clientX, e.clientY)
    const world = screenToWorld(screen, cameraRef.current)
    startStroke(world)
    scheduleRender()
  }

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return

    // If the middle button is no longer pressed, end panning (safety for cases where up is missed).
    if (isPanning && (e.buttons & 4) === 0) {
      setIsPanning(false)
      panStartRef.current = null
    }

    if (isPanning) {
      e.preventDefault()
      const s = panStartRef.current
      if (!s) return
      const screen = getCanvasScreenPoint(canvas, e.clientX, e.clientY)
      const dxScreen = screen.x - s.startScreen.x
      const dyScreen = screen.y - s.startScreen.y
      const cam = s.startCam
      // Screen drag right means camera moves left in world.
      cameraRef.current = {
        x: cam.x - dxScreen / cam.zoom,
        y: cam.y - dyScreen / cam.zoom,
        zoom: cam.zoom,
      }
      scheduleRender()
      return
    }

    if (!isDrawing) return

    const screen = getCanvasScreenPoint(canvas, e.clientX, e.clientY)
    const world = screenToWorld(screen, cameraRef.current)
    appendStrokePoint(world)
    scheduleRender()
  }

  const handlePointerUpOrCancel = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return

    e.preventDefault()

    try {
      canvas.releasePointerCapture(e.pointerId)
    } catch {
      // ignore
    }

    if (isPanning) {
      setIsPanning(false)
      panStartRef.current = null
      return
    }

    if (!isDrawing) return

    setIsDrawing(false)
    commitStroke(tool === 'eraser' ? '橡皮擦' : '画笔')
    scheduleRender()
  }

  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return

    // This must be non-passive to prevent page scroll/zoom.
    e.preventDefault()

    const cam = cameraRef.current

    // macOS trackpad:
    // - Two-finger scroll => wheel without ctrlKey => pan canvas
    // - Pinch => wheel with ctrlKey => zoom

    const dx = e.deltaX
    const dy = e.deltaY

    // Pan branch (two-finger scroll)
    if (!e.ctrlKey) {
      cameraRef.current = {
        ...cam,
        x: cam.x + dx / cam.zoom,
        y: cam.y + dy / cam.zoom,
      }
      scheduleRender()
      return
    }

    // Zoom branch (pinch)
    const screen = getCanvasScreenPoint(canvas, e.clientX, e.clientY)
    const worldBefore = screenToWorld(screen, cam)

    const zoomIntensity = 0.0028
    const factor = Math.exp(-dy * zoomIntensity)
    const nextZoom = clamp(cam.zoom * factor, 0.1, 8)

    cameraRef.current = {
      zoom: nextZoom,
      x: worldBefore.x - screen.x / nextZoom,
      y: worldBefore.y - screen.y / nextZoom,
    }

    scheduleRender()
  }

  // undo request (remove last stroke)
  useEffect(() => {
    if (requestUndoToken === 0) return

    if (strokesRef.current.length === 0) {
      reportCanUndo()
      return
    }

    const last = strokesRef.current.at(-1)
    if (last) redoRef.current = [...redoRef.current, last]
    strokesRef.current = strokesRef.current.slice(0, -1)

    reportCanUndo()
    render()
    onHistoryPush({ id: crypto.randomUUID(), label: '撤销', at: Date.now() }, 'user')
  }, [requestUndoToken, onHistoryPush, render, reportCanUndo])

  // clear request
  useEffect(() => {
    if (requestClearToken === 0) return

    redoRef.current = [...redoRef.current, ...strokesRef.current]
    strokesRef.current = []

    reportCanUndo()
    render()
    onHistoryPush({ id: crypto.randomUUID(), label: '清空画布', at: Date.now() }, 'user')
  }, [requestClearToken, onHistoryPush, render, reportCanUndo])

  // fill request (background color fill)
  useEffect(() => {
    if (requestFillToken === 0) return

    backgroundRef.current = color
    strokesRef.current = []
    redoRef.current = []

    reportCanUndo()
    render()
    onHistoryPush({ id: crypto.randomUUID(), label: '填充', at: Date.now() }, 'user')
  }, [requestFillToken, color, onHistoryPush, render, reportCanUndo])

  // Safari/iOS: prevent page pinch-zoom and related gesture navigation while over the canvas.
  // Note: this is outside Pointer Events, Safari still fires these legacy events.
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const prevent = (ev: Event) => {
      ev.preventDefault()
    }

    // These exist in Safari. We add them anyway; in other browsers they won't fire.
    canvas.addEventListener('gesturestart', prevent, { passive: false } as AddEventListenerOptions)
    canvas.addEventListener('gesturechange', prevent, { passive: false } as AddEventListenerOptions)
    canvas.addEventListener('gestureend', prevent, { passive: false } as AddEventListenerOptions)

    // Also ensure wheel is non-passive at the DOM level (some setups can treat wheel as passive).
    // We don't change behavior; React's handler will still run.
    const wheelPrevent = (ev: WheelEvent) => {
      // If the wheel originates on the canvas, we always want to own it.
      ev.preventDefault()
    }
    canvas.addEventListener('wheel', wheelPrevent, { passive: false })

    return () => {
      canvas.removeEventListener('gesturestart', prevent as EventListener)
      canvas.removeEventListener('gesturechange', prevent as EventListener)
      canvas.removeEventListener('gestureend', prevent as EventListener)
      canvas.removeEventListener('wheel', wheelPrevent)
    }
  }, [])

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
      </div>
      <div className="small-muted">
        当前工具：{tool} ｜ 颜色：{tool === 'eraser' ? '（橡皮擦）' : color} ｜ 笔刷：{effectiveSize}px ｜
        缩放：{cameraRef.current.zoom.toFixed(2)}x
      </div>
    </div>
  )
}

