/**
 * 契约4 · 全局符号表（前端侧登记与查询）。
 *
 * 唯一 id + 别名 + 作用域；**解析与规范化在 ME**，本模块只承载宿主侧的登记与查询，
 * 以及「公式内变量 → 符号 id」的锚点推导（供 @main-ui/view-formula 消费）。
 */

import type { CellId, CellKind, EdgeKind } from './matheshopTypes'
import type { FormulaVarAnchor } from '@main-ui/view-formula'

/** 契约4 符号条目。 */
export type SymbolEntry = {
  /** 唯一 id（跨白板稳定）。 */
  id: string
  /** 主名（公式中出现的标识）。 */
  name: string
  /** 别名：多教材记号 → 同一概念条目。 */
  aliases: string[]
  /** 作用域：`global` 或局部作用域标识（如某便签/某证明分支）。 */
  scope: string
  /** 可选概念简述（悬停卡片）。 */
  description?: string
}

/** 符号表快照（宿主订阅用）。 */
export type SymbolTableSnapshot = {
  entries: SymbolEntry[]
}

/**
 * 全局符号表（内存态；持久化并入白板存档）。
 *
 * 变更即通知订阅者，供公式视图重算锚点与侧栏刷新。
 */
export class SymbolTable {
  private entries: SymbolEntry[] = []
  private readonly listeners = new Set<(snapshot: SymbolTableSnapshot) => void>()

  getSnapshot(): SymbolTableSnapshot {
    return { entries: this.entries.map((entry) => ({ ...entry, aliases: [...entry.aliases] })) }
  }

  subscribe(listener: (snapshot: SymbolTableSnapshot) => void): () => void {
    this.listeners.add(listener)
    listener(this.getSnapshot())
    return () => this.listeners.delete(listener)
  }

  /** 按 id 查条目。 */
  find(id: string): SymbolEntry | undefined {
    return this.entries.find((entry) => entry.id === id)
  }

  /** 按主名或别名查条目（公式变量解析用）。 */
  findByName(name: string, scope = 'global'): SymbolEntry | undefined {
    return this.entries.find(
      (entry) => (entry.scope === scope || entry.scope === 'global') && (entry.name === name || entry.aliases.includes(name)),
    )
  }

  /** 新增或更新条目（按 id 去重）。 */
  upsert(entry: SymbolEntry): void {
    const index = this.entries.findIndex((item) => item.id === entry.id)
    if (index >= 0) this.entries[index] = { ...entry, aliases: [...entry.aliases] }
    else this.entries = [...this.entries, { ...entry, aliases: [...entry.aliases] }]
    this.emit()
  }

  /** 移除条目。 */
  remove(id: string): void {
    const next = this.entries.filter((entry) => entry.id !== id)
    if (next.length === this.entries.length) return
    this.entries = next
    this.emit()
  }

  /** 覆盖整表（白板载入时用）。 */
  replaceAll(entries: SymbolEntry[]): void {
    this.entries = entries.map((entry) => ({ ...entry, aliases: [...entry.aliases] }))
    this.emit()
  }

  private emit(): void {
    const snapshot = this.getSnapshot()
    for (const listener of this.listeners) listener(snapshot)
  }
}

/** 全局单例（每个白板可各自 replaceAll）。 */
export const matheshopSymbols = new SymbolTable()

/**
 * 由 LaTeX 与符号表推导锚点声明（契约4）。
 *
 * 对公式中出现的每个 ASCII 字母变量，按主名/别名查符号表；命中则产出锚点。
 *
 * @param latex LaTeX 源。
 * @param table 符号表。
 * @returns 供 `FormulaView` 消费的锚点数组。
 *
 * @example
 * deriveAnchors('A_{ij}=x', matheshopSymbols) // -> [{ name:'A', symbolId:'...' }, ...]
 */
export function deriveAnchors(latex: string, table: SymbolTable): FormulaVarAnchor[] {
  const names = new Set<string>()
  for (const char of latex) {
    if (/[A-Za-z]/.test(char)) names.add(char)
  }
  const anchors: FormulaVarAnchor[] = []
  for (const name of names) {
    const entry = table.findByName(name)
    if (!entry) continue
    anchors.push({ name, symbolId: entry.id, hint: entry.description })
  }
  return anchors
}

/** 复用契约1 的类型导出，便于符号表条目与知识单元类型关联。 */
export type SymbolScopeMeta = { kind?: CellKind; edgeKind?: EdgeKind; cellId?: CellId }
