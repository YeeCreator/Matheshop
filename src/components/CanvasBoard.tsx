import { useCallback, useEffect, useRef, useState } from 'react'
import katex from 'katex'
import type { CanvasEdge, CellId, CellNode, PortSide } from './cellTypes'
import EdgeLayer from './canvas/EdgeLayer'
import FormulaLayer from './canvas/FormulaLayer'
import ExprTokenView from './canvas/ExprTokenView'
import InlineExprEditor from './canvas/InlineExprEditor'
import { parseArithExpr } from '../symbolic/arithParser'
import { evalWithPythonEngine } from '../symbolic/pythonEngineClient'
import { ensureEdgeUnique, getPortWorld as getPortWorldDomain, pickNearestPort as pickNearestPortDomain } from './canvas/domain/edges'
import {
  addChildToParent,
  collectCellWorldHits,
  findCellById,
  pickDropParentId,
  recomputeWorldAll,
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

  // --- Cell（单元框）骨架 ---
  const [cells, setCells] = useState<CellNode[]>([])
  const [selectedCellId, setSelectedCellId] = useState<string | null>(null)
  const [editingCellId, setEditingCellId] = useState<string | null>(null)
  const [dropHintCellId, setDropHintCellId] = useState<string | null>(null)

  const draggingCellRef = useRef<
    | null
    | {
        id: string
        pointerId: number
        startWorld: { x: number; y: number }
        startPos: { x: number; y: number }
        /** 拖拽对象的 parentWorld（用于把 world 位移换算到 local 位移） */
        parentWorld: { x: number; y: number }
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
  }, [onHistoryPush, removeCellById, scheduleRender, selectedCellId, selectedEdgeId, multiSelectedIds])

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
      if (ev.key === 'l' || ev.key === 'L') {
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
  }, [])

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return

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

    // 左键点击插入：创建一个根 Cell（worldPos/localPos 同值），便于你看到 Notebook 风格骨架
    if (tool === 'text' && e.button === 0) {
      const screen = getCanvasScreenPoint(canvas, e.clientX, e.clientY)
      const world = screenToWorld(screen, cameraRef.current)
      const id = crypto.randomUUID()
      const content = '(* 在这里输入表达式或多行内容 *)\n1+1\n\n$$\\frac{a}{b}$$'

      setCells((prev) => {
        // 现在的策略：
        // - x 取点击位置（更像白板）
        // - y：优先取点击位置；但如果你希望 notebook 一定纵向流式追加，改成使用 getNextRootNotebookY(prev)
        const y = world.y

        const next: CellNode = {
          id,
          parentId: null,
          localPos: { x: world.x, y },
          worldPos: { x: world.x, y },
          size: { w: 420, h: 180 },
          kind: 'cell',
          blocks: parseBlocksFromText(content),
          content,
          children: [],
        }

        // 如果点击位置和已有根节点重叠严重，或者希望始终 notebook 追加，可启用下面逻辑：
        // const y = getNextRootNotebookY(prev)
        // next.localPos.y = y
        // next.worldPos.y = y

        return [...prev, next]
      })

      setSelectedCellId(id)
      setEditingCellId(id)
      onHistoryPush({ id: crypto.randomUUID(), label: '新建单元框', at: Date.now() }, 'user')
      scheduleRender()
      return
    }

    // 框选：空白处左键按下且无 modifier
    if (e.button === 0 && !isSpaceDown && !isLinkMode && !draggingFormulaRef.current && !draggingCellRef.current) {
      const screen = getCanvasScreenPoint(canvas, e.clientX, e.clientY)
      const world = screenToWorld(screen, cameraRef.current)
      selectionStartRef.current = world
      setSelectionBox({ start: world, end: world })
      isBoxSelectingRef.current = true
      return
    }
  }

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return

    // 框选中
    if (isBoxSelectingRef.current && selectionStartRef.current) {
      e.preventDefault()
      const screen = getCanvasScreenPoint(canvas, e.clientX, e.clientY)
      const world = screenToWorld(screen, cameraRef.current)
      setSelectionBox((prev) => prev ? { ...prev, end: world } : null)
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

    // 拖拽单元框：更新 localPos，并给出 drop hint
    if (draggingCellRef.current && draggingCellRef.current.pointerId === e.pointerId) {
      e.preventDefault()
      const screen = getCanvasScreenPoint(canvas, e.clientX, e.clientY)
      const world = screenToWorld(screen, cameraRef.current)
      const d = draggingCellRef.current

      const dxWorld = world.x - d.startWorld.x
      const dyWorld = world.y - d.startWorld.y

      setCells((prev) => {
        const next = updateCellById(prev, d.id, (c) => ({
          ...c,
          localPos: { x: d.startPos.x + dxWorld, y: d.startPos.y + dyWorld },
        }))

        // drop hint（不影响数据结构）
        // Shift：强制回根
        const hintId = e.shiftKey ? null : pickDropParentId({ cellsList: next, draggedId: d.id, pointerWorld: world })
        setDropHintCellId(hintId)

        return next
      })

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
      const box = getBoxRect(selectionBox.start, selectionBox.end)
      // 遍历所有节点，判断是否与 box 相交
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

    // 结束拖拽单元框：如果有 drop hint，则执行重嵌套
    if (draggingCellRef.current && draggingCellRef.current.pointerId === e.pointerId) {
      const d = draggingCellRef.current

      try {
        canvas.releasePointerCapture(e.pointerId)
      } catch {
        // ignore
      }

      const screen = getCanvasScreenPoint(canvas, e.clientX, e.clientY)
      const pointerWorld = screenToWorld(screen, cameraRef.current)

      setCells((prev) => {
        const dropParentId = e.shiftKey ? null : pickDropParentId({ cellsList: prev, draggedId: d.id, pointerWorld })

        // 先拿到 dragged 节点当前 worldNow（用于计算新的 localPos）
        const hits = collectCellWorldHits(prev)
        const draggedHit = hits.find((h) => h.id === d.id)
        if (!draggedHit) return prev

        const oldParentId = draggedHit.parentId

        // 如果目标父节点没变化，不做 tree 变更（只算移动）
        if (dropParentId === oldParentId) return prev

        // 目标 parentWorld：根为 (0,0)，否则从 hits 找到 parent 的 world
        const parentWorld = dropParentId ? hits.find((h) => h.id === dropParentId)?.world ?? { x: 0, y: 0 } : { x: 0, y: 0 }

        // 从树中移除 dragged
        const r = removeCellById(prev, d.id)
        if (!r.removed) return prev

        const movedNode: CellNode = {
          ...r.removed,
          parentId: dropParentId,
          // 保持当前 world 坐标不变，换算成新 parent 的 local
          localPos: { x: draggedHit.world.x - parentWorld.x, y: draggedHit.world.y - parentWorld.y },
        }

        let nextTree = r.next
        if (dropParentId == null) {
          nextTree = [...nextTree, movedNode]
        } else {
          nextTree = addChildToParent(nextTree, dropParentId, movedNode)
        }

        // 嵌套关系变化 => 重算 worldPos 缓存
        return recomputeWorldAll(nextTree)
      })

      draggingCellRef.current = null
      setDropHintCellId(null)
      onHistoryPush({ id: crypto.randomUUID(), label: e.shiftKey ? '移到根层' : '重新嵌套单元框', at: Date.now() }, 'user')
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

  const renderLinkModeHint = () => {
    if (!isLinkMode) return null

    return <div className="canvas-drop-hud">连线模式：依次点击两个单元框创建连接（Esc 退出 / L 切换）</div>
  }

  // （连线逻辑：由 cell 节点自身的 onPointerDown 处理；画布空白处点击在 handlePointerDown 中处理）

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

                    // 左键拖拽：记录拖拽起点 world 与起始 localPos
                    if (ev.button !== 0) return

                    canvasEl.setPointerCapture(ev.pointerId)
                    const screen = getCanvasScreenPoint(canvasEl, ev.clientX, ev.clientY)
                    const world = screenToWorld(screen, cameraRef.current)

                    // setSelectedCellId(c.id)
                    if (multiSelectedIds.length > 1 && multiSelectedIds.includes(c.id)) {
                      // 多选拖动
                      canvasEl.setPointerCapture(ev.pointerId)
                      const screen = getCanvasScreenPoint(canvasEl, ev.clientX, ev.clientY)
                      const world = screenToWorld(screen, cameraRef.current)
                      draggingCellRef.current = {
                        id: c.id,
                        pointerId: ev.pointerId,
                        startWorld: world,
                        startPos: { x: c.localPos.x, y: c.localPos.y },
                        parentWorld,
                      }
                      return
                    }

                    draggingCellRef.current = {
                      id: c.id,
                      pointerId: ev.pointerId,
                      startWorld: world,
                      startPos: { x: c.localPos.x, y: c.localPos.y },
                      parentWorld,
                    }
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

                  <div className="cell-header">
                    <span className="cell-title">{title}</span>
                    <span className="cell-depth">#{depth}</span>

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

                    <button
                      type="button"
                      className="cell-add"
                      onClick={(ev) => {
                        ev.preventDefault()
                        ev.stopPropagation()

                        const parentId = c.id
                        const childId = crypto.randomUUID()

                        const childContent = '(* 子单元框 *)\n2+2'
                        // 子 cell 用 localPos（相对父内容区），这里先给一个默认偏移
                        const childLocal = { x: 18 + depth * 6, y: 46 + depth * 6 }
                        const child: CellNode = {
                          id: childId,
                          parentId,
                          localPos: childLocal,
                          worldPos: { x: 0, y: 0 },
                          size: { w: 380, h: 150 },
                          kind: 'cell',
                          blocks: parseBlocksFromText(childContent),
                          content: childContent,
                          children: [],
                        }

                        setCells((prev) => {
                          const next = updateCellById(prev, parentId, (p) => ({ ...p, children: [...p.children, child] }))
                          return recomputeWorldAll(next)
                        })

                        setSelectedCellId(childId)
                        setEditingCellId(childId)
                        onHistoryPush({ id: crypto.randomUUID(), label: '添加子单元框', at: Date.now() }, 'user')
                        scheduleRender()
                      }}
                      title="添加子单元框"
                    >
                      +
                    </button>
                  </div>

                  <div className="cell-body">
                    {isEditing ? (
                      <textarea
                        className="cell-editor"
                        value={c.content}
                        onChange={(ev) => {
                          const v = ev.target.value
                          setCells((prev) =>
                            updateCellById(prev, c.id, (next) => ({
                              ...next,
                              content: v,
                            })),
                          )
                        }}
                        onKeyDown={(ev) => {
                          if (ev.key === 'Escape') {
                            ev.preventDefault()
                            setEditingCellId(null)
                          }
                          if (ev.key === 'Enter' && (ev.ctrlKey || ev.metaKey)) {
                            ev.preventDefault()
                            setEditingCellId(null)

                            // 先把内容解析成 blocks（维持原行为）
                            setCells((prev) =>
                              updateCellById(prev, c.id, (next) => ({
                                ...next,
                                blocks: parseBlocksFromText(next.content),
                              })),
                            )

                            // 再尝试调用 Python 引擎做“算术求值”（第一阶段）
                            ;(async () => {
                              const resp = await evalWithPythonEngine({ text: c.content })
                              setCells((prev) =>
                                updateCellById(prev, c.id, (next) => {
                                  const base = next.blocks && next.blocks.length > 0 ? next.blocks : parseBlocksFromText(next.content)
                                  const line = resp.ok ? `= ${resp.result.value}` : `⚠ ${resp.error.message}`
                                  return {
                                    ...next,
                                    blocks: [...base, { id: crypto.randomUUID(), type: 'text', text: line }],
                                  }
                                }),
                              )
                            })()

                            onHistoryPush({ id: crypto.randomUUID(), label: '编辑单元框', at: Date.now() }, 'user')
                          }
                        }}
                      />
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

        {selectionBox && (
          <div
            className="canvas-selection-box"
            style={{
              position: 'absolute',
              left: Math.min(selectionBox.start.x, selectionBox.end.x),
              top: Math.min(selectionBox.start.y, selectionBox.end.y),
              width: Math.abs(selectionBox.start.x - selectionBox.end.x),
              height: Math.abs(selectionBox.start.y - selectionBox.end.y),
              background: 'rgba(0,120,255,0.12)',
              border: '1.5px solid #1890ff',
              pointerEvents: 'none',
              zIndex: 10,
            }}
          />
        )}
      </div>
      <div className="small-muted">
        当前模式：文本/公式 ｜ 缩放：{cameraRef.current.zoom.toFixed(2)}x ｜ 平移：中键拖拽 / 空格+拖拽 ｜
        单元框：单击选中、拖拽移动、双击编辑 ｜ 拖拽嵌套：拖到目标单元框上松开 ｜ Shift+拖拽：强制移到根层 ｜
        连线：按 L 进入连线模式，点击两个单元框创建连接
      </div>
    </div>
  )
}

