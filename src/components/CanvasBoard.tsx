/**
 * CanvasBoard
 *
 * 画布主组件（状态汇聚层）：
 * - 管理 camera（world<->screen）与可滚动 workspace（wrap）之间的坐标换算；
 * - 管理三类可视对象与其交互：cells（文本块/组）、edges（连线）、formulas（KaTeX 公式）；
 * - 统一处理全局输入（wheel 缩放/平移、Esc 取消、L 连线模式、双击新建 cell 等）；
 * - 画布交互（框选/拖拽/缩放/视口操作/连线拖拽）由本组件内的本地交互状态（refs/state）直接管理。
 *
 * 坐标约定：
 * - client（浏览器坐标）→ workspace CSS（考虑 wrap.scroll）→ canvas screen(px，考虑 DPR) → world（逻辑坐标）。
 * - cells/edges/formulas 的布局基于 world 坐标；DOM 绝对定位使用 workspace 内 CSS 像素。
 */
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
  updateCellById,
} from './canvas/domain/cellTree'
import {
  clamp,
  resizeCanvasToDisplaySize,
} from './canvas/utils/geometry'
// 新增：viewport-2d-kit 相机交互（作为唯一的 camera 状态来源）
import {
  useViewportCamera,
  applyCameraToCanvas2D,
  getVisibleWorldBox,
  type LegacyCamera,
  camera2DToLegacy,
  getDprScaleFromCanvas,
  legacyToCamera2D,
  clientToLocalCssPoint,
  localCssToWorld,
} from 'viewport-2d-kit'
import { parseBlocksFromText } from './canvas/utils/blocks'

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

interface Stroke {
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

  // 旧 camera 仍保留（下游 layer 目前依赖它），但其值将由 viewport-2d-kit camera2d 派生。
  const cameraRef = useRef<LegacyCamera>({ x: 0, y: 0, zoom: 1 })

  // 记录最近一次鼠标位置（容器本地 CSS 像素），用于某些设备上 ctrl+wheel 的锚点推断。
  const lastCursorLocalRef = useRef<{ x: number; y: number } | null>(null)

  // viewport-2d-kit camera（权威相机）
  const viewport = useViewportCamera({
    containerRef: wrapRef,
    // matheshop 没有固定世界边界，fit 行为只用于初始化 scale；这里给一个足够大的 viewBox。
    viewBox: { x: -5000, y: -5000, width: 10000, height: 10000 },
    paddingPx: 0,
    minScaleFactor: 0.08,
    maxScaleFactor: 64,
    wheelZoomSpeed: 0.0028,
    wheelPanSpeed: 1.0,
    getCursorLocal: () => lastCursorLocalRef.current,
    interactionMode: {
      // 与现有交互一致：
      // - 普通 wheel：平移
      // - ctrl/meta + wheel：缩放（锚点在光标处）
      // - 拖拽平移：仍由原有中键/空格逻辑负责（避免和 cell 左键拖拽冲突）
      dragPan: true,
      // 仅在中键拖拽或“空格按住 + 左键拖拽”时允许视口平移。
      // 这样不会抢占 cell 的普通左键拖拽/框选。
      dragPanCondition: (e: unknown) => {
        // buttons 位：4=中键按下（pointer move 时也适用）
        // 注意：这里的 e 是 viewport-2d-kit 抽象事件，Matheshop 会在转换时带上 buttons。
        const anyE = e as unknown as { buttons?: number; button?: number }
        const isMiddleByButtons = typeof anyE.buttons === 'number' ? (anyE.buttons & 4) === 4 : false
        const isLeft = typeof anyE.button === 'number' ? anyE.button === 0 : true
        return isMiddleByButtons || (isSpaceDown && isLeft)
      },
      wheelPan: true,
      ctrlWheelZoom: true,
      pinchZoom: true,
      wheelZoomAnchor: 'cursor',
    },
  })

  const { camera: camera2d, setCamera: setCamera2d, handlers: viewportHandlers } = viewport

  // 相机同步：camera2d -> legacy cameraRef（供旧逻辑使用）
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const dprScale = getDprScaleFromCanvas(canvas)
    cameraRef.current = camera2DToLegacy(camera2d, { dprScale })
    // 注意：这里不直接 scheduleRender，因为 setCamera2d 已经会触发组件重渲染；
    // 但 CanvasBoard 渲染主循环是手动调度，所以仍需要触发。
    scheduleRender()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [camera2d.pan.x, camera2d.pan.y, camera2d.scale])

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
  // dropHint 仍会传给 CanvasCellLayer 使用，但不再需要 setter
  const [dropHintCellId] = useState<string | null>(null)

  const nextCellSeqRef = useRef<number>(1)

  const dragStartTimerRef = useRef<number | null>(null)

  // --- 交互状态（refs/state）---
  // viewportPanRef：旧的 legacy 平移逻辑已迁移到 viewport-2d-kit（见 viewportHandlers + dragPanCondition）。
  // 为避免回归，这里保留类型占位但不再使用。
  // const viewportPanRef = useRef<null | {
  // pointerId: number
  // startScreen: { x: number; y: number }
  // startCam: { x: number; y: number; zoom: number }
  // }>(null)

  const cellDragRef = useRef<null | {
  pointerId: number
  cellId: string
  startWorld: { x: number; y: number }
  startScreen: { x: number; y: number }
  startPos: { x: number; y: number }
  heldReady: boolean
  movedReady: boolean
  isDragging: boolean
  }>(null)

  const resizeRef = useRef<null | {
  pointerId: number
  cellId: string
  startSize: { w: number; h: number }
  aspect: number
  startCenterWorld: { x: number; y: number }
  startCornerWorld: { x: number; y: number }
  startPointerOffsetFromCornerWorld: { x: number; y: number }
  }>(null)

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
    const wrap = wrapRef.current
    if (!canvas || !wrap) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // Clear in screen space.
    ctx.save()
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.fillStyle = backgroundRef.current
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.restore()

    /**
     * 网格属于世界空间（world space）的一部分：
     * - 它不是贴在屏幕/镜头上的 UI；
     * - 它应与 cell/edge/formula 使用同一套 world 坐标系；
     * - 相机移动时，网格应与世界内容一起发生变换（看起来“反方向滑动”）。
     *
     * 因此这里做的是：
     * 1) 将 ctx 先映射到“workspace 的 CSS px”域（处理 HiDPI）；
     * 2) 再应用 viewport-2d-kit 的 camera2d 变换（world -> screen(CSS px)）。
     */

    // canvas.width/height 是像素缓冲区，canvasRect 是 workspace 的 CSS 尺寸。
    // 我们先把绘制空间缩放回 CSS px，避免 DPR 导致网格变换倍率错误。
    const dprScale = getDprScaleFromCanvas(canvas)
    ctx.save()
    ctx.scale(dprScale, dprScale)

    // 可选网格（world 空间中每 100 单位一格）
    const gridSize = 100
    const gridPx = gridSize * camera2d.scale
    if (gridPx >= 20) {
      // 将相机变换应用到 ctx（在 CSS px 域）
      applyCameraToCanvas2D(ctx, camera2d)
      ctx.lineWidth = 1 / camera2d.scale
      ctx.strokeStyle = 'rgba(0,0,0,0.06)'

      // 重要：网格绘制只需要覆盖“当前可视口”，因此这里应使用 wrap 的可视尺寸。
      // 之前误用 canvas/workspace 尺寸会让网格锚定范围与实际视口脱节，空白画布时容易出现
      // “相机在动但网格看起来不动”的错觉。
      const wrapRect = wrap.getBoundingClientRect()
      const view = getVisibleWorldBox(camera2d, { width: wrapRect.width, height: wrapRect.height })

      const startX = Math.floor(view.x / gridSize) * gridSize
      const endX = Math.ceil((view.x + view.width) / gridSize) * gridSize
      const startY = Math.floor(view.y / gridSize) * gridSize
      const endY = Math.ceil((view.y + view.height) / gridSize) * gridSize

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
    }

    ctx.restore()

    bumpRenderTick()
  }, [bumpRenderTick, camera2d])

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
  const isBoxSelectingRef = useRef(false)

  // 基于可滚动容器（canvas-wrap）计算“画布像素坐标”。
  // 注意：这套 client->workspaceCSS->canvasPx 的旧链路已迁移到 viewport-2d-kit 语义（screen=wrap 本地 CSS px）。
  // 旧实现 getScreenFromWrap 已删除，避免后续继续误用。

  // 新的坐标入口：client -> 屏幕空间（wrap 容器本地 CSS px）
  const getLocalCssFromClient = useCallback((clientX: number, clientY: number) => {
    const wrap = wrapRef.current
    if (!wrap) return null
    return clientToLocalCssPoint(wrap, clientX, clientY)
  }, [])

  // 框选：screen 坐标转 world 矩形
  const screenBoxToWorldBox = useCallback(
    (a: { x: number; y: number }, b: { x: number; y: number }) => {
      const x1 = Math.min(a.x, b.x)
      const y1 = Math.min(a.y, b.y)
      const x2 = Math.max(a.x, b.x)
      const y2 = Math.max(a.y, b.y)

      const w1 = localCssToWorld(camera2d, { x: x1, y: y1 })
      const w2 = localCssToWorld(camera2d, { x: x2, y: y2 })

      return {
        x: Math.min(w1.x, w2.x),
        y: Math.min(w1.y, w2.y),
        w: Math.abs(w2.x - w1.x),
        h: Math.abs(w2.y - w1.y),
      }
    },
    [camera2d],
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

  // --- 交互状态（refs/state）---
  // handleCellPointerDownForDrag：改为写入本地 cellDragRef，并使用 timer 完成 holdReady
  const handleCellPointerDownForDrag = useCallback(
    (args: {
      ev: React.PointerEvent
      cell: CellNode
      parentWorld: { x: number; y: number }
      screen: { x: number; y: number }
      world: { x: number; y: number }
    }) => {
      const { ev, cell: c, screen, world } = args

      if (dragStartTimerRef.current != null) {
        window.clearTimeout(dragStartTimerRef.current)
        dragStartTimerRef.current = null
      }

      cellDragRef.current = {
        pointerId: ev.pointerId,
        cellId: c.id,
        startWorld: world,
        startScreen: screen,
        startPos: { x: c.localPos.x, y: c.localPos.y },
        heldReady: false,
        movedReady: false,
        isDragging: false,
      }

      dragStartTimerRef.current = window.setTimeout(() => {
        dragStartTimerRef.current = null
        if (cellDragRef.current && cellDragRef.current.pointerId === ev.pointerId) {
          cellDragRef.current.heldReady = true
        }
      }, 150)
    },
    [],
    )

  // handlePointerDown：本地处理
  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return

    // 记录光标位置（用于 ctrl+wheel 锚点）
    lastCursorLocalRef.current = getLocalFromWrap(e.clientX, e.clientY)

    if (editingCellId && e.button === 0) {
      commitCellEditing(editingCellId)
    }

    if (draggingFormulaRef.current) {
      e.preventDefault()
      return
    }

    e.preventDefault()

    // 连线模式：点击空白处取消起点
    if (isLinkMode && e.button === 0) {
      setSelectedFormulaId(null)
      setSelectedCellId(null)
      setLinkFromId(null)
      return
    }

    const isMiddle = e.button === 1
    const isMiddleByButtons = (e.buttons & 4) === 4

    // 中键 或 空格+左键：视口平移（交给 viewport-2d-kit）
    if (isMiddle || isMiddleByButtons || (isSpaceDown && e.button === 0)) {
      viewportHandlers.onPointerDown({
        pointerId: e.pointerId,
        clientX: e.clientX,
        clientY: e.clientY,
        preventDefault: () => e.preventDefault(),
        currentTarget: e.currentTarget,
        // 额外字段：给 dragPanCondition 识别
        buttons: e.buttons,
        button: e.button,
      } as unknown as Parameters<typeof viewportHandlers.onPointerDown>[0])
      scheduleRender()
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
      const screen = getLocalCssFromClient(e.clientX, e.clientY)
      if (!screen) return
      isBoxSelectingRef.current = true
      setSelectionBox({ start: screen, end: screen })

      try {
        canvas.setPointerCapture(e.pointerId)
      } catch {
        // ignore
      }
      return
    }
    }

  const handleDoubleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return

    // 双击创建节点：避免在连线/平移/拖拽/框选等状态下误触
    // handleDoubleClick：不依赖任何外部状态机，按当前 refs/state 判定是否允许创建
    if (isLinkMode) return
    if (isSpaceDown) return
    if (draggingFormulaRef.current) return
    if (cellDragRef.current || resizeRef.current) return
    if (isBoxSelectingRef.current) return

    // 只响应左键双击
    if ((e as unknown as MouseEvent).button !== 0) return

    const screen = getLocalCssFromClient(e.clientX, e.clientY)
    if (!screen) return
    const world = localCssToWorld(camera2d, screen)

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
    lastCursorLocalRef.current = getLocalFromWrap(e.clientX, e.clientY)

    const canvas = canvasRef.current
    if (!canvas) return

    // 如果当前是 viewport-2d-kit 的拖拽平移状态，让它优先处理并返回。
    // 说明：viewport-2d-kit 内部通过 pointer capture + pointers map 维持状态。
    const isMiddleByButtons = (e.buttons & 4) === 4
    if (isMiddleByButtons || (isSpaceDown && (e.buttons & 1) === 1)) {
      viewportHandlers.onPointerMove({
        pointerId: e.pointerId,
        clientX: e.clientX,
        clientY: e.clientY,
        preventDefault: () => e.preventDefault(),
        currentTarget: e.currentTarget,
        buttons: e.buttons,
        button: e.button,
      } as unknown as Parameters<typeof viewportHandlers.onPointerMove>[0])
      scheduleRender()
      return
    }

    // 节点缩放：本地 resizeRef
    if (resizeRef.current && resizeRef.current.pointerId === e.pointerId) {
      e.preventDefault()
      const screen = getLocalCssFromClient(e.clientX, e.clientY)
      if (!screen) return
      const world = localCssToWorld(camera2d, screen)

      const r = resizeRef.current

      // 修正 pointer 起步 offset，避免跳变
      const pointerAtCorner = {
        x: world.x - r.startPointerOffsetFromCornerWorld.x,
        y: world.y - r.startPointerOffsetFromCornerWorld.y,
      }

      // 以中心为锚点：corner 偏移决定 half-size
      const halfW = Math.max(12, Math.abs(pointerAtCorner.x - r.startCenterWorld.x))
      const nextW = halfW * 2
      let nextH = Math.max(12, Math.abs(pointerAtCorner.y - r.startCenterWorld.y)) * 2

      if (e.shiftKey) {
        // Shift：锁定宽高比（以宽为基准）
        nextH = Math.max(12, halfW / r.aspect) * 2
      }

      const nextSize = { w: nextW, h: nextH }
      const nextLocalPos = { x: r.startCenterWorld.x - nextW / 2, y: r.startCenterWorld.y - nextH / 2 }

      setCells((prev) =>
        recomputeWorldAll(
          updateCellById(prev, r.cellId, (c) => ({
            ...c,
            size: nextSize,
            localPos: { x: nextLocalPos.x, y: nextLocalPos.y },
          })),
        ),
      )

      scheduleRender()
      return
    }

    // 框选中：更新 selectionBox
    if (isBoxSelectingRef.current && selectionBox) {
      e.preventDefault()
      const screen = getLocalCssFromClient(e.clientX, e.clientY)
      if (!screen) return
      setSelectionBox({ start: selectionBox.start, end: screen })
      scheduleRender()
      return
    }

    // 拖拽连线：保持 draggingEdgeRef 流程（无状态机同步）
    if (draggingEdgeRef.current && draggingEdgeRef.current.pointerId === e.pointerId) {
      e.preventDefault()
      const screen = getLocalCssFromClient(e.clientX, e.clientY)
      if (!screen) return
      const world = localCssToWorld(camera2d, screen)
      draggingEdgeRef.current.pointerWorld = world

      const hover = pickNearestPort(world)
      if (hover) {
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

    // 拖拽单元框：本地 cellDragRef
    if (cellDragRef.current && cellDragRef.current.pointerId === e.pointerId) {
      e.preventDefault()
      const screen = getLocalCssFromClient(e.clientX, e.clientY)
      if (!screen) return
      const world = localCssToWorld(camera2d, screen)
      const d = cellDragRef.current
      const dx = screen.x - d.startScreen.x
      const dy = screen.y - d.startScreen.y
      const dist = Math.hypot(dx, dy)

      if (!d.isDragging) {
        d.movedReady = d.movedReady || dist >= 4
        const shouldStart = d.movedReady && d.heldReady
        if (!shouldStart) return

        d.isDragging = true
        try {
          canvas.setPointerCapture(e.pointerId)
        } catch {
          // ignore
        }
      }

      const ddx = world.x - d.startWorld.x
      const ddy = world.y - d.startWorld.y

      setCells((prev) =>
        recomputeWorldAll(
          updateCellById(prev, d.cellId, (c) => ({
            ...c,
            localPos: { x: d.startPos.x + ddx, y: d.startPos.y + ddy },
          })),
        ),
      )
      scheduleRender()
      return
    }

    // 拖拽公式：保持原逻辑
    if (draggingFormulaRef.current && draggingFormulaRef.current.pointerId === e.pointerId) {
      e.preventDefault()
      const screen = getLocalCssFromClient(e.clientX, e.clientY)
      if (!screen) return
      const world = localCssToWorld(camera2d, screen)
      const d = draggingFormulaRef.current
      const dx = world.x - d.startWorld.x
      const dy = world.y - d.startWorld.y

      setFormulas((prev) =>
        prev.map((f) => (f.id === d.id ? { ...f, x: d.startFormula.x + dx, y: d.startFormula.y + dy } : f)),
      )
      scheduleRender()
      return
    }

    // 视口平移：本地 viewportPanRef
    // 已迁移到 viewport-2d-kit（见上面的 viewportHandlers.onPointerMove），此分支不再需要。
    // if (viewportPanRef.current && viewportPanRef.current.pointerId === e.pointerId) { ... }

    // ...existing code...
  }

  const handlePointerUpOrCancel = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return
    e.preventDefault()

    // 先尝试交给 viewport-2d-kit 结束（如果该 pointerId 属于它的 capture）
    viewportHandlers.onPointerUp({
      pointerId: e.pointerId,
      clientX: e.clientX,
      clientY: e.clientY,
      preventDefault: () => e.preventDefault(),
      currentTarget: e.currentTarget,
      buttons: (e as unknown as { buttons?: number }).buttons ?? 0,
      button: e.button,
    } as unknown as Parameters<typeof viewportHandlers.onPointerUp>[0])

    // 框选结束
    if (isBoxSelectingRef.current && selectionBox) {
      isBoxSelectingRef.current = false

      try {
        canvas.releasePointerCapture(e.pointerId)
      } catch {
        // ignore
      }

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
      scheduleRender()
      return
    }

    // 结束缩放节点
    if (resizeRef.current && resizeRef.current.pointerId === e.pointerId) {
      try {
        canvas.releasePointerCapture(e.pointerId)
      } catch {
        // ignore
      }
      resizeRef.current = null
      scheduleRender()
      return
    }

    // 结束拖拽连线：直接创建连接与写历史
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

    // 结束拖拽单元框
    if (cellDragRef.current && cellDragRef.current.pointerId === e.pointerId) {
      if (dragStartTimerRef.current != null) {
        window.clearTimeout(dragStartTimerRef.current)
        dragStartTimerRef.current = null
      }

      try {
        canvas.releasePointerCapture(e.pointerId)
      } catch {
        // ignore
      }

      cellDragRef.current = null
      scheduleRender()
      return
    }

    // 结束拖拽公式：保持原逻辑
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

    // 结束视口平移
    // 已迁移到 viewport-2d-kit（见上面的 viewportHandlers.onPointerUp），此分支不再需要。
    // if (viewportPanRef.current && viewportPanRef.current.pointerId === e.pointerId) { ... }

    // ...existing code...
  }

  // 新增：把 client 坐标转换为容器本地 CSS 像素（用于 viewport-2d-kit）
  const getLocalFromWrap = useCallback(
    (clientX: number, clientY: number) => {
      const wrap = wrapRef.current
      if (!wrap) return null
      const rect = wrap.getBoundingClientRect()
      return { x: clientX - rect.left, y: clientY - rect.top }
    },
    [],
  )

  // wheel：改为交给 viewport-2d-kit 处理；同时保持 shift+wheel 横向平移的旧体验。
  useEffect(() => {
    const wrap = wrapRef.current
    if (!wrap) return

    const onWheel = (ev: WheelEvent) => {
      // 总是拦截，避免浏览器页面缩放/回弹等默认行为。
      ev.preventDefault()

      const local = getLocalFromWrap(ev.clientX, ev.clientY)
      if (local) lastCursorLocalRef.current = local

      const isZoomGesture = ev.ctrlKey || ev.metaKey
      if (ev.shiftKey && !isZoomGesture) {
        // 与旧逻辑一致：shift+wheel 主要用于横向平移。
        // viewport-2d-kit 的 wheelPan 是按 deltaX/deltaY 平移，这里把 deltaY 映射到 deltaX。
        const canvas = canvasRef.current
        if (canvas) {
          const dprScale = getDprScaleFromCanvas(canvas)
          const legacy = cameraRef.current
          const nextLegacy: LegacyCamera = { ...legacy, x: legacy.x + ev.deltaY / legacy.zoom }
          setCamera2d(legacyToCamera2D(nextLegacy, { dprScale }))
        }
        return
      }

      viewportHandlers.onWheel({
        ctrlKey: ev.ctrlKey,
        deltaX: ev.deltaX,
        deltaY: ev.deltaY,
        clientX: ev.clientX,
        clientY: ev.clientY,
        preventDefault: () => ev.preventDefault(),
      })
      scheduleRender()
    }

    wrap.addEventListener('wheel', onWheel, { passive: false })
    return () => wrap.removeEventListener('wheel', onWheel)
  }, [getLocalFromWrap, setCamera2d, viewportHandlers, scheduleRender])

  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    // 由 wrap 的原生 wheel 监听器统一处理（解决 passive/浏览器缩放问题）
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
            camera={camera2d}
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
            camera={camera2d}
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
            // CanvasCellLayer.onResizeStart：写入本地 resizeRef 并 capture pointer
            onResizeStart={(args: Parameters<NonNullable<React.ComponentProps<typeof CanvasCellLayer>['onResizeStart']>>[0]) => {
              const canvas = canvasRef.current
              if (!canvas) return

              const startCornerWorld = {
                x: args.startCenterWorld.x + args.startSize.w / 2,
                y: args.startCenterWorld.y + args.startSize.h / 2,
              }
              const startPointerOffsetFromCornerWorld = {
                x: args.startWorld.x - startCornerWorld.x,
                y: args.startWorld.y - startCornerWorld.y,
              }

              resizeRef.current = {
                pointerId: args.pointerId,
                cellId: args.cellId,
                startSize: args.startSize,
                aspect: args.aspect,
                startCenterWorld: args.startCenterWorld,
                startCornerWorld,
                startPointerOffsetFromCornerWorld,
              }

              try {
                canvas.setPointerCapture(args.pointerId)
              } catch {
                // ignore
              }
            }}
          />

          <FormulaLayer
            formulas={formulas}
            selectedFormulaId={selectedFormulaId}
            camera={camera2d}
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
            const wrap = wrapRef.current
            if (!wrap) return null

            const left = Math.min(selectionBox.start.x, selectionBox.end.x)
            const top = Math.min(selectionBox.start.y, selectionBox.end.y)
            const width = Math.abs(selectionBox.start.x - selectionBox.end.x)
            const height = Math.abs(selectionBox.start.y - selectionBox.end.y)

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


































































