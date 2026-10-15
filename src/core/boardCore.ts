import { evalExpression } from '../engine/engineClient'
import { processCnl as requestCnlProcess, type CnlExportKey, type CnlUnit } from '../engine/cnlEngineClient'
import { DEFAULT_ENGINE_SELECTION, loadEngineSelection, saveEngineSelection, type EngineChoice, type EngineSelectionState } from '../engine/engineSelection'
import { parseBlocksFromText } from './blocks'
import { asMiniCanvas, deriveSubBoardRef, type SubBoardRef } from './miniCanvas'
import { validateEdge } from './interactions'
import type { CellBlock, CellId, CellKind, DerivationStatus, EdgeId, EdgeKind, FrozenMark, MatheshopCell, MatheshopEdge, MatheshopHistoryEntry, MatheshopTool, Size, Vec2 } from './matheshopTypes'

export type CnlBoardResult =
  | { ok: true; units: CnlUnit[]; exports: Partial<Record<CnlExportKey, string>> }
  | { ok: false; message: string; line?: number }

export type MatheshopBoardSnapshot = {
  cells: MatheshopCell[]
  edges: MatheshopEdge[]
  selectedCellId: CellId | null
  editingCellId: CellId | null
  editingDraft: string
  tool: MatheshopTool
  color: string
  linkMode: boolean
  linkFromCellId: CellId | null
  history: MatheshopHistoryEntry[]
  engineSelection: EngineSelectionState
  statusMessage: string
  cnlSource: string
  cnlResult: CnlBoardResult | null
}

export type MatheshopBoardListener = (snapshot: MatheshopBoardSnapshot) => void

export type CreateMatheshopBoardCoreOptions = {
  initialSnapshot?: MatheshopBoardSnapshot
}

const createId = (prefix: string) => `${prefix}-${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`}`

const defaultCellSize: Size = { w: 240, h: 132 }

const cloneBlocks = (blocks: CellBlock[]): CellBlock[] => blocks.map((block) => ({ ...block }))

const cloneCell = (cell: MatheshopCell): MatheshopCell => ({
  ...cell,
  position: { ...cell.position },
  size: { ...cell.size },
  blocks: cloneBlocks(cell.blocks),
  // T3：子画布引用须深拷，避免跨快照共享同一对象。
  ...(cell.subBoard ? { subBoard: { ...cell.subBoard } } : {}),
})

const cloneSnapshot = (snapshot: MatheshopBoardSnapshot): MatheshopBoardSnapshot => ({
  ...snapshot,
  cells: snapshot.cells.map(cloneCell),
  edges: snapshot.edges.map((edge) => ({ ...edge })),
  history: snapshot.history.map((entry) => ({ ...entry })),
  engineSelection: { ...snapshot.engineSelection },
})

const createCell = (args: { seq: number; position: Vec2; color: string; content?: string; kind?: CellKind }): MatheshopCell => {
  const content = args.content ?? ''
  return {
    id: createId('cell'),
    seq: args.seq,
    position: { ...args.position },
    size: { ...defaultCellSize },
    color: args.color,
    content,
    blocks: parseBlocksFromText(content),
    ...(args.kind ? { kind: args.kind } : {}),
  }
}

export const createDefaultMatheshopBoardSnapshot = (engineSelection: EngineSelectionState): MatheshopBoardSnapshot => {
  const first = createCell({
    seq: 1,
    position: { x: 120, y: 120 },
    color: '#111111',
    content: '双击空白处创建单元框\n输入 $$a+b$$ 可渲染公式\nCtrl+Enter 使用 Python 引擎求值',
  })

  const second = createCell({
    seq: 2,
    position: { x: 440, y: 260 },
    color: '#111111',
    content: '1+2*3',
  })

  return {
    cells: [first, second],
    edges: [{ id: createId('edge'), from: first.id, to: second.id }],
    selectedCellId: first.id,
    editingCellId: null,
    editingDraft: '',
    tool: 'text',
    color: '#111111',
    linkMode: false,
    linkFromCellId: null,
    history: [],
    engineSelection: { ...engineSelection },
    statusMessage: 'Matheshop 已切换到 Vue3 + TypeScript core。',
    cnlSource: '',
    cnlResult: null,
  }
}

export class MatheshopBoardCore {
  private snapshot: MatheshopBoardSnapshot
  private readonly listeners = new Set<MatheshopBoardListener>()
  private nextSeq = 1

  constructor(options: CreateMatheshopBoardCoreOptions = {}) {
    this.snapshot = options.initialSnapshot
      ? cloneSnapshot(options.initialSnapshot)
      : createDefaultMatheshopBoardSnapshot(this.loadInitialEngineSelection())
    this.nextSeq = Math.max(0, ...this.snapshot.cells.map((cell) => cell.seq)) + 1
  }

  getSnapshot(): MatheshopBoardSnapshot {
    return cloneSnapshot(this.snapshot)
  }

  subscribe(listener: MatheshopBoardListener): () => void {
    this.listeners.add(listener)
    listener(this.getSnapshot())
    return () => this.listeners.delete(listener)
  }

  clear(): void {
    this.nextSeq = 1
    this.setSnapshot({
      ...this.snapshot,
      cells: [],
      edges: [],
      selectedCellId: null,
      editingCellId: null,
      editingDraft: '',
      linkMode: false,
      linkFromCellId: null,
      history: [this.createHistory('清空画布'), ...this.snapshot.history].slice(0, 40),
      statusMessage: '画布已清空。',
    })
  }

  setColor(color: string): void {
    this.setSnapshot({ ...this.snapshot, color })
  }

  setEngineChoice(choice: EngineChoice): void {
    const engineSelection = { choice }
    saveEngineSelection(engineSelection)
    window.dispatchEvent(new CustomEvent('matheshop:engineSelection', { detail: engineSelection }))
    this.setSnapshot({
      ...this.snapshot,
      engineSelection,
      statusMessage: `计算引擎已切换为：${choice}`,
    })
  }

  addCell(position: Vec2, content = ''): MatheshopCell {
    const cell = createCell({ seq: this.nextSeq, position, color: this.snapshot.color, content })
    this.nextSeq += 1
    this.setSnapshot({
      ...this.snapshot,
      cells: [...this.snapshot.cells, cell],
      selectedCellId: cell.id,
      editingCellId: cell.id,
      editingDraft: cell.content,
      history: [this.createHistory(`创建单元框 #${cell.seq}`), ...this.snapshot.history].slice(0, 40),
      statusMessage: `已创建单元框 #${cell.seq}。`,
    })
    return cloneCell(cell)
  }

  selectCell(cellId: CellId | null): void {
    this.setSnapshot({ ...this.snapshot, selectedCellId: cellId })
  }

  beginEditing(cellId: CellId): void {
    const cell = this.findCell(cellId)
    if (!cell) return
    this.setSnapshot({
      ...this.snapshot,
      selectedCellId: cellId,
      editingCellId: cellId,
      editingDraft: cell.content,
      statusMessage: `正在编辑单元框 #${cell.seq}。`,
    })
  }

  updateEditingDraft(draft: string): void {
    this.setSnapshot({ ...this.snapshot, editingDraft: draft })
  }

  cancelEditing(): void {
    this.setSnapshot({ ...this.snapshot, editingCellId: null, editingDraft: '', statusMessage: '已取消编辑。' })
  }

  commitEditing(): void {
    const id = this.snapshot.editingCellId
    if (!id) return
    this.updateCellContent(id, this.snapshot.editingDraft, true)
  }

  updateCellContent(cellId: CellId, content: string, closeEditor = false): void {
    const cells = this.snapshot.cells.map((cell) => {
      if (cell.id !== cellId) return cell
      return {
        ...cell,
        content,
        blocks: parseBlocksFromText(content),
      }
    })

    const cell = cells.find((item) => item.id === cellId)
    this.setSnapshot({
      ...this.snapshot,
      cells,
      editingCellId: closeEditor ? null : this.snapshot.editingCellId,
      editingDraft: closeEditor ? '' : content,
      history: [this.createHistory(`更新单元框 #${cell?.seq ?? '?'}`), ...this.snapshot.history].slice(0, 40),
      statusMessage: `已更新单元框 #${cell?.seq ?? '?'}。`,
    })
  }

  moveCell(cellId: CellId, position: Vec2): void {
    this.setSnapshot({
      ...this.snapshot,
      cells: this.snapshot.cells.map((cell) => (cell.id === cellId ? { ...cell, position: { ...position } } : cell)),
      selectedCellId: cellId,
    })
  }

  resizeCell(cellId: CellId, size: Size): void {
    this.setSnapshot({
      ...this.snapshot,
      cells: this.snapshot.cells.map((cell) => (cell.id === cellId ? { ...cell, size: { w: Math.max(120, size.w), h: Math.max(80, size.h) } } : cell)),
      selectedCellId: cellId,
    })
  }

  setCellColor(cellId: CellId, color: string): void {
    this.setSnapshot({
      ...this.snapshot,
      cells: this.snapshot.cells.map((cell) => (cell.id === cellId ? { ...cell, color } : cell)),
      selectedCellId: cellId,
    })
  }

  deleteSelected(): void {
    const id = this.snapshot.selectedCellId
    if (!id) return
    const cell = this.findCell(id)
    this.setSnapshot({
      ...this.snapshot,
      cells: this.snapshot.cells.filter((item) => item.id !== id),
      edges: this.snapshot.edges.filter((edge) => edge.from !== id && edge.to !== id),
      selectedCellId: null,
      editingCellId: this.snapshot.editingCellId === id ? null : this.snapshot.editingCellId,
      editingDraft: this.snapshot.editingCellId === id ? '' : this.snapshot.editingDraft,
      history: [this.createHistory(`删除单元框 #${cell?.seq ?? '?'}`), ...this.snapshot.history].slice(0, 40),
      statusMessage: `已删除单元框 #${cell?.seq ?? '?'}。`,
    })
  }

  toggleLinkMode(): void {
    const next = !this.snapshot.linkMode
    this.setSnapshot({
      ...this.snapshot,
      linkMode: next,
      linkFromCellId: null,
      statusMessage: next ? '连线模式：依次点击两个单元框。' : '已退出连线模式。',
    })
  }

  handleCellLinkClick(cellId: CellId): void {
    if (!this.snapshot.linkMode) {
      this.selectCell(cellId)
      return
    }

    if (!this.snapshot.linkFromCellId) {
      this.setSnapshot({ ...this.snapshot, linkFromCellId: cellId, selectedCellId: cellId, statusMessage: '已选择连线起点，请点击终点。' })
      return
    }

    const from = this.snapshot.linkFromCellId
    if (from === cellId) {
      this.setSnapshot({ ...this.snapshot, linkFromCellId: null, statusMessage: '起点和终点相同，已重新等待起点。' })
      return
    }

    // T6 端口约束 DAG：连线须从结论端口连到前提端口，且不得成环/自环。
    const violations = validateEdge({
      edges: this.snapshot.edges.map((edge) => ({ from: edge.from, to: edge.to })),
      from,
      to: cellId,
    })
    if (violations.length > 0) {
      this.setSnapshot({
        ...this.snapshot,
        linkFromCellId: null,
        statusMessage: `连线被拒：${violations[0].message}`,
      })
      return
    }

    const exists = this.snapshot.edges.some((edge) => (edge.from === from && edge.to === cellId) || (edge.from === cellId && edge.to === from))
    const nextEdges = exists ? this.snapshot.edges : [...this.snapshot.edges, { id: createId('edge'), from, to: cellId }]
    this.setSnapshot({
      ...this.snapshot,
      edges: nextEdges,
      linkFromCellId: null,
      selectedCellId: cellId,
      history: exists ? this.snapshot.history : [this.createHistory('创建连线'), ...this.snapshot.history].slice(0, 40),
      statusMessage: exists ? '连线已存在。' : '已创建连线。',
    })
  }

  /** 设置状态栏消息（供视图层反馈交互结果，如端口约束拒绝、子图封装报告）。 */
  setStatusMessage(message: string): void {
    this.setSnapshot({ ...this.snapshot, statusMessage: message })
  }

  setCellKind(cellId: CellId, kind?: CellKind): void {
    const cells = this.snapshot.cells.map((cell) => (cell.id === cellId ? { ...cell, ...(kind ? { kind } : { kind: undefined }) } : cell))
    this.setSnapshot({
      ...this.snapshot,
      cells,
      history: [this.createHistory(`设置类型：${kind ?? '（无）'}`), ...this.snapshot.history].slice(0, 40),
      statusMessage: kind ? `单元类型已设为 ${kind}。` : '单元类型已清除。',
    })
  }

  setEdgeKind(edgeId: EdgeId, kind?: EdgeKind, label?: string): void {
    const edges = this.snapshot.edges.map((edge) =>
      edge.id === edgeId ? { ...edge, ...(kind ? { kind } : {}), ...(label !== undefined ? { label } : {}) } : edge,
    )
    this.setSnapshot({
      ...this.snapshot,
      edges,
      history: [this.createHistory(`设置关系：${kind ?? '（无类型）'}${label ? ` · ${label}` : ''}`), ...this.snapshot.history].slice(0, 40),
      statusMessage: kind ? `关系类型已设为 ${kind}。` : '关系类型已清除。',
    })
  }

  setCellDensity(cellId: CellId, density: number): void {
    const clamped = Math.min(1, Math.max(0, density))
    const cells = this.snapshot.cells.map((cell) => (cell.id === cellId ? { ...cell, density: clamped } : cell))
    this.setSnapshot({ ...this.snapshot, cells, statusMessage: `粒度已设为 ${clamped.toFixed(2)}。` })
  }

  /**
   * T3 创建便签 cell（内嵌子画布）。
   *
   * **不**在此创建子画布本身（那由 whiteboardFiles 负责）；本方法只落引用，
   * 保证 boardCore 的扁平快照结构不被递归化。
   *
   * @param position 世界坐标位置。
   * @param subBoardId 子画布对应的白板记录 id。
   * @param parent 父层便签引用（主画布传 null）。
   * @returns 新建的便签 cell。
   */
  addMiniCanvasCell(position: Vec2, subBoardId: string, parent: SubBoardRef | null = null): MatheshopCell {
    const cell = createCell({ seq: this.nextSeq, position, color: this.snapshot.color, content: '', kind: 'MiniCanvas' })
    this.nextSeq += 1
    const withRef: MatheshopCell = { ...cell, subBoard: deriveSubBoardRef(subBoardId, parent) } as MatheshopCell
    this.setSnapshot({
      ...this.snapshot,
      cells: [...this.snapshot.cells, withRef],
      selectedCellId: withRef.id,
      history: [this.createHistory('创建便签（内嵌子画布）'), ...this.snapshot.history].slice(0, 40),
      statusMessage: '已创建便签。',
    })
    return withRef
  }

  /**
   * T3 切换便签视图态（缩略 ↔ 展开）；属视图层，不入对象层。
   *
   * @param cellId 便签 cell id。
   * @param view 目标视图态。
   */
  setMiniCanvasView(cellId: CellId, view: SubBoardRef['view']): void {
    const cells = this.snapshot.cells.map((cell) => {
      const ref = asMiniCanvas(cell)
      return ref && cell.id === cellId ? ({ ...cell, subBoard: { ...ref, view } } as MatheshopCell) : cell
    })
    this.setSnapshot({ ...this.snapshot, cells, statusMessage: view === 'expanded' ? '便签已展开。' : '便签已收起。' })
  }

  async evaluateSelected(): Promise<void> {
    const id = this.snapshot.editingCellId ?? this.snapshot.selectedCellId
    if (!id) {
      this.setSnapshot({ ...this.snapshot, statusMessage: '请先选中一个单元框再求值。' })
      return
    }

    const cell = this.findCell(id)
    if (!cell) return
    const source = this.pickLastExpressionLine(this.snapshot.editingCellId === id ? this.snapshot.editingDraft : cell.content)
    if (!source) {
      this.setSnapshot({ ...this.snapshot, statusMessage: '没有可求值的表达式。' })
      return
    }

    this.setSnapshot({ ...this.snapshot, statusMessage: `正在使用 ${this.snapshot.engineSelection.choice} 求值...` })
    const response = await evalExpression({ text: source, engine: this.snapshot.engineSelection })
    if (response.ok) {
      const nextContent = `${cell.content}\n= ${response.result.value}`
      this.updateCellContent(id, nextContent, true)
      this.setSnapshot({ ...this.snapshot, statusMessage: `求值完成：${response.result.value}` })
      return
    }

    this.setSnapshot({ ...this.snapshot, statusMessage: `求值失败：${response.error.message}` })
  }

  setCellStatus(cellId: CellId, status: DerivationStatus): void {
    this.setSnapshot({
      ...this.snapshot,
      cells: this.snapshot.cells.map((cell) => (cell.id === cellId ? { ...cell, status } : cell)),
    })
  }

  /** D4 冻结：给单元内某个 LaTeX block 打冻结标记并分配占位符 id（视图层，不入对象层 IR）。 */
  freezeSubexpression(cellId: CellId, blockId: string, reason?: string): void {
    const placeholderId = `ph-${cellId}-${blockId}`
    const cells = this.snapshot.cells.map((cell) => {
      if (cell.id !== cellId) return cell
      const blocks = cell.blocks.map((block) =>
        block.type === 'latex' && block.id === blockId ? { ...block, frozen: true, placeholderId } : block,
      )
      const frozen: FrozenMark = { placeholderId, reason }
      return { ...cell, blocks, frozen }
    })
    this.setSnapshot({
      ...this.snapshot,
      cells,
      history: [this.createHistory('冻结子表达式'), ...this.snapshot.history].slice(0, 40),
      statusMessage: `已冻结子式（占位符 ${placeholderId}），下发计算时屏蔽内部结构。`,
    })
  }

  /** 撤销冻结：清除 block 的冻结标记与占位符 id。 */
  unfreezeSubexpression(cellId: CellId, blockId: string): void {
    const cells = this.snapshot.cells.map((cell) => {
      if (cell.id !== cellId) return cell
      const blocks = cell.blocks.map((block) =>
        block.type === 'latex' && block.id === blockId ? { ...block, frozen: false, placeholderId: undefined } : block,
      )
      const stillFrozen = blocks.some((block) => block.type === 'latex' && block.frozen)
      return { ...cell, blocks, frozen: stillFrozen ? cell.frozen : undefined }
    })
    this.setSnapshot({ ...this.snapshot, cells, statusMessage: '已解除子式冻结。' })
  }

  setCnlSource(source: string): void {
    this.setSnapshot({ ...this.snapshot, cnlSource: source })
  }

  /**
   * 受控自然语言符号化：调后端 /process，把候选结果作为 conjecture 单元插入画布。
   * 前端不做文法校验/符号化；候选恒为猜想，经校验/冻结后才升级为可信。
   */
  async processCnl(): Promise<void> {
    const source = this.snapshot.cnlSource.trim()
    if (!source) {
      this.setSnapshot({ ...this.snapshot, statusMessage: '请先输入受控自然语言文本。', cnlResult: null })
      return
    }
    this.setSnapshot({ ...this.snapshot, statusMessage: '正在解析受控自然语言（后端猜想模块）...' })
    const response = await requestCnlProcess({ source })
    if (!response.ok) {
      this.setSnapshot({
        ...this.snapshot,
        cnlResult: { ok: false, message: response.error.message, line: response.error.line },
        statusMessage: `解析失败：${response.error.message}${response.error.line ? `（第 ${response.error.line} 行）` : ''}`,
      })
      return
    }

    const cell = createCell({
      seq: this.nextSeq,
      position: { x: 160, y: 160 + this.snapshot.cells.length * 40 },
      color: '#7a5af8',
      content: source,
    })
    this.nextSeq += 1
    const conjectureCell: MatheshopCell = { ...cell, status: 'conjecture' }
    this.setSnapshot({
      ...this.snapshot,
      cells: [...this.snapshot.cells, conjectureCell],
      selectedCellId: conjectureCell.id,
      cnlResult: { ok: true, units: response.units, exports: response.exports },
      history: [this.createHistory(`CNL 候选 #${cell.seq}`), ...this.snapshot.history].slice(0, 40),
      statusMessage: `已生成候选（conjecture）单元 #${cell.seq}；须经校验/冻结后方可采信。`,
    })
  }

  private setSnapshot(next: MatheshopBoardSnapshot): void {
    this.snapshot = cloneSnapshot(next)
    this.emit()
  }

  private emit(): void {
    const next = this.getSnapshot()
    for (const listener of this.listeners) {
      listener(next)
    }
  }

  private findCell(cellId: CellId): MatheshopCell | undefined {
    return this.snapshot.cells.find((cell) => cell.id === cellId)
  }

  private createHistory(label: string): MatheshopHistoryEntry {
    return { id: createId('history'), label, createdAt: new Date().toISOString() }
  }

  private pickLastExpressionLine(content: string): string | undefined {
    const lines = content.split('\n')
    for (let index = lines.length - 1; index >= 0; index -= 1) {
      const line = lines[index]?.trim()
      if (line && !line.startsWith('=')) return line
    }
    return undefined
  }

  private loadInitialEngineSelection(): EngineSelectionState {
    if (typeof window === 'undefined') return DEFAULT_ENGINE_SELECTION
    return loadEngineSelection()
  }
}

export const createMatheshopBoardCore = (options: CreateMatheshopBoardCoreOptions = {}) => new MatheshopBoardCore(options)