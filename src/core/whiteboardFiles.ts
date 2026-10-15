import { loadEngineSelection, saveEngineSelection, type EngineChoice } from '../engine/engineSelection'
import { createDefaultMatheshopBoardSnapshot, createMatheshopBoardCore, type MatheshopBoardCore, type MatheshopBoardSnapshot } from './boardCore'

const STORAGE_KEY = 'matheshop:whiteboards:v2'
/** v1 旧键名：仅用于**一次性迁移**，不保留双读兜底（兼容策略铁律）。 */
const STORAGE_KEY_V1 = 'matheshop:whiteboards:v1'

type MatheshopWhiteboardFileRecord = {
  id: string
  title: string
  snapshot: MatheshopBoardSnapshot
  createdAt: string
  updatedAt: string
}

type MatheshopWhiteboardStore = {
  version: 2
  files: MatheshopWhiteboardFileRecord[]
}

export type MatheshopWhiteboardFileSummary = {
  id: string
  title: string
  createdAt: string
  updatedAt: string
}

export type MatheshopWhiteboardFilesListener = (files: MatheshopWhiteboardFileSummary[]) => void

const createWhiteboardId = () => `whiteboard-${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`}`

const toSummary = (record: MatheshopWhiteboardFileRecord): MatheshopWhiteboardFileSummary => ({
  id: record.id,
  title: record.title,
  createdAt: record.createdAt,
  updatedAt: record.updatedAt,
})

export class MatheshopWhiteboardFilesStore {
  private readonly records = new Map<string, MatheshopWhiteboardFileRecord>()
  private readonly boards = new Map<string, MatheshopBoardCore>()
  private readonly listeners = new Set<MatheshopWhiteboardFilesListener>()

  constructor() {
    for (const file of this.loadStore().files) {
      this.records.set(file.id, file)
    }
  }

  subscribe(listener: MatheshopWhiteboardFilesListener): () => void {
    this.listeners.add(listener)
    listener(this.listFiles())
    return () => this.listeners.delete(listener)
  }

  ensureBootstrapFile(): MatheshopWhiteboardFileSummary {
    const first = this.listFiles()[0]
    if (first) {
      return first
    }
    return this.createFile('计算白板 1')
  }

  listFiles(): MatheshopWhiteboardFileSummary[] {
    return Array.from(this.records.values())
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
      .map(toSummary)
  }

  getFile(fileId: string): MatheshopWhiteboardFileSummary | undefined {
    const record = this.records.get(fileId)
    return record ? toSummary(record) : undefined
  }

  getSnapshot(fileId: string): MatheshopBoardSnapshot | undefined {
    return this.records.get(fileId)?.snapshot
  }

  createFile(title?: string): MatheshopWhiteboardFileSummary {
    const now = new Date().toISOString()
    const record: MatheshopWhiteboardFileRecord = {
      id: createWhiteboardId(),
      title: title?.trim() || `计算白板 ${this.records.size + 1}`,
      snapshot: createDefaultMatheshopBoardSnapshot(loadEngineSelection()),
      createdAt: now,
      updatedAt: now,
    }
    this.records.set(record.id, record)
    this.persist()
    this.emit()
    return toSummary(record)
  }

  renameFile(fileId: string, title: string): void {
    const record = this.records.get(fileId)
    const normalizedTitle = title.trim()
    if (!record || !normalizedTitle) {
      return
    }
    record.title = normalizedTitle
    record.updatedAt = new Date().toISOString()
    this.persist()
    this.emit()
  }

  getBoard(fileId: string): MatheshopBoardCore {
    const record = this.records.get(fileId)
    if (!record) {
      throw new Error(`Whiteboard file not found: ${fileId}`)
    }

    const existing = this.boards.get(fileId)
    if (existing) {
      return existing
    }

    const board = createMatheshopBoardCore({ initialSnapshot: record.snapshot })
    let isInitialEmit = true
    board.subscribe((snapshot) => {
      if (isInitialEmit) {
        isInitialEmit = false
        return
      }
      const nextRecord = this.records.get(fileId)
      if (!nextRecord) {
        return
      }
      nextRecord.snapshot = snapshot
      nextRecord.updatedAt = new Date().toISOString()
      this.persist()
      this.emit()
    })
    this.boards.set(fileId, board)
    return board
  }

  applyEngineChoiceToAll(choice: EngineChoice): void {
    saveEngineSelection({ choice })
    for (const record of this.records.values()) {
      record.snapshot = {
        ...record.snapshot,
        engineSelection: { choice },
      }
      record.updatedAt = new Date().toISOString()
    }
    for (const board of this.boards.values()) {
      board.setEngineChoice(choice)
    }
    this.persist()
    this.emit()
  }

  private emit(): void {
    const files = this.listFiles()
    for (const listener of this.listeners) {
      listener(files)
    }
  }

  private persist(): void {
    if (typeof window === 'undefined') {
      return
    }
    const payload: MatheshopWhiteboardStore = {
      version: 2,
      files: Array.from(this.records.values()),
    }
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
  }

  private loadStore(): MatheshopWhiteboardStore {
    if (typeof window === 'undefined') {
      return { version: 2, files: [] }
    }
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY) ?? this.migrateFromV1()
      if (!raw) {
        return { version: 2, files: [] }
      }
      const parsed = JSON.parse(raw) as { files?: unknown } | null
      if (!parsed || !Array.isArray(parsed.files)) {
        return { version: 2, files: [] }
      }
      return {
        version: 2,
        files: (parsed.files as MatheshopWhiteboardFileRecord[]).filter((file) => {
          return Boolean(file && typeof file.id === 'string' && typeof file.title === 'string' && file.snapshot)
        }),
      }
    } catch {
      return { version: 2, files: [] }
    }
  }

  /**
   * 一次性迁移 `v1 → v2`（拍板3）：读旧键、补默认值、写新键、删旧键。
   *
   * v2 相对 v1 的新增字段均为**可选**（`cell.kind`/`cell.density`/`edge.kind`/`edge.label`），
   * 故迁移只需结构透传，无需逐单元改写；迁移后**不保留双读回退**。
   *
   * @returns 迁移后的 JSON 串；无旧数据时返回 null。
   */
  private migrateFromV1(): string | null {
    const legacy = window.localStorage.getItem(STORAGE_KEY_V1)
    if (!legacy) {
      return null
    }
    try {
      const parsed = JSON.parse(legacy) as { files?: MatheshopWhiteboardFileRecord[] } | null
      if (!parsed || !Array.isArray(parsed.files)) {
        window.localStorage.removeItem(STORAGE_KEY_V1)
        return null
      }
      const migrated: MatheshopWhiteboardStore = { version: 2, files: parsed.files }
      const text = JSON.stringify(migrated)
      window.localStorage.setItem(STORAGE_KEY, text)
      window.localStorage.removeItem(STORAGE_KEY_V1)
      return text
    } catch {
      window.localStorage.removeItem(STORAGE_KEY_V1)
      return null
    }
  }
}

export const matheshopWhiteboardFiles = new MatheshopWhiteboardFilesStore()