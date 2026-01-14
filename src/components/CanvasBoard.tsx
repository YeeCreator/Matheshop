import { useCallback, useEffect, useRef, useState } from 'react'
import katex from 'katex'
import type { CanvasEdge, CellNode, PortSide } from './cellTypes'
import EdgeLayer from './canvas/EdgeLayer'
import FormulaLayer from './canvas/FormulaLayer'
import CanvasCellLayer from './canvas/cells/CanvasCellLayer'
import { evalExpression } from '../engine/engineClient'
import type { EngineSelectionState } from '../engine/engineSelection'
import { ensureEdgeUnique, getPortWorld as getPortWorldDomain, pickNearestPort as pickNearestPortDomain } from './canvas/domain/edges'
import {
  collectCellWorldHits,
  recomputeWorldAll,
  removeCellById,
  updateCellById,
} from './canvas/domain/cellTree'
import {
  clamp,
  type Camera,
  resizeCanvasToDisplaySize,
  screenToWorld,
} from './canvas/utils/geometry'
import { parseBlocksFromText } from './canvas/utils/blocks'
import { useCanvasFsm } from './canvas/fsm/useCanvasFsm'
import type { CanvasFsmCommand } from './canvas/fsm/types'
import type { InlineSelection } from './canvas/exprSelection'

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

  // 仅用于开发排查：记录最后一次新建节点的信息
  const lastCreatedCellRef = useRef<null | { id: string; world: { x: number; y: number } }>(null)

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

  const dragStartTimerRef = useRef<number | null>(null)

  // --- 交互 FSM（渐进迁移：接入框选/连线/视口/节点拖拽/缩放）---
  // （移除顶部版本：必须放到 ensureEdge/scheduleRender/dispatchFsm 都已声明之后）
  // const applyFsmCommands = useCallback(...)
  // const handleCellPointerDownForDrag = useCallback(...)

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
    const editorBorder = 2

    // cell 外框 border（肉眼估算，避免极小尺寸时内容被压到 0）
    const outerBorder = 2

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

      // 空内容：
      // 以前的策略是“删除节点”。但双击新建后用户很可能先点空白处/切走，
      // 这会导致节点“刚创建就消失”，体验很差。
      // 现在改为：如果是空内容，只退出编辑态并保留节点。
      if (trimmed.length === 0) {
        setEditingCellId(null)
        setSelectedCellId((cur) => (cur === cellId ? cur : cur))
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

  // 表达式 token 选择 / 行内编辑器（用于算式 token 的替换编辑）
  const [selectedExprToken, setSelectedExprToken] = useState<null | { cellId: string; tokenId: string }>(null)
  const [activeInlineEditor, setActiveInlineEditor] = useState<
    | null
    | {
        cellId: string
        selection: InlineSelection
        draft: string
        anchorCss: { left: number; top: number }
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
      draggingEdgeRef.current = null
      setHoverPort(null)
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

  const [isLinkMode, setIsLinkMode] = useState(false)
  const [linkFromId, setLinkFromId] = useState<string | null>(null)

  const draggingEdgeRef = useRef<
    | null
    | {
        pointerId: number
        fromId: string
        fromPort: PortSide
        toId: string | null
        toPort: PortSide | null
        pointerWorld: { x: number; y: number }
      }
  >(null)

  const [hoverPort, setHoverPort] = useState<null | { cellId: string; port: PortSide }>(null)

  const ensureEdge = useCallback((from: string, to: string, fromPort?: PortSide, toPort?: PortSide) => {
    if (from === to) return
    setEdges((prev) => {
      const next = ensureEdgeUnique(prev, { from, to, fromPort, toPort })
      return next.map((e) => ('id' in e ? (e as CanvasEdge) : ({ ...e, id: crypto.randomUUID() } as CanvasEdge)))
    })
  }, [])

  const getPortWorld = useCallback(
    (cellId: string, port: PortSide, hits: unknown): { x: number; y: number } | null => {
      // hits 由 EdgeLayer 传入，这里做运行期收敛，避免因为渐进迁移导致的类型不一致
      return getPortWorldDomain({ cells, hits: hits as ReturnType<typeof collectCellWorldHits>, cellId, port })
    },
    [cells],
  )

  const pickNearestPort = useCallback(
    (pointerWorld: { x: number; y: number }): { cellId: string; port: PortSide } | null => {
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

      // 编辑状态：不允许用 L 切换连线模式
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
        setLinkFromId(null)
        setIsLinkMode(false)
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [editingCellId, editor])

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

  // 基于可滚动容器（canvas-wrap）计算“画布像素坐标”。
  // 注意：canvas 的 CSS 宽高通常等于 workspace(8000x8000)；wrap 只是“窗口”。
  // 因此映射必须以 canvas 的 bounding box 为基准，并叠加 wrap 的 scrollLeft/Top，
  // 不能用 wrapRect.width/height 直接映射，否则坐标会被压缩到左上角。
  const getScreenFromWrap = useCallback(
    (clientX: number, clientY: number): { x: number; y: number } | null => {
      const canvas = canvasRef.current
      const wrap = wrapRef.current
      if (!canvas || !wrap) return null

      const wrapRect = wrap.getBoundingClientRect()
      const canvasRect = canvas.getBoundingClientRect()

      // 把 client 坐标先换算到“workspace 内的 CSS 坐标”（考虑 wrap 滚动）
      const xCssInWorkspace = clientX - wrapRect.left + wrap.scrollLeft
      const yCssInWorkspace = clientY - wrapRect.top + wrap.scrollTop

      // 然后把 workspace CSS 坐标映射到 canvas 像素坐标（考虑 DPR）
      // canvasRect.width/height == canvas 的 CSS 尺寸
      const sx = (xCssInWorkspace / canvasRect.width) * canvas.width
      const sy = (yCssInWorkspace / canvasRect.height) * canvas.height

      return { x: sx, y: sy }
    },
    [],
  )

  // 框选：screen 坐标转 world 矩形
  const screenBoxToWorldBox = useCallback(
    (a: { x: number; y: number }, b: { x: number; y: number }) => {
      const x1 = Math.min(a.x, b.x)
      const y1 = Math.min(a.y, b.y)
      const x2 = Math.max(a.x, b.x)
      const y2 = Math.max(a.y, b.y)

      const w1 = screenToWorld({ x: x1, y: y1 }, cameraRef.current)
      const w2 = screenToWorld({ x: x2, y: y2 }, cameraRef.current)

      return {
        x: Math.min(w1.x, w2.x),
        y: Math.min(w1.y, w2.y),
        w: Math.abs(w2.x - w1.x),
        h: Math.abs(w2.y - w1.y),
      }
    },
    [],
  )

  const cellIntersectsBox = useCallback(
    (node: CellNode, box: { x: number; y: number; w: number; h: number }, parentWorld: { x: number; y: number }) => {
      const x = parentWorld.x + node.localPos.x
      const y = parentWorld.y + node.localPos.y
      const rect = { x, y, w: node.size.w, h: node.size.h }

      const xOverlap = rect.x < box.x + box.w && rect.x + rect.w > box.x
      const yOverlap = rect.y < box.y + box.h && rect.y + rect.h > box.y
      return xOverlap && yOverlap
    },
    [],
  )

  // --- 交互 FSM（渐进迁移：接入框选/连线/视口/节点拖拽/缩放）---
  const applyFsmCommands = useCallback(
    (cmds: CanvasFsmCommand[]) => {
      for (const cmd of cmds) {
        if (cmd.kind === 'SET_SELECTION_BOX') {
          setSelectionBox(cmd.box)
          if (cmd.box) {
            selectionStartRef.current = cmd.box.start
            isBoxSelectingRef.current = true
          } else {
            selectionStartRef.current = null
            isBoxSelectingRef.current = false
          }
          continue
        }

        if (cmd.kind === 'SET_HOVER_PORT') {
          setHoverPort(cmd.hover)
          continue
        }

        if (cmd.kind === 'ENSURE_EDGE') {
          ensureEdge(cmd.fromId, cmd.toId, cmd.fromPort, cmd.toPort)
          continue
        }

        if (cmd.kind === 'SET_CAMERA') {
          cameraRef.current = cmd.camera
          scheduleRender()
          continue
        }

        if (cmd.kind === 'CAPTURE_POINTER') {
          const canvas = canvasRef.current
          if (canvas) {
            try {
              canvas.setPointerCapture(cmd.pointerId)
            } catch {
              // ignore
            }
          }
          continue
        }

        if (cmd.kind === 'RELEASE_POINTER') {
          const canvas = canvasRef.current
          if (canvas) {
            try {
              canvas.releasePointerCapture(cmd.pointerId)
            } catch {
              // ignore
            }
          }
          continue
        }

        if (cmd.kind === 'CLEAR_DROP_HINT') {
          setDropHintCellId(null)
          continue
        }

        if (cmd.kind === 'UPDATE_CELL_POS') {
          setCells((prev) =>
            recomputeWorldAll(
              updateCellById(prev, cmd.cellId, (c) => ({
                ...c,
                localPos: { x: cmd.localPos.x, y: cmd.localPos.y },
              })),
            ),
          )
          scheduleRender()
          continue
        }

        if (cmd.kind === 'UPDATE_CELL_SIZE_CENTER_ANCHORED') {
          setCells((prev) =>
            recomputeWorldAll(
              updateCellById(prev, cmd.cellId, (c) => ({
                ...c,
                size: { w: cmd.size.w, h: cmd.size.h },
                localPos: { x: cmd.localPos.x, y: cmd.localPos.y },
              })),
            ),
          )
          scheduleRender()
          continue
        }

        if (cmd.kind === 'PUSH_HISTORY') {
          onHistoryPush({ id: crypto.randomUUID(), label: cmd.label, at: Date.now() }, 'user')
        }
      }
    },
    [ensureEdge, onHistoryPush, scheduleRender],
  )

  const { model: fsm, dispatch: dispatchFsm } = useCanvasFsm({
    camera: cameraRef.current,
    getFreshCamera: () => ({ ...cameraRef.current }),
    onCommands: applyFsmCommands,
    externalSelectedCellId: selectedCellId,
    externalSelectedEdgeId: selectedEdgeId,
    externalSelectedFormulaId: selectedFormulaId,
    externalMultiSelectedIds: multiSelectedIds,
    externalIsLinkMode: isLinkMode,
    externalLinkFromId: linkFromId,
  })

  const handleCellPointerDownForDrag = useCallback(
    (args: {
      ev: React.PointerEvent
      cell: CellNode
      parentWorld: { x: number; y: number }
      screen: { x: number; y: number }
      world: { x: number; y: number }
    }) => {
      const { ev, cell: c, screen, world } = args

      // 清理可能存在的上一次定时器
      if (dragStartTimerRef.current != null) {
        window.clearTimeout(dragStartTimerRef.current)
        dragStartTimerRef.current = null
      }

      dispatchFsm({
        kind: 'CELL_DRAG_ARM',
        pointerId: ev.pointerId,
        cellId: c.id,
        startWorld: world,
        startScreen: screen,
        startPos: { x: c.localPos.x, y: c.localPos.y },
      })

      dragStartTimerRef.current = window.setTimeout(() => {
        dragStartTimerRef.current = null
        dispatchFsm({ kind: 'CELL_DRAG_HOLD_READY', pointerId: ev.pointerId })
      }, 150)
    },
    [dispatchFsm],
  )

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return

    // 编辑中：点击画布空白处视为“完成编辑”
    if (editingCellId && e.button === 0) {
      commitCellEditing(editingCellId)
    }

    // 如果正在拖拽公式，不要让画布再吃到新的 pointerdown
    if (draggingFormulaRef.current) {
      e.preventDefault()
      return
    }

    e.preventDefault()

    // 连线模式：点击画布空白处取消起点（不创建新节点）
    if (isLinkMode && e.button === 0) {
      setSelectedFormulaId(null)
      setSelectedCellId(null)
      setLinkFromId(null)
      // 同步到 FSM（后续会完全迁移）
      dispatchFsm({ kind: 'SET_LINK_FROM', linkFromId: null })
      return
    }

    const isMiddle = e.button === 1
    const isMiddleByButtons = (e.buttons & 4) === 4

    // 中键 或 空格+左键：拖拽平移
    if (isMiddle || isMiddleByButtons || (isSpaceDown && e.button === 0)) {
      const screen = getScreenFromWrap(e.clientX, e.clientY)
      if (!screen) return
      dispatchFsm({
        kind: 'VIEWPORT_PAN_START',
        pointerId: e.pointerId,
        startScreen: screen,
        startCam: { ...cameraRef.current },
      })
      return
    }

    // 点击空白处：取消选中
    if (e.button === 0) {
      setSelectedFormulaId(null)
      setSelectedCellId(null)
      setSelectedEdgeId(null)
      setSelectedExprToken(null)
    }

    // 框选：空白处左键按下且无 modifier
    if (e.button === 0 && !isSpaceDown && !isLinkMode && !draggingFormulaRef.current) {
      const screen = getScreenFromWrap(e.clientX, e.clientY)
      if (!screen) return
      const world = screenToWorld(screen, cameraRef.current)
      dispatchFsm({
        kind: 'CANVAS_POINTER_DOWN',
        pointer: {
          pointerId: e.pointerId,
          button: e.button,
          buttons: e.buttons,
          shiftKey: e.shiftKey,
          altKey: e.altKey,
          ctrlKey: e.ctrlKey,
          metaKey: e.metaKey,
        },
        screen,
        world,
      })
      return
    }
  }

  const handleDoubleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return

    // 双击创建节点：避免在连线/平移/拖拽/框选等状态下误触
    if (isLinkMode) return
    if (isSpaceDown || fsm.state.tag === 'panningViewport') return
    if (draggingFormulaRef.current) return
    if (fsm.state.tag === 'draggingCell' || fsm.state.tag === 'resizingCell') return
    if (isBoxSelectingRef.current) return

    // 只响应左键双击
    if ((e as unknown as MouseEvent).button !== 0) return

    const screen = getScreenFromWrap(e.clientX, e.clientY)
    if (!screen) return
    const world = screenToWorld(screen, cameraRef.current)

    const id = crypto.randomUUID()
    const seq = nextCellSeqRef.current++

    const content = ''

    // 新建节点：占位尺寸尽量小（接近 1 个字符），后续会随着输入实时调整
    const size = estimateCellSizeFromText(content)

    setCells((prev) => {
      // localPos 存的是“左上角（相对父节点）”，而双击 world 是“期望中心点”。
      // 因此需要把 world.x/y 向左上角偏移 size.w/2 / size.h/2
      const localX = world.x - size.w / 2
      const localY = world.y - size.h / 2

      const next: CellNode = {
        id,
        parentId: null,
        localPos: { x: localX, y: localY },
        // worldPos 由 recomputeWorldAll 统一重算，这里先保留同语义值作为调试信息
        worldPos: { x: world.x, y: world.y },
        size,
        kind: 'cell',
        blocks: [],
        content,
        children: [],
        seq,
      }

      lastCreatedCellRef.current = { id, world: { x: world.x, y: world.y } }
      return recomputeWorldAll([...prev, next])
    })

    // 注意：不要在新建节点时自动移动 camera。
    // 用户的期望是“我双击的点就是节点中心点”，自动平移会造成视觉上的错位感。

    setSelectedCellId(id)
    setEditingCellId(id)

    scheduleRender()
  }

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return

    // 节点缩放（已迁移到 FSM）：中心缩放（center-anchored）
    if (fsm.state.tag === 'resizingCell' && fsm.state.pointerId === e.pointerId) {
      e.preventDefault()
      const screen = getScreenFromWrap(e.clientX, e.clientY)
      if (!screen) return
      const world = screenToWorld(screen, cameraRef.current)
      dispatchFsm({ kind: 'CELL_RESIZE_MOVE', pointerId: e.pointerId, world, shiftKey: e.shiftKey })
      return
    }

    // 框选中（迁移到 FSM 后，这里只负责把坐标发给 FSM）
    if (fsm.state.tag === 'boxSelecting') {
      e.preventDefault()
      const screen = getScreenFromWrap(e.clientX, e.clientY)
      if (!screen) return
      const world = screenToWorld(screen, cameraRef.current)
      dispatchFsm({
        kind: 'CANVAS_POINTER_MOVE',
        pointer: { pointerId: e.pointerId, buttons: e.buttons },
        screen,
        world,
      })
      return
    }

    // 拖拽连线（迁移中：pointerWorld 写入 FSM，hover/吸附仍由这里计算）
    if (draggingEdgeRef.current && draggingEdgeRef.current.pointerId === e.pointerId) {
      e.preventDefault()
      const screen = getScreenFromWrap(e.clientX, e.clientY)
      if (!screen) return
      const world = screenToWorld(screen, cameraRef.current)
      draggingEdgeRef.current.pointerWorld = world
      dispatchFsm({
        kind: 'CANVAS_POINTER_MOVE',
        pointer: { pointerId: e.pointerId, buttons: e.buttons },
        screen,
        world,
      })

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

      // 同步 hover 到 FSM（后续让 FSM 接管 hover 计算）
      dispatchFsm({ kind: 'HOVER_PORT_SET', hover: hover ?? null })

      scheduleRender()
      return
    }

    // 拖拽单元框（已迁移到 FSM）
    if (fsm.state.tag === 'draggingCell' && fsm.state.pointerId === e.pointerId) {
      e.preventDefault()
      const screen = getScreenFromWrap(e.clientX, e.clientY)
      if (!screen) return
      const world = screenToWorld(screen, cameraRef.current)

      dispatchFsm({ kind: 'CELL_DRAG_MOVE', pointerId: e.pointerId, screen, world })
      return
    }

    // 拖拽公式：优先级最高
    if (draggingFormulaRef.current && draggingFormulaRef.current.pointerId === e.pointerId) {
      e.preventDefault()
      const screen = getScreenFromWrap(e.clientX, e.clientY)
      if (!screen) return
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

    // 视口平移（已迁移到 FSM）
    if (fsm.state.tag === 'panningViewport' && fsm.state.pointerId === e.pointerId) {
      e.preventDefault()
      const screen = getScreenFromWrap(e.clientX, e.clientY)
      if (!screen) return
      dispatchFsm({ kind: 'VIEWPORT_PAN_MOVE', pointerId: e.pointerId, screen })
      return
    }
  }

  const handlePointerUpOrCancel = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return
    e.preventDefault()

    // 框选结束（迁移到 FSM：由 FSM 清空 selectionBox，并在这里计算命中结果）
    if (fsm.state.tag === 'boxSelecting' && selectionBox) {
      const screen = getScreenFromWrap(e.clientX, e.clientY)
      if (!screen) return
      const world = screenToWorld(screen, cameraRef.current)
      dispatchFsm({
        kind: 'CANVAS_POINTER_UP_OR_CANCEL',
        pointer: { pointerId: e.pointerId },
        screen,
        world,
      })

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

      scheduleRender()
      return
    }

    // 结束缩放节点（已迁移到 FSM）
    if (fsm.state.tag === 'resizingCell' && fsm.state.pointerId === e.pointerId) {
      dispatchFsm({ kind: 'CELL_RESIZE_END', pointerId: e.pointerId })
      scheduleRender()
      return
    }

    // 结束拖拽连线（迁移到 FSM：创建连接与写历史从 commands 产出）
    if (draggingEdgeRef.current && draggingEdgeRef.current.pointerId === e.pointerId) {
      try {
        canvas.releasePointerCapture(e.pointerId)
      } catch {
        // ignore
      }

      const d = draggingEdgeRef.current

      if (d.toId && d.toPort) {
        dispatchFsm({ kind: 'HOVER_PORT_SET', hover: { cellId: d.toId, port: d.toPort } })
      } else {
        dispatchFsm({ kind: 'HOVER_PORT_SET', hover: null })
      }

      const screen = getScreenFromWrap(e.clientX, e.clientY)
      if (!screen) return
      const world = screenToWorld(screen, cameraRef.current)

      dispatchFsm({
        kind: 'CANVAS_POINTER_UP_OR_CANCEL',
        pointer: { pointerId: e.pointerId },
        screen,
        world,
      })

      draggingEdgeRef.current = null
      setHoverPort(null)
      scheduleRender()
      return
    }

    // 结束拖拽单元框（已迁移到 FSM）
    if (fsm.state.tag === 'draggingCell' && fsm.state.pointerId === e.pointerId) {
      if (dragStartTimerRef.current != null) {
        window.clearTimeout(dragStartTimerRef.current)
        dragStartTimerRef.current = null
      }

      dispatchFsm({ kind: 'CELL_DRAG_END', pointerId: e.pointerId })
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

    // 结束视口平移（已迁移到 FSM）
    if (fsm.state.tag === 'panningViewport' && fsm.state.pointerId === e.pointerId) {
      dispatchFsm({ kind: 'VIEWPORT_PAN_END', pointerId: e.pointerId })
      scheduleRender()
      return
    }
  }

  useEffect(() => {
    const wrap = wrapRef.current
    if (!wrap) return

    // 用原生监听器（passive: false）确保能阻止浏览器默认的 Ctrl/⌘+Wheel 页面缩放
    const onWheel = (ev: WheelEvent) => {
      ev.preventDefault()

      const screen = getScreenFromWrap(ev.clientX, ev.clientY)
      if (!screen) return

      dispatchFsm({
        kind: 'VIEWPORT_WHEEL',
        screen,
        deltaX: ev.deltaX,
        deltaY: ev.deltaY,
        shiftKey: ev.shiftKey,
        ctrlKey: ev.ctrlKey,
        metaKey: ev.metaKey,
      })
    }

    wrap.addEventListener('wheel', onWheel, { passive: false })
    return () => wrap.removeEventListener('wheel', onWheel)
  }, [dispatchFsm, getScreenFromWrap])

  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    // 由原生 wheel 监听器统一处理（解决 passive/浏览器缩放问题）
    e.preventDefault()
  }

  const renderLinkModeHint = () => {
    if (!isLinkMode) return null

    return <div className="canvas-drop-hud">连线模式：依次点击两个单元框创建连接（Esc 退出 / L 切换）</div>
  }

  const renderDevHud = () => {
    // 调试 HUD 默认关闭，避免开发时误留 UI 污染。
    // 如需打开：在控制台执行 `localStorage.setItem('matheshop:devHud','1')` 然后刷新。
    if (!import.meta.env.DEV) return null
    if (typeof window === 'undefined') return null
    if (window.localStorage.getItem('matheshop:devHud') !== '1') return null

    const last = lastCreatedCellRef.current
    return (
      <div
        style={{
          position: 'absolute',
          left: 12,
          top: 12,
          padding: '8px 10px',
          borderRadius: 8,
          background: 'rgba(0,0,0,0.65)',
          color: '#fff',
          fontSize: 12,
          zIndex: 9999,
          pointerEvents: 'auto',
          maxWidth: 520,
          lineHeight: 1.5,
        }}
      >
        <div style={{ fontWeight: 600, marginBottom: 4 }}>DEV 画布调试</div>
        <div>cells: {cells.length} / formulas: {formulas.length} / edges: {edges.length}</div>
        <div>
          cam: x={cameraRef.current.x.toFixed(2)} y={cameraRef.current.y.toFixed(2)} zoom={cameraRef.current.zoom.toFixed(2)}
        </div>
        <div>wrap: {wrapRef.current ? 'ok' : 'null'} / canvas: {canvasRef.current ? 'ok' : 'null'}</div>
        <div>lastCreated: {last ? `${last.id.slice(0, 8)} @ (${last.world.x.toFixed(1)}, ${last.world.y.toFixed(1)})` : 'null'}</div>
        <button
          type="button"
          style={{ marginTop: 6 }}
          onClick={() => {
            if (!lastCreatedCellRef.current) return
            const w = lastCreatedCellRef.current.world
            cameraRef.current = {
              ...cameraRef.current,
              x: w.x - 200 / cameraRef.current.zoom,
              y: w.y - 120 / cameraRef.current.zoom,
            }
            scheduleRender()
          }}
        >
          聚焦到最后节点
        </button>
        <button
          type="button"
          style={{ marginTop: 6, marginLeft: 8 }}
          onClick={() => {
            window.localStorage.removeItem('matheshop:devHud')
            scheduleRender()
          }}
        >
          关闭 HUD
        </button>
      </div>
    )
  }

  return (
    <div className="canvas-shell">
      <div className="canvas-wrap" ref={wrapRef}>
        <div className="canvas-workspace">
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

          <CanvasCellLayer
            cells={cells}
            camera={cameraRef.current}
            canvasEl={canvasRef.current}
            wrapEl={wrapRef.current}
            renderTick={renderTick}
            selectedCellId={selectedCellId}
            editingCellId={editingCellId}
            dropHintCellId={dropHintCellId}
            hoverPort={hoverPort}
            setHoverPort={setHoverPort}
            isLinkMode={isLinkMode}
            linkFromId={linkFromId}
            setLinkFromId={setLinkFromId}
            ensureEdge={ensureEdge}
            multiSelectedIds={multiSelectedIds}
            selectedExprToken={selectedExprToken}
            setSelectedExprToken={setSelectedExprToken}
            activeInlineEditor={activeInlineEditor}
            setActiveInlineEditor={setActiveInlineEditor}
            estimateCellSizeFromText={estimateCellSizeFromText}
            setCells={setCells}
            setSelectedCellId={setSelectedCellId}
            setEditingCellId={setEditingCellId}
            commitCellEditing={commitCellEditing}
            scheduleRender={scheduleRender}
            draggingEdgeRef={draggingEdgeRef}
            resizingCellRef={resizingCellRef}
            canvasRefForPointerCapture={canvasRef}
            dragStartTimerRef={dragStartTimerRef}
            draggingCellPointerDown={handleCellPointerDownForDrag}
            onResizeStart={(args: Parameters<NonNullable<React.ComponentProps<typeof CanvasCellLayer>['onResizeStart']>>[0]) => {
              // 进入 resize 状态由 FSM 接管：startCenterWorld 必须是真实 cell center(world)
              dispatchFsm({
                kind: 'CELL_RESIZE_START',
                pointerId: args.pointerId,
                cellId: args.cellId,
                startWorld: args.startWorld,
                startSize: args.startSize,
                aspect: args.aspect,
                startCenterWorld: args.startCenterWorld,
              })
            }}
          />

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

            const canvasRect = canvas.getBoundingClientRect()

            // selectionBox 是 canvas 内像素坐标；需要映射到 workspace CSS 坐标。
            // 注意：canvasRect 的 CSS 尺寸 ≈ workspace（8000x8000），wrapRect 只是视口。
            // 因此必须用 canvasRect.width/height 来做像素->CSS 的比例换算。
            const pxToCssX = canvasRect.width / canvas.width
            const pxToCssY = canvasRect.height / canvas.height

            const leftCssInWorkspace = Math.min(selectionBox.start.x, selectionBox.end.x) * pxToCssX
            const topCssInWorkspace = Math.min(selectionBox.start.y, selectionBox.end.y) * pxToCssY
            const widthCss = Math.abs(selectionBox.start.x - selectionBox.end.x) * pxToCssX
            const heightCss = Math.abs(selectionBox.start.y - selectionBox.end.y) * pxToCssY

            // overlay 是放在 canvas-workspace（position:relative）里。
            // 需要把 workspace CSS 坐标减去当前滚动量，变成“视口内的绝对定位”。
            const left = leftCssInWorkspace - wrap.scrollLeft
            const top = topCssInWorkspace - wrap.scrollTop

            return (
              <div
                className="canvas-selection-box"
                style={{
                  position: 'absolute',
                  left,
                  top,
                  width: widthCss,
                  height: heightCss,
                  background: 'rgba(0,120,255,0.12)',
                  border: '1.5px solid #1890ff',
                  pointerEvents: 'none',
                  zIndex: 10,
                }}
              />
            )
          })()}

          {renderDevHud()}
        </div>
      </div>
      <div className="small-muted">
        当前模式：文本/公式 ｜ 缩放：{cameraRef.current.zoom.toFixed(2)}x ｜ 平移：中键拖拽 / 空格+拖拽 ｜
        单元框：单击选中、拖拽移动、双击编辑 ｜
        连线：按 L 进入连线模式，点击两个单元框创建连接
      </div>
    </div>
  )
}


































































