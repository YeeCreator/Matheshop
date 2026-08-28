import { evalExpression } from '../engine/engineClient'
import { DEFAULT_ENGINE_SELECTION, loadEngineSelection, saveEngineSelection, type EngineChoice, type EngineSelectionState } from '../engine/engineSelection'
import { parseBlocksFromText } from './blocks'
import type { CellBlock, CellId, MatheshopCell, MatheshopEdge, MatheshopHistoryEntry, MatheshopTool, Size, Vec2 } from './matheshopTypes'

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
})

const cloneSnapshot = (snapshot: MatheshopBoardSnapshot): MatheshopBoardSnapshot => ({
  ...snapshot,
  cells: snapshot.cells.map(cloneCell),
  edges: snapshot.edges.map((edge) => ({ ...edge })),
  history: snapshot.history.map((entry) => ({ ...entry })),
  engineSelection: { ...snapshot.engineSelection },
})

const createCell = (args: { seq: number; position: Vec2; color: string; content?: string }): MatheshopCell => {
  const content = args.content ?? ''
  return {
    id: createId('cell'),
    seq: args.seq,
    position: { ...args.position },
    size: { ...defaultCellSize },
    color: args.color,
    content,
    blocks: parseBlocksFromText(content),
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