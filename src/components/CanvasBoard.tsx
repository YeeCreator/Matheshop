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

function getCanvasPoint(canvas: HTMLCanvasElement, clientX: number, clientY: number) {
  const rect = canvas.getBoundingClientRect()
  const x = ((clientX - rect.left) / rect.width) * canvas.width
  const y = ((clientY - rect.top) / rect.height) * canvas.height
  return { x, y }
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

function scaleImageDataToCanvas(img: ImageData, width: number, height: number) {
  // Convert ImageData -> tmp canvas -> draw into target size -> return ImageData
  const tmp = document.createElement('canvas')
  tmp.width = img.width
  tmp.height = img.height
  const tmpCtx = tmp.getContext('2d')
  if (!tmpCtx) return null
  tmpCtx.putImageData(img, 0, 0)

  const out = document.createElement('canvas')
  out.width = width
  out.height = height
  const outCtx = out.getContext('2d')
  if (!outCtx) return null

  outCtx.save()
  outCtx.fillStyle = '#ffffff'
  outCtx.fillRect(0, 0, width, height)
  outCtx.drawImage(tmp, 0, 0, width, height)
  outCtx.restore()

  try {
    return outCtx.getImageData(0, 0, width, height)
  } catch {
    return null
  }
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

  // snapshot stack for undo
  const snapshotsRef = useRef<ImageData[]>([])
  const reportCanUndo = useCallback(() => onCanUndoChange?.(snapshotsRef.current.length > 1), [onCanUndoChange])

  const [isDrawing, setIsDrawing] = useState(false)
  const lastPointRef = useRef<{ x: number; y: number } | null>(null)

  const effectiveStroke = useMemo(() => {
    if (tool === 'eraser') return '#ffffff'
    return color
  }, [tool, color])

  const effectiveSize = useMemo(() => clamp(brushSize, 1, 200), [brushSize])

  // init + resize observer
  useEffect(() => {
    const canvas = canvasRef.current
    const wrap = wrapRef.current
    if (!canvas || !wrap) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const init = () => {
      resizeCanvasToDisplaySize(canvas)
      // default background white
      ctx.save()
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      ctx.restore()
      snapshotsRef.current = [ctx.getImageData(0, 0, canvas.width, canvas.height)]
      reportCanUndo()
      onHistoryPush({ id: crypto.randomUUID(), label: '初始化画布', at: Date.now() }, 'system')
    }

    init()

    const ro = new ResizeObserver(() => {
      const didResize = resizeCanvasToDisplaySize(canvas)
      if (!didResize) return

      // scale all snapshots to new size so undo history keeps working after resize
      const scaled = snapshotsRef.current
        .map((img) => scaleImageDataToCanvas(img, canvas.width, canvas.height))
        .filter((x): x is ImageData => Boolean(x))

      if (scaled.length === 0) {
        ctx.save()
        ctx.fillStyle = '#ffffff'
        ctx.fillRect(0, 0, canvas.width, canvas.height)
        ctx.restore()
        snapshotsRef.current = [ctx.getImageData(0, 0, canvas.width, canvas.height)]
      } else {
        snapshotsRef.current = scaled
        const top = snapshotsRef.current.at(-1)
        if (top) ctx.putImageData(top, 0, 0)
      }

      reportCanUndo()
      onHistoryPush({ id: crypto.randomUUID(), label: '画布缩放', at: Date.now() }, 'system')
    })

    ro.observe(wrap)
    return () => ro.disconnect()
  }, [onHistoryPush, reportCanUndo])

  const pushSnapshot = (label: string) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    try {
      const img = ctx.getImageData(0, 0, canvas.width, canvas.height)
      snapshotsRef.current.push(img)
      reportCanUndo()
      onHistoryPush({ id: crypto.randomUUID(), label, at: Date.now() }, 'user')
    } catch {
      // ignore
    }
  }

  const drawLine = (from: { x: number; y: number }, to: { x: number; y: number }) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    ctx.save()
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.strokeStyle = effectiveStroke
    ctx.lineWidth = effectiveSize

    if (tool === 'eraser') {
      ctx.globalCompositeOperation = 'source-over'
      ctx.strokeStyle = '#ffffff'
    }

    ctx.beginPath()
    ctx.moveTo(from.x, from.y)
    ctx.lineTo(to.x, to.y)
    ctx.stroke()
    ctx.restore()
  }

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return

    // only brush/eraser for now
    if (tool !== 'brush' && tool !== 'eraser') return

    canvas.setPointerCapture(e.pointerId)
    setIsDrawing(true)
    const p = getCanvasPoint(canvas, e.clientX, e.clientY)
    lastPointRef.current = p
    drawLine(p, p)
  }

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return
    if (!isDrawing) return

    const last = lastPointRef.current
    if (!last) return

    const next = getCanvasPoint(canvas, e.clientX, e.clientY)
    drawLine(last, next)
    lastPointRef.current = next
  }

  const handlePointerUpOrCancel = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return
    if (!isDrawing) return

    try {
      canvas.releasePointerCapture(e.pointerId)
    } catch {
      // ignore
    }

    setIsDrawing(false)
    lastPointRef.current = null
    pushSnapshot(tool === 'eraser' ? '橡皮擦' : '画笔')
  }

  // undo request
  useEffect(() => {
    if (requestUndoToken === 0) return

    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    if (snapshotsRef.current.length <= 1) {
      reportCanUndo()
      return
    }

    snapshotsRef.current.pop()
    const prev = snapshotsRef.current.at(-1)
    if (!prev) {
      reportCanUndo()
      return
    }

    // If size differs (should be rare after resize scaling, but keep safe)
    if (prev.width !== canvas.width || prev.height !== canvas.height) {
      const scaled = scaleImageDataToCanvas(prev, canvas.width, canvas.height)
      if (scaled) {
        ctx.putImageData(scaled, 0, 0)
        // keep stack length, but replace the top with scaled version
        snapshotsRef.current[snapshotsRef.current.length - 1] = scaled
      }
    } else {
      ctx.putImageData(prev, 0, 0)
    }

    reportCanUndo()
    onHistoryPush({ id: crypto.randomUUID(), label: '撤销', at: Date.now() }, 'user')
  }, [requestUndoToken, onHistoryPush, reportCanUndo])

  // clear request
  useEffect(() => {
    if (requestClearToken === 0) return

    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // push current state first so clear can be undone
    try {
      const before = ctx.getImageData(0, 0, canvas.width, canvas.height)
      snapshotsRef.current.push(before)
    } catch {
      // ignore
    }

    ctx.save()
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.restore()

    try {
      const after = ctx.getImageData(0, 0, canvas.width, canvas.height)
      snapshotsRef.current.push(after)
    } catch {
      // ignore
    }

    reportCanUndo()
    onHistoryPush({ id: crypto.randomUUID(), label: '清空画布', at: Date.now() }, 'user')
  }, [requestClearToken, onHistoryPush, reportCanUndo])

  // fill request (simple full fill as placeholder)
  useEffect(() => {
    if (requestFillToken === 0) return

    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // push current state first so fill can be undone
    try {
      const before = ctx.getImageData(0, 0, canvas.width, canvas.height)
      snapshotsRef.current.push(before)
    } catch {
      // ignore
    }

    ctx.save()
    ctx.fillStyle = color
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.restore()

    try {
      const after = ctx.getImageData(0, 0, canvas.width, canvas.height)
      snapshotsRef.current.push(after)
    } catch {
      // ignore
    }

    reportCanUndo()
    onHistoryPush({ id: crypto.randomUUID(), label: '填充', at: Date.now() }, 'user')
  }, [requestFillToken, color, onHistoryPush, reportCanUndo])

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
        />
      </div>
      <div className="small-muted">
        当前工具：{tool} ｜ 颜色：{tool === 'eraser' ? '（橡皮擦）' : color} ｜ 笔刷：{effectiveSize}px
      </div>
    </div>
  )
}

