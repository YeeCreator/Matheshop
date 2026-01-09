import { useCallback, useEffect, useRef, useState } from 'react'
import katex from 'katex'
import type { CanvasEdge, CellId, CellNode, PortSide } from './cellTypes'
import EdgeLayer from './canvas/EdgeLayer'
import FormulaLayer from './canvas/FormulaLayer'
import ExprTokenView from './canvas/ExprTokenView'
import InlineExprEditor from './canvas/InlineExprEditor'
import { parseArithExpr } from '../../engine/engine_ts/src/index'
import { evalExpression } from '../engine/engineClient'
import type { EngineSelectionState } from '../engine/engineSelection'
import { ensureEdgeUnique, getPortWorld as getPortWorldDomain, pickNearestPort as pickNearestPortDomain } from './canvas/domain/edges'
import {
  collectCellWorldHits,
  findCellById,
  removeCellById,
  updateCellById,
} from './canvas/domain/cellTree'
import {
  clamp,
  type Camera,
  getCanvasScreenPoint,
  resizeCanvasToDisplaySize,
  screenToWorld,
  worldToScreen,
} from './canvas/utils/geometry'
import { parseBlocksFromText, renderBlocksToHtml } from './canvas/utils/blocks'
import { normalizeRange, type InlineSelection } from './canvas/exprSelection'

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

export default function CanvasBoard(props: CanvasBoardProps) {
  const { color, onHistoryPush, requestClearToken } = props

  // Engine selection（由 App 通过 window 事件同步；避免额外全局状态库）
  const engineSelectionRef = useRef<EngineSelectionState>({ choice: 'builtin_native' })
  useEffect(() => {
    const onEngineSelection = (ev: Event) => {
      const ce = ev as CustomEvent
      const next = ce.detail as EngineSelectionState | undefined
      if (!next) return
      engineSelectionRef.current = next
    }
    window.addEventListener('matheshop:engineSelection', onEngineSelection as EventListener)
    return () => window.removeEventListener('matheshop:engineSelection', onEngineSelection as EventListener)
  }, [])

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

  // --- Cell（单元框）骨架 ---
  const [cells, setCells] = useState<CellNode[]>([])
  const [selectedCellId, setSelectedCellId] = useState<string | null>(null)
  const [editingCellId, setEditingCellId] = useState<string | null>(null)
  const [dropHintCellId, setDropHintCellId] = useState<string | null>(null)

  const nextCellSeqRef = useRef<number>(1)

  const DRAG_START_DELAY_MS = 150
  const DRAG_START_THRESHOLD_PX = 4

  const dragStartTimerRef = useRef<number | null>(null)

  const draggingCellRef = useRef<
    | null
    | {
        id: string
        pointerId: number
        startWorld: { x: number; y: number }
        startScreen: { x: number; y: number }
        startPos: { x: number; y: number }
        /** 拖拽对象的 parentWorld（用于把 world 位移换算到 local 位移） */
        parentWorld: { x: number; y: number }
        /** 是否已满足“按住 >= 150ms” */
        heldReady: boolean
        /** 是否已满足“移动超过阈值” */
        movedReady: boolean
        /** 是否已正式进入拖拽（两条件都满足后才为 true） */
        isDragging: boolean
        /** 拖拽过程中是否发生了真实移动（用于决定是否写入“移动单元框”历史） */
        didMove: boolean
      }
  >(null)

  const rafRef = useRef<number | null>(null)
  const scheduleRender = useCallback(() => {
    if (rafRef.current != null) return
    rafRef.current = window.requestAnimationFrame(() => {
      rafRef.current = null
      render()
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 根据文本粗略估算节点大小（MVP：按字符宽度权重 + 行数估算）
  const estimateCellSizeFromText = useCallback((textRaw: string) => {
    const text = (textRaw ?? '').replace(/\r\n/g, '\n')
    const lines = text.split('\n')

    // 经验值：与 .cell-editor 的 12px 等宽字体接近
    const asciiW = 7
    const wideW = 12
    const lineH = 16

    const measureLine = (line: string) => {
      let w = 0
      for (const ch of line) {
        // 简单区分：ASCII 走窄字符，其它（中文/全角/emoji 等）按宽字符
        w += ch.charCodeAt(0) <= 0x007f ? asciiW : wideW
      }
      return w
    }

    const maxLinePx = Math.max(0, ...lines.map((l) => measureLine(l)))
    const lineCount = Math.max(1, lines.length)

    // ==== 非内容区固定开销（与 App.css 对齐）====
    // cell-header 固定高度 28px
    const headerH = 28

    // cell-body padding: 8px 10px
    const bodyPadX = 10 * 2
    const bodyPadY = 8 * 2

    // cell-editor 内部 padding: 8px
    const editorPadX = 8 * 2
    const editorPadY = 8 * 2

    // cell-editor border: 1px
    const editorBorder = 1 * 2

    // cell 外框 border（肉眼估算，避免极小尺寸时内容被压到 0）
    const outerBorder = 1 * 2

    // ==== 内容区最小可输入尺寸（至少一行一列）====
    const minContentW = asciiW
    const minContentH = lineH

    const contentW = Math.max(minContentW, maxLinePx)
    const contentH = Math.max(minContentH, lineCount * lineH)

    // 目标：返回的是 cell 外框 size，所以需要把 header + body padding + editor padding/border 都算进去
    const w = clamp(contentW + bodyPadX + editorPadX + editorBorder + outerBorder, 60, 900)
    const h = clamp(headerH + bodyPadY + contentH + editorPadY + editorBorder + outerBorder, 48, 700)

    return { w, h }
  }, [])

  const commitCellEditing = useCallback(
    (cellId: string, opts?: { runEval?: boolean }) => {
      // 读取最新内容（避免闭包旧值）
      let latestText = ''
      setCells((prev) =>
        updateCellById(prev, cellId, (next) => {
          latestText = next.content
          return next
        }),
      )

      const trimmed = (latestText ?? '').trim()

      // 空内容：视为“新建无效/删除节点”
      if (trimmed.length === 0) {
        setEditingCellId(null)
        setSelectedCellId((cur) => (cur === cellId ? null : cur))
        setCells((prev) => removeCellById(prev, cellId).next)
        scheduleRender()
        return
      }

      // 退出编辑态
      setEditingCellId(null)

      // 根据最终内容估算一次尺寸（让初始大小更贴近输入）
      const nextSize = estimateCellSizeFromText(latestText)

      // 立刻解析 blocks，用于退出编辑后马上渲染
      setCells((prev) =>
        updateCellById(prev, cellId, (next) => ({
          ...next,
          size: nextSize,
          blocks: parseBlocksFromText(next.content),
        })),
      )

      scheduleRender()
      onHistoryPush({ id: crypto.randomUUID(), label: '编辑单元框', at: Date.now() }, 'user')

      if (!opts?.runEval) return

      // 保留原 Ctrl/⌘+Enter 行为：提交后求值并追加一行输出
      ;(async () => {
        const selection = engineSelectionRef.current

        const resp = await evalExpression({
          text: latestText,
          engine: { choice: selection.choice },
        })

        setCells((prev) =>
          updateCellById(prev, cellId, (next) => {
            const base = next.blocks && next.blocks.length > 0 ? next.blocks : parseBlocksFromText(next.content)
            const line = resp.ok ? `= ${resp.result.value}` : `⚠ ${resp.error.message}`
            return {
              ...next,
              blocks: [...base, { id: crypto.randomUUID(), type: 'text', text: line }],
            }
          }),
        )

        scheduleRender()
      })()
    },
    [estimateCellSizeFromText, onHistoryPush, scheduleRender],
  )

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
      setCells([])
      setSelectedCellId(null)
      setEditingCellId(null)
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

  useEffect(() => {
    if (!editor) return
    const t = window.setTimeout(() => editorInputRef.current?.focus(), 0)
    return () => window.clearTimeout(t)
  }, [editor])

  // 清空请求：清空公式/单元框
  useEffect(() => {
    if (requestClearToken === 0) return
    if (requestClearToken === lastClearTokenRef.current) return
    lastClearTokenRef.current = requestClearToken

    strokesRef.current = []
    redoRef.current = []
    setFormulas([])
    setCells([])
    setEditor(null)
    setSelectedCellId(null)
    setEditingCellId(null)
    setEdges([])

    // 重置递增编号
    nextCellSeqRef.current = 1

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

  // Esc：取消选中/编辑/拖拽
  useEffect(() => {
    const onKeyDown = (ev: KeyboardEvent) => {
      if (ev.key !== 'Escape') return
      draggingFormulaRef.current = null
      draggingCellRef.current = null
      draggingEdgeRef.current = null
      resizingCellRef.current = null
      setHoverPort(null)
      setIsPanning(false)
      panStartRef.current = null
      setSelectedFormulaId(null)
      setSelectedCellId(null)
      setSelectedEdgeId(null)
      setEditingCellId(null)
      setLinkFromId(null)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  // --- Obsidian Canvas / draw.io 风格：连线 ---
  const [edges, setEdges] = useState<CanvasEdge[]>([])
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null)

  /** 右下角缩放手柄拖拽状态 */
  const resizingCellRef = useRef<
    | null
    | {
        id: string
        pointerId: number
        startWorld: { x: number; y: number }
        startSize: { w: number; h: number }
        aspect: number
      }
  >(null)

  // 多选相关 state
  const [selectionBox, setSelectionBox] = useState<null | { start: { x: number; y: number }; end: { x: number; y: number } }>(null)
  const [multiSelectedIds, setMultiSelectedIds] = useState<string[]>([])
  const selectionStartRef = useRef<null | { x: number; y: number }> (null)
  const isBoxSelectingRef = useRef(false)

  // 将“screen(canvas 内像素)”矩形转换为 world 矩形
  function screenBoxToWorldBox(a: { x: number; y: number }, b: { x: number; y: number }) {
    const cam = cameraRef.current
    const w0 = screenToWorld(a, cam)
    const w1 = screenToWorld(b, cam)
    return getBoxRect(w0, w1)
  }

  // 单元内“隐式表达式节点”选中态（MVP：按 token 粒度）
  const [selectedExprToken, setSelectedExprToken] = useState<null | { cellId: string; tokenId: string }>(null)

  // M2：局部编辑（tokenRange 级别，MVP）
  const [activeInlineEditor, setActiveInlineEditor] = useState<null | {
    cellId: string
    selection: InlineSelection
    draft: string
    anchorCss: { left: number; top: number }
  }>(null)

  // 框选辅助函数
  function getBoxRect(a: { x: number; y: number }, b: { x: number; y: number }) {
    return {
      x: Math.min(a.x, b.x),
      y: Math.min(a.y, b.y),
      w: Math.abs(a.x - b.x),
      h: Math.abs(a.y - b.y),
    }
  }

  // 判断节点是否与选区相交
  function cellIntersectsBox(cell: CellNode, box: { x: number; y: number; w: number; h: number }, parentWorld: { x: number; y: number }) {
    const world = { x: parentWorld.x + cell.localPos.x, y: parentWorld.y + cell.localPos.y }
    return !(
      world.x + cell.size.w < box.x ||
      world.x > box.x + box.w ||
      world.y + cell.size.h < box.y ||
      world.y > box.y + box.h
    )
  }

  const deleteSelected = useCallback(() => {
    // 优先删除连接
    if (selectedEdgeId) {
      setEdges((prev) => prev.filter((e) => e.id !== selectedEdgeId))
      setSelectedEdgeId(null)
      onHistoryPush({ id: crypto.randomUUID(), label: '删除连接', at: Date.now() }, 'user')
      scheduleRender()
      return
    }

    // 再删除节点
    if (!selectedCellId) return
    const targetId = selectedCellId

    setCells((prev) => removeCellById(prev, targetId).next)
    setEdges((prev) => prev.filter((e) => e.from !== targetId && e.to !== targetId))

    setSelectedCellId(null)
    setEditingCellId(null)
    setDropHintCellId(null)
    setHoverPort(null)

    onHistoryPush({ id: crypto.randomUUID(), label: '删除单元节点', at: Date.now() }, 'user')
    scheduleRender()
  }, [onHistoryPush, scheduleRender, selectedCellId, selectedEdgeId])

  // Delete/Backspace：删除选中边/节点（输入框内不拦截）
  useEffect(() => {
    const onKeyDown = (ev: KeyboardEvent) => {
      const t = ev.target as HTMLElement | null
      const tag = t?.tagName?.toLowerCase()
      const isEditable = t instanceof HTMLElement ? t.isContentEditable : false
      if (tag === 'textarea' || tag === 'input' || isEditable) return

      if (ev.key === 'Delete' || ev.key === 'Backspace') {
        ev.preventDefault()
        deleteSelected()
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [deleteSelected])

  const [isLinkMode, setIsLinkMode] = useState(false)
  const [linkFromId, setLinkFromId] = useState<CellId | null>(null)

  const draggingEdgeRef = useRef<
    | null
    | {
        pointerId: number
        fromId: CellId
        fromPort: PortSide
        toId: CellId | null
        toPort: PortSide | null
        pointerWorld: { x: number; y: number }
      }
  >(null)

  const [hoverPort, setHoverPort] = useState<null | { cellId: CellId; port: PortSide }>(null)

  const ensureEdge = useCallback((from: CellId, to: CellId, fromPort?: PortSide, toPort?: PortSide) => {
    if (from === to) return
    setEdges((prev) => {
      const next = ensureEdgeUnique(prev, { from, to, fromPort, toPort })
      return next.map((e) => ('id' in e ? (e as CanvasEdge) : ({ ...e, id: crypto.randomUUID() } satisfies CanvasEdge)))
    })
  }, [])

  const getPortWorld = useCallback(
    (cellId: CellId, port: PortSide, hits: ReturnType<typeof collectCellWorldHits>): { x: number; y: number } | null => {
      return getPortWorldDomain({ cells, hits, cellId, port })
    },
    [cells],
  )

  const pickNearestPort = useCallback(
    (pointerWorld: { x: number; y: number }): { cellId: CellId; port: PortSide } | null => {
      return pickNearestPortDomain({ cells, pointerWorld })
    },
    [cells],
  )

  // L：切换连线模式；Esc：退出连线模式并清空起点
  useEffect(() => {
    const onKeyDown = (ev: KeyboardEvent) => {
      // 输入场景：不要触发全局快捷键
      const t = ev.target as HTMLElement | null
      const tag = t?.tagName?.toLowerCase()
      const isEditable = t instanceof HTMLElement ? t.isContentEditable : false
      const isTyping = tag === 'textarea' || tag === 'input' || isEditable

      // 编辑状态：不允许用 L 切换连线模式（否则输入字母会被抢走）
      const isInCanvasEditing = editingCellId != null || editor != null

      if (ev.key === 'l' || ev.key === 'L') {
        if (isTyping || isInCanvasEditing) return

        ev.preventDefault()
        setIsLinkMode((v) => {
          const next = !v
          if (!next) setLinkFromId(null)
          return next
        })
      }

      if (ev.key === 'Escape') {
        // Esc 在输入框内也经常用来退出输入；但这里仍允许退出连线模式
        setLinkFromId(null)
        setIsLinkMode(false)
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [editingCellId, editor])

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return

    // 编辑中：点击画布空白处视为“完成编辑”
    if (editingCellId && e.button === 0) {
      commitCellEditing(editingCellId)
    }

    // 如果正在拖拽公式/单元框，不要让画布再吃到新的 pointerdown
    if (draggingFormulaRef.current || draggingCellRef.current) {
      e.preventDefault()
      return
    }

    e.preventDefault()

    // 连线模式：点击画布空白处取消起点（不创建新节点）
    if (isLinkMode && e.button === 0) {
      setSelectedFormulaId(null)
      setSelectedCellId(null)
      setLinkFromId(null)
      return
    }

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

    // 点击空白处：取消选中
    if (e.button === 0) {
      setSelectedFormulaId(null)
      setSelectedCellId(null)
      setSelectedEdgeId(null)
      setSelectedExprToken(null)
    }

    // 重要：单击空白处不再创建节点（改为双击创建）

    // 框选：空白处左键按下且无 modifier
    if (e.button === 0 && !isSpaceDown && !isLinkMode && !draggingFormulaRef.current && !draggingCellRef.current) {
      const screen = getCanvasScreenPoint(canvas, e.clientX, e.clientY)
      // 注意：selectionBox 使用 screen(canvas 内像素) 坐标，渲染/命中都由它统一转换
      selectionStartRef.current = screen
      setSelectionBox({ start: screen, end: screen })
      isBoxSelectingRef.current = true
      return
    }
  }

  const handleDoubleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return

    // 双击创建节点：避免在连线/平移/拖拽/框选等状态下误触
    if (isLinkMode) return
    if (isSpaceDown || isPanning) return
    if (draggingFormulaRef.current || draggingCellRef.current) return
    if (isBoxSelectingRef.current) return

    // 只响应左键双击
    if ((e as unknown as MouseEvent).button !== 0) return

    const screen = getCanvasScreenPoint(canvas, e.clientX, e.clientY)
    const world = screenToWorld(screen, cameraRef.current)

    const id = crypto.randomUUID()
    const seq = nextCellSeqRef.current++

    const content = ''

    // 新建节点：占位尺寸尽量小（接近 1 个字符），后续会随着输入实时调整
    const size = estimateCellSizeFromText(content)

    setCells((prev) => {
      // 让节点中心对齐到点击点
      const x = world.x - size.w / 2
      const y = world.y - size.h / 2

      const next: CellNode = {
        id,
        parentId: null,
        localPos: { x, y },
        worldPos: { x, y },
        size,
        kind: 'cell',
        blocks: [],
        content,
        children: [],
        seq,
      }

      return [...prev, next]
    })

    setSelectedCellId(id)
    setEditingCellId(id)

    // 注意：这里不写历史；如果用户最终没输入内容会自动删除，不应留痕
    scheduleRender()
  }

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return

    // 节点缩放（右下角手柄）：以中心为基准的四向缩放
    if (resizingCellRef.current && resizingCellRef.current.pointerId === e.pointerId) {
      e.preventDefault()

      const screen = getCanvasScreenPoint(canvas, e.clientX, e.clientY)
      const world = screenToWorld(screen, cameraRef.current)

      const r = resizingCellRef.current
      const dx = world.x - r.startWorld.x
      const dy = world.y - r.startWorld.y

      // 右下角拖拽：宽高随 dx/dy 增长；中心缩放 => 总增量乘 2
      let nextW = Math.max(40, r.startSize.w + dx * 2)
      let nextH = Math.max(28, r.startSize.h + dy * 2)

      // Shift 锁定比例
      if (e.shiftKey) {
        const aspect = r.aspect > 0 ? r.aspect : 1
        const byW = nextW / aspect
        // 取更“贴近用户拖动方向”的方案
        if (Math.abs(dy) >= Math.abs(dx)) {
          nextW = nextH * aspect
        } else {
          nextH = byW
        }
      }

      setCells((prev) =>
        updateCellById(prev, r.id, (c) => {
          const oldW = c.size.w
          const oldH = c.size.h
          const dw = nextW - oldW
          const dh = nextH - oldH

          return {
            ...c,
            size: { w: nextW, h: nextH },
            // 维持中心不变：左上角反向移动一半的增量
            localPos: { x: c.localPos.x - dw / 2, y: c.localPos.y - dh / 2 },
          }
        }),
      )

      scheduleRender()
      return
    }

    // 框选中
    if (isBoxSelectingRef.current && selectionStartRef.current) {
      e.preventDefault()
      const screen = getCanvasScreenPoint(canvas, e.clientX, e.clientY)
      setSelectionBox((prev) => prev ? { ...prev, end: screen } : null)
      return
    }

    // 多选拖动：拖动选中节点时，所有被选中的节点一起移动
    if (draggingCellRef.current && draggingCellRef.current.pointerId === e.pointerId && multiSelectedIds.length > 1) {
      e.preventDefault()
      const screen = getCanvasScreenPoint(canvas, e.clientX, e.clientY)
      const world = screenToWorld(screen, cameraRef.current)
      const d = draggingCellRef.current
      const dxWorld = world.x - d.startWorld.x
      const dyWorld = world.y - d.startWorld.y
      setCells((prev) => {
        return prev.map((cell) => {
          if (multiSelectedIds.includes(cell.id)) {
            return { ...cell, localPos: { x: cell.localPos.x + dxWorld, y: cell.localPos.y + dyWorld } }
          }
          return cell
        })
      })
      scheduleRender()
      return
    }

    // 拖拽连线
    if (draggingEdgeRef.current && draggingEdgeRef.current.pointerId === e.pointerId) {
      e.preventDefault()
      const screen = getCanvasScreenPoint(canvas, e.clientX, e.clientY)
      const world = screenToWorld(screen, cameraRef.current)
      draggingEdgeRef.current.pointerWorld = world

      const hover = pickNearestPort(world)
      if (hover) {
        // 不能吸附到起点同一个节点同一个端口
        if (!(hover.cellId === draggingEdgeRef.current.fromId && hover.port === draggingEdgeRef.current.fromPort)) {
          draggingEdgeRef.current.toId = hover.cellId
          draggingEdgeRef.current.toPort = hover.port
          setHoverPort(hover)
        } else {
          draggingEdgeRef.current.toId = null
          draggingEdgeRef.current.toPort = null
          setHoverPort(null)
        }
      } else {
        draggingEdgeRef.current.toId = null
        draggingEdgeRef.current.toPort = null
        setHoverPort(null)
      }

      scheduleRender()
      return
    }

    // 拖拽单元框：更硬核 —— 必须“按住>=150ms 且 移动超过阈值”才开始拖拽
    if (draggingCellRef.current && draggingCellRef.current.pointerId === e.pointerId) {
      e.preventDefault()
      const screen = getCanvasScreenPoint(canvas, e.clientX, e.clientY)
      const world = screenToWorld(screen, cameraRef.current)

      const d0 = draggingCellRef.current

      if (!d0.isDragging) {
        const dx = screen.x - d0.startScreen.x
        const dy = screen.y - d0.startScreen.y
        const dist = Math.hypot(dx, dy)

        // 先更新 movedReady
        if (dist >= DRAG_START_THRESHOLD_PX && !d0.movedReady) {
          const next = { ...d0, movedReady: true }
          draggingCellRef.current = next

          // 只有两条件都满足才进入拖拽
          if (next.heldReady) {
            try {
              canvas.setPointerCapture(e.pointerId)
            } catch {
              // ignore
            }
            draggingCellRef.current = { ...next, isDragging: true }
          }
        }

        // 未进入拖拽前，绝不移动
        if (!draggingCellRef.current?.isDragging) return
      }

      const d = draggingCellRef.current
      if (!d) return

      const dxWorld = world.x - d.startWorld.x
      const dyWorld = world.y - d.startWorld.y

      setCells((prev) =>
        updateCellById(prev, d.id, (c) => ({
          ...c,
          localPos: { x: d.startPos.x + dxWorld, y: d.startPos.y + dyWorld },
        })),
      )

      if (!d.didMove && (Math.abs(dxWorld) > 0 || Math.abs(dyWorld) > 0)) {
        draggingCellRef.current = { ...d, didMove: true }
      }

      if (dropHintCellId != null) setDropHintCellId(null)
      scheduleRender()
      return
    }

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

    // 框选结束
    if (isBoxSelectingRef.current && selectionStartRef.current && selectionBox) {
      isBoxSelectingRef.current = false

      // selectionBox 是 screen 坐标，命中测试前转换为 world 矩形
      const box = screenBoxToWorldBox(selectionBox.start, selectionBox.end)

      const selected: string[] = []
      const walk = (nodes: CellNode[], parentWorld: { x: number; y: number }) => {
        for (const n of nodes) {
          if (cellIntersectsBox(n, box, parentWorld)) selected.push(n.id)
          if (n.children.length > 0) walk(n.children, { x: parentWorld.x + n.localPos.x, y: parentWorld.y + n.localPos.y })
        }
      }
      walk(cells, { x: 0, y: 0 })
      setMultiSelectedIds(selected)
      setSelectionBox(null)
      selectionStartRef.current = null
      scheduleRender()
      return
    }

    // 结束缩放节点
    if (resizingCellRef.current && resizingCellRef.current.pointerId === e.pointerId) {
      try {
        canvas.releasePointerCapture(e.pointerId)
      } catch {
        // ignore
      }
      resizingCellRef.current = null
      onHistoryPush({ id: crypto.randomUUID(), label: '缩放单元节点', at: Date.now() }, 'user')
      scheduleRender()
      return
    }

    // 结束拖拽连线
    if (draggingEdgeRef.current && draggingEdgeRef.current.pointerId === e.pointerId) {
      try {
        canvas.releasePointerCapture(e.pointerId)
      } catch {
        // ignore
      }

      const d = draggingEdgeRef.current
      if (d.toId && d.toPort) {
        ensureEdge(d.fromId, d.toId, d.fromPort, d.toPort)
        onHistoryPush({ id: crypto.randomUUID(), label: '创建连接', at: Date.now() }, 'user')
      }

      draggingEdgeRef.current = null
      setHoverPort(null)
      scheduleRender()
      return
    }

    // 结束拖拽单元框：更硬核 —— 必须按住>=150ms 且 移动超过阈值 才会进入拖拽；只有真实移动才写历史
    if (draggingCellRef.current && draggingCellRef.current.pointerId === e.pointerId) {
      // 先清理长按计时器
      if (dragStartTimerRef.current != null) {
        window.clearTimeout(dragStartTimerRef.current)
        dragStartTimerRef.current = null
      }

      const d = draggingCellRef.current

      // 只有真的进入拖拽后才需要 release
      if (d.isDragging) {
        try {
          canvas.releasePointerCapture(e.pointerId)
        } catch {
          // ignore
        }
      }

      draggingCellRef.current = null
      if (dropHintCellId != null) setDropHintCellId(null)

      if (d.isDragging && d.didMove) {
        onHistoryPush({ id: crypto.randomUUID(), label: '移动单元框', at: Date.now() }, 'user')
      }

      scheduleRender()
      return
    }

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

  useEffect(() => {
    const wrap = wrapRef.current
    if (!wrap) return

    // 用原生监听器（passive: false）确保能阻止浏览器默认的 Ctrl/⌘+Wheel 页面缩放
    const onWheel = (ev: WheelEvent) => {
      // 仅在事件来自画布区域内部时处理（wrap 内任何元素都算画布区域）
      ev.preventDefault()

      const canvas = canvasRef.current
      if (!canvas) return

      const cam = cameraRef.current

      // Shift + wheel：横向平移（与 React handler 保持一致）
      if (ev.shiftKey && !ev.ctrlKey && !ev.metaKey) {
        cameraRef.current = {
          ...cam,
          x: cam.x + ev.deltaY / cam.zoom,
        }
        scheduleRender()
        return
      }

      // 缩放（以鼠标位置为中心）
      const screen = getCanvasScreenPoint(canvas, ev.clientX, ev.clientY)
      const worldBefore = screenToWorld(screen, cam)

      const zoomIntensity = 0.0028
      const factor = Math.exp(-ev.deltaY * zoomIntensity)
      const nextZoom = clamp(cam.zoom * factor, 0.08, 64)

      cameraRef.current = {
        zoom: nextZoom,
        x: worldBefore.x - screen.x / nextZoom,
        y: worldBefore.y - screen.y / nextZoom,
      }

      scheduleRender()
    }

    wrap.addEventListener('wheel', onWheel, { passive: false })
    return () => wrap.removeEventListener('wheel', onWheel)
  }, [scheduleRender])

  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    // 由原生 wheel 监听器统一处理（解决 passive/浏览器缩放问题）
    e.preventDefault()
  }

  const renderLinkModeHint = () => {
    if (!isLinkMode) return null

    return <div className="canvas-drop-hud">连线模式：依次点击两个单元框创建连接（Esc 退出 / L 切换）</div>
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
          onDoubleClick={handleDoubleClick}
          onWheel={handleWheel}
        />

        <EdgeLayer
          edges={edges}
          selectedEdgeId={selectedEdgeId}
          draggingEdge={draggingEdgeRef.current}
          cells={cells}
          camera={cameraRef.current}
          canvasEl={canvasRef.current}
          wrapEl={wrapRef.current}
          getPortWorld={getPortWorld}
          onSelectEdge={(edgeId) => {
            setSelectedEdgeId(edgeId)
            setSelectedCellId(null)
            setSelectedFormulaId(null)
            scheduleRender()
          }}
        />

        {renderLinkModeHint()}

        {/* Cell 层（单元框 UI 骨架） */}
        <div className="cell-layer" data-tick={renderTick}>
          {(() => {
            const cam = cameraRef.current
            const canvas = canvasRef.current
            const wrap = wrapRef.current
            if (!canvas || !wrap) return null

            const rect = wrap.getBoundingClientRect()

            const renderCell = (c: CellNode, depth: number, parentWorld: { x: number; y: number }) => {
              // 方案A：渲染时实时推导 world（parentWorld + localPos），不依赖 worldPos 缓存。
              const worldNow = { x: parentWorld.x + c.localPos.x, y: parentWorld.y + c.localPos.y }

              const screenPx = worldToScreen(worldNow, cam)
              const xCss = (screenPx.x / canvas.width) * rect.width
              const yCss = (screenPx.y / canvas.height) * rect.height

              const isSelected = selectedCellId === c.id
              const isEditing = editingCellId === c.id
              const isDropHint = dropHintCellId === c.id

              const title = c.kind === 'group' ? (c.collapsed ? 'Group (collapsed)' : 'Group') : 'Cell'

              // depth 是“嵌套渲染深度”，不是递增编号。
              // 递增编号使用 c.seq（创建时分配）。
              const headerLabel = (() => {
                if (c.kind === 'group') return title
                if (c.seq != null) return `Cell #${c.seq}`
                return title
              })()

              const findCellContent = (id: string) => {
                const n = findCellById(cells, id)
                if (!n) return null
                return n.content
              }

              const blocks = c.blocks && c.blocks.length > 0 ? c.blocks : parseBlocksFromText(c.content)

              const htmlContent = renderBlocksToHtml(blocks, {
                findCellContent: (id) => findCellContent(id),
              })

              // 尝试将单元内容当作算术表达式解析为 token（失败则沿用 blocks 展示）
              let arithTokens: ReturnType<typeof parseArithExpr>['tokens'] | null = null
              try {
                arithTokens = parseArithExpr(c.content).tokens
              } catch {
                arithTokens = null
              }

              // console.log(c.id, { arithTokens, blocks })

              const renderPorts = () => {
                const ports: Array<{ port: PortSide; x: number; y: number }> = [
                  { port: 'n', x: c.size.w / 2, y: 8 },
                  { port: 'e', x: c.size.w - 8, y: c.size.h / 2 },
                  { port: 's', x: c.size.w / 2, y: c.size.h - 8 },
                  { port: 'w', x: 8, y: c.size.h / 2 },
                ]

                return (
                  <div className="cell-ports">
                    {ports.map((p) => {
                      const isHover = hoverPort?.cellId === c.id && hoverPort.port === p.port
                      return (
                        <div
                          key={p.port}
                          className={`cell-port${isHover ? ' is-hover' : ''}`}
                          style={{ left: p.x, top: p.y }}
                          onPointerDown={(ev) => {
                            ev.preventDefault()
                            ev.stopPropagation()

                            const canvasEl = canvasRef.current
                            if (!canvasEl) return

                            canvasEl.setPointerCapture(ev.pointerId)

                            const screen = getCanvasScreenPoint(canvasEl, ev.clientX, ev.clientY)
                            const world = screenToWorld(screen, cameraRef.current)

                            draggingEdgeRef.current = {
                              pointerId: ev.pointerId,
                              fromId: c.id,
                              fromPort: p.port,
                              toId: null,
                              toPort: null,
                              pointerWorld: world,
                            }

                            setHoverPort(null)
                            scheduleRender()
                          }}
                        />
                      )
                    })}
                  </div>
                )
              }

              const renderResizeHandle = () => {
                const isSelected = selectedCellId === c.id
                if (!isSelected) return null

                return (
                  <div
                    className="cell-resize-handle"
                    style={{ left: c.size.w - 10, top: c.size.h - 10 }}
                    onPointerDown={(ev) => {
                      ev.preventDefault()
                      ev.stopPropagation()

                      const canvasEl = canvasRef.current
                      if (!canvasEl) return

                      canvasEl.setPointerCapture(ev.pointerId)
                      const screen = getCanvasScreenPoint(canvasEl, ev.clientX, ev.clientY)
                      const world = screenToWorld(screen, cameraRef.current)

                      resizingCellRef.current = {
                        id: c.id,
                        pointerId: ev.pointerId,
                        startWorld: world,
                        startSize: { ...c.size },
                        aspect: c.size.w / Math.max(1, c.size.h),
                      }
                    }}
                    title="拖拽缩放（Shift 锁定比例）"
                  />
                )
              }

              return (
                <div
                  key={c.id}
                  className={`cell${isSelected ? ' is-selected' : ''}${isDropHint ? ' is-drop-hint' : ''}`}
                  style={{ left: xCss, top: yCss, width: c.size.w, height: c.size.h }}
                  onPointerDown={(ev) => {
                    // 如果正在编辑别的 cell，点到这个 cell 视为“完成编辑”
                    if (editingCellId && editingCellId !== c.id && ev.button === 0) {
                      commitCellEditing(editingCellId)
                    }

                    const t = ev.target as HTMLElement | null
                    const tag = t?.tagName?.toLowerCase()
                    const isEditable = t instanceof HTMLElement ? t.isContentEditable : false

                    // 允许在输入控件内正常获取焦点/输入
                    if (tag === 'textarea' || tag === 'input' || isEditable) {
                      ev.stopPropagation()
                      return
                    }

                    ev.preventDefault()
                    ev.stopPropagation()

                    const canvasEl = canvasRef.current
                    if (!canvasEl) return

                    // 连线模式：点击节点来选择起点/终点
                    if (isLinkMode && ev.button === 0) {
                      setSelectedCellId(c.id)
                      if (linkFromId == null) {
                        setLinkFromId(c.id)
                      } else {
                        ensureEdge(linkFromId, c.id)
                        setLinkFromId(null)
                      }
                      scheduleRender()
                      return
                    }

                    setSelectedCellId(c.id)

                    // 左键拖拽：改成“按住 150ms 或移动超过阈值才开始拖拽”
                    if (ev.button !== 0) return

                    // 清理可能存在的上一次定时器
                    if (dragStartTimerRef.current != null) {
                      window.clearTimeout(dragStartTimerRef.current)
                      dragStartTimerRef.current = null
                    }

                    const screen = getCanvasScreenPoint(canvasEl, ev.clientX, ev.clientY)
                    const world = screenToWorld(screen, cameraRef.current)

                    const armDrag = () => {
                      const cur = draggingCellRef.current
                      if (!cur) return
                      if (cur.pointerId !== ev.pointerId) return
                      if (cur.isDragging) return

                      // 更硬核：必须同时满足“按住 >=150ms”与“移动超过阈值”
                      if (!cur.heldReady || !cur.movedReady) return

                      try {
                        canvasEl.setPointerCapture(ev.pointerId)
                      } catch {
                        // ignore
                      }

                      draggingCellRef.current = { ...cur, isDragging: true }
                      scheduleRender()
                    }

                    if (multiSelectedIds.length > 1 && multiSelectedIds.includes(c.id)) {
                      // 多选拖动：同样使用延迟/阈值启动
                      draggingCellRef.current = {
                        id: c.id,
                        pointerId: ev.pointerId,
                        startWorld: world,
                        startScreen: screen,
                        startPos: { x: c.localPos.x, y: c.localPos.y },
                        parentWorld,
                        heldReady: false,
                        movedReady: false,
                        isDragging: false,
                        didMove: false,
                      }

                      dragStartTimerRef.current = window.setTimeout(() => {
                        dragStartTimerRef.current = null
                        const cur = draggingCellRef.current
                        if (!cur || cur.pointerId !== ev.pointerId) return
                        draggingCellRef.current = { ...cur, heldReady: true }
                        armDrag()
                      }, DRAG_START_DELAY_MS)

                      return
                    }

                    draggingCellRef.current = {
                      id: c.id,
                      pointerId: ev.pointerId,
                      startWorld: world,
                      startScreen: screen,
                      startPos: { x: c.localPos.x, y: c.localPos.y },
                      parentWorld,
                      heldReady: false,
                      movedReady: false,
                      isDragging: false,
                      didMove: false,
                    }

                    dragStartTimerRef.current = window.setTimeout(() => {
                      dragStartTimerRef.current = null
                      const cur = draggingCellRef.current
                      if (!cur || cur.pointerId !== ev.pointerId) return
                      draggingCellRef.current = { ...cur, heldReady: true }
                      armDrag()
                    }, DRAG_START_DELAY_MS)
                  }}

                  onDoubleClick={(ev) => {
                    ev.preventDefault()
                    ev.stopPropagation()
                    setSelectedCellId(c.id)
                    setEditingCellId(c.id)
                  }}
                >
                  {renderPorts()}
                  {renderResizeHandle()}

                  {isSelected && (
                    <div className="cell-header">
                      <span className="cell-title">{headerLabel}</span>
                      <span className="cell-depth" title="嵌套深度（调试）">#{depth}</span>

                      {c.kind === 'group' && (
                        <button
                          type="button"
                          className="cell-collapse"
                          onClick={(ev) => {
                            ev.preventDefault()
                            ev.stopPropagation()
                            setCells((prev) => updateCellById(prev, c.id, (n) => ({ ...n, collapsed: !n.collapsed })))
                            scheduleRender()
                          }}
                          title={c.collapsed ? '展开' : '折叠'}
                        >
                          {c.collapsed ? '▸' : '▾'}
                        </button>
                      )}

                      {/* 暂时禁用显式嵌套：仅保留节点连接（Edge）能力 */}
                    </div>
                  )}

                  <div className="cell-body"
                    onDoubleClickCapture={(ev) => {
                      // 双击内容区进入编辑（捕获阶段，避免子元素 stopPropagation 导致不触发）
                      const t = ev.target as HTMLElement | null
                      if (!t) return

                      // 连线模式下不进入编辑，避免误触
                      if (isLinkMode) return

                      // 如果双击发生在端口/缩放手柄等交互控件上，则忽略
                      if (t.closest('.cell-port') || t.closest('.cell-resize-handle') || t.closest('.cell-ports')) return

                      // 取消候选拖拽
                      if (dragStartTimerRef.current != null) {
                        window.clearTimeout(dragStartTimerRef.current)
                        dragStartTimerRef.current = null
                      }
                      draggingCellRef.current = null

                      ev.preventDefault()
                      ev.stopPropagation()
                      setSelectedCellId(c.id)
                      setEditingCellId(c.id)
                    }}
                  >
                    {isEditing ? (
                      <div className="cell-editor-wrap">
                        <textarea
                          className="cell-editor"
                          value={c.content}
                          onChange={(ev) => {
                            const v = ev.target.value
                            const nextSize = estimateCellSizeFromText(v)

                            // 尺寸变化时保持节点中心稳定：通过调整 localPos 抵消 size 变化
                            setCells((prev) =>
                              updateCellById(prev, c.id, (next) => {
                                const dx = (next.size.w - nextSize.w) / 2
                                const dy = (next.size.h - nextSize.h) / 2
                                return {
                                  ...next,
                                  content: v,
                                  size: nextSize,
                                  localPos: { x: next.localPos.x + dx, y: next.localPos.y + dy },
                                }
                              }),
                            )
                          }}
                          onKeyDown={(ev) => {
                            if (ev.key === 'Escape') {
                              ev.preventDefault()
                              // Esc：视为结束编辑；若内容为空会被 commitCellEditing 自动删除
                              commitCellEditing(c.id)
                              return
                            }

                            // Shift+Enter：换行，不提交
                            if (ev.key === 'Enter' && ev.shiftKey) return

                            // Ctrl/⌘+Enter：提交并求值
                            if (ev.key === 'Enter' && (ev.ctrlKey || ev.metaKey)) {
                              ev.preventDefault()
                              commitCellEditing(c.id, { runEval: true })
                              return
                            }

                            // Enter：提交并退出（立刻渲染）
                            if (ev.key === 'Enter') {
                              ev.preventDefault()
                              commitCellEditing(c.id)
                              return
                            }
                          }}
                          onBlur={() => {
                            // 点击编辑区域外：完成编辑并立刻渲染
                            commitCellEditing(c.id)
                          }}
                        />
                      </div>
                    ) : arithTokens ? (
                      <>
                        <ExprTokenView
                          tokens={arithTokens}
                          selectedTokenId={selectedExprToken?.cellId === c.id ? selectedExprToken.tokenId : null}
                          onSelectToken={({ tokenId, tokenIndex, anchorRect }) => {
                            setSelectedExprToken({ cellId: c.id, tokenId })

                            const wrap = wrapRef.current
                            const wrapRect = wrap?.getBoundingClientRect()
                            const left = wrapRect ? anchorRect.left - wrapRect.left : anchorRect.left
                            const top = wrapRect ? anchorRect.bottom - wrapRect.top + 6 : anchorRect.bottom + 6

                            setActiveInlineEditor((prev) => {
                              const draft = prev?.cellId === c.id ? prev.draft : arithTokens[tokenIndex]?.text ?? ''
                              return {
                                cellId: c.id,
                                selection: { kind: 'tokenRange', start: tokenIndex, end: tokenIndex },
                                draft,
                                anchorCss: { left, top },
                              }
                            })
                          }}
                          onDeselect={() => {
                            if (selectedExprToken?.cellId === c.id) setSelectedExprToken(null)
                            if (activeInlineEditor?.cellId === c.id) setActiveInlineEditor(null)
                          }}
                          onRequestEdit={({ tokenIndex, anchorRect }) => {
                            const wrap = wrapRef.current
                            const wrapRect = wrap?.getBoundingClientRect()
                            const left = wrapRect ? anchorRect.left - wrapRect.left : anchorRect.left
                            const top = wrapRect ? anchorRect.bottom - wrapRect.top + 6 : anchorRect.bottom + 6

                            setActiveInlineEditor({
                              cellId: c.id,
                              selection: { kind: 'tokenRange', start: tokenIndex, end: tokenIndex },
                              draft: arithTokens[tokenIndex]?.text ?? '',
                              anchorCss: { left, top },
                            })
                          }}
                        />

                        {activeInlineEditor?.cellId === c.id && (
                          <InlineExprEditor
                            anchorCss={activeInlineEditor.anchorCss}
                            draft={activeInlineEditor.draft}
                            onChangeDraft={(v) => setActiveInlineEditor((prev) => (prev ? { ...prev, draft: v } : prev))}
                            onApply={() => {
                              if (!activeInlineEditor) return
                              if (activeInlineEditor.cellId !== c.id) return

                              const sel = activeInlineEditor.selection
                              if (sel.kind !== 'tokenRange') return
                              const { start, end } = normalizeRange(sel.start, sel.end)

                              const before = arithTokens.slice(0, start).map((t) => t.text).join('')
                              const after = arithTokens.slice(end + 1).map((t) => t.text).join('')
                              const nextContent = `${before}${activeInlineEditor.draft}${after}`

                              setCells((prev) =>
                                updateCellById(prev, c.id, (next) => ({
                                  ...next,
                                  content: nextContent,
                                  blocks: parseBlocksFromText(nextContent),
                                })),
                              )

                              onHistoryPush({ id: crypto.randomUUID(), label: '局部编辑表达式', at: Date.now() }, 'user')
                              setActiveInlineEditor(null)
                              scheduleRender()
                            }}
                            onCancel={() => {
                              if (activeInlineEditor?.cellId === c.id) setActiveInlineEditor(null)
                            }}
                          />
                        )}
                      </>
                    ) : (
                      <div className="cell-blocks" dangerouslySetInnerHTML={{ __html: htmlContent }} />
                    )}
                  </div>

                  {!c.collapsed && c.children.length > 0 && (
                    <div className="cell-children">{c.children.map((ch) => renderCell(ch, depth + 1, worldNow))}</div>
                  )}
                </div>
              )
            }

            return cells.map((c) => renderCell(c, 0, { x: 0, y: 0 }))
          })()}
        </div>

        <FormulaLayer
          formulas={formulas}
          selectedFormulaId={selectedFormulaId}
          camera={cameraRef.current}
          canvasEl={canvasRef.current}
          wrapEl={wrapRef.current}
          onSelectFormula={(id) => setSelectedFormulaId(id)}
          onStartDrag={(d) => {
            draggingFormulaRef.current = d
          }}
        />

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

        {selectionBox && (() => {
          const canvas = canvasRef.current
          const wrap = wrapRef.current
          if (!canvas || !wrap) return null

          // selectionBox 是 canvas 内像素；需要映射到 wrap CSS 像素
          const rect = wrap.getBoundingClientRect()
          const pxToCssX = rect.width / canvas.width
          const pxToCssY = rect.height / canvas.height

          const left = Math.min(selectionBox.start.x, selectionBox.end.x) * pxToCssX
          const top = Math.min(selectionBox.start.y, selectionBox.end.y) * pxToCssY
          const width = Math.abs(selectionBox.start.x - selectionBox.end.x) * pxToCssX
          const height = Math.abs(selectionBox.start.y - selectionBox.end.y) * pxToCssY

          return (
            <div
              className="canvas-selection-box"
              style={{
                position: 'absolute',
                left,
                top,
                width,
                height,
                background: 'rgba(0,120,255,0.12)',
                border: '1.5px solid #1890ff',
                pointerEvents: 'none',
                zIndex: 10,
              }}
            />
          )
        })()}
      </div>
      <div className="small-muted">
        当前模式：文本/公式 ｜ 缩放：{cameraRef.current.zoom.toFixed(2)}x ｜ 平移：中键拖拽 / 空格+拖拽 ｜
        单元框：单击选中、拖拽移动、双击编辑 ｜
        连线：按 L 进入连线模式，点击两个单元框创建连接
      </div>
    </div>
  )
}

