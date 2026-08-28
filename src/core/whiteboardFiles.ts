import { loadEngineSelection, saveEngineSelection, type EngineChoice } from '../engine/engineSelection'
import { createDefaultMatheshopBoardSnapshot, createMatheshopBoardCore, type MatheshopBoardCore, type MatheshopBoardSnapshot } from './boardCore'

const STORAGE_KEY = 'matheshop:whiteboards:v1'

type MatheshopWhiteboardFileRecord = {
  id: string
  title: string
  snapshot: MatheshopBoardSnapshot
  createdAt: string
  updatedAt: string
}

type MatheshopWhiteboardStore = {
  version: 1
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
      version: 1,
      files: Array.from(this.records.values()),
    }
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
  }

  private loadStore(): MatheshopWhiteboardStore {
    if (typeof window === 'undefined') {
      return { version: 1, files: [] }
    }
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY)
      if (!raw) {
        return { version: 1, files: [] }
      }
      const parsed = JSON.parse(raw) as Partial<MatheshopWhiteboardStore> | null
      if (!parsed || !Array.isArray(parsed.files)) {
        return { version: 1, files: [] }
      }
      return {
        version: 1,
        files: parsed.files.filter((file): file is MatheshopWhiteboardFileRecord => {
          return Boolean(file && typeof file.id === 'string' && typeof file.title === 'string' && file.snapshot)
        }),
      }
    } catch {
      return { version: 1, files: [] }
    }
  }
}

export const matheshopWhiteboardFiles = new MatheshopWhiteboardFilesStore()