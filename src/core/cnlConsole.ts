/**
 * 受控自然语言（CNL）符号化控制台 —— 框架无关 core 单例。
 *
 * 承载 CNL 编辑器的业务状态（源码、忙碌态、候选结果），Vue 只订阅快照与调用
 * action（对齐 `boardCore` 的 subscribe/snapshot 模式）。前端纪律：文法解析与
 * 符号化永远在后端（MathEngine `nl` 猜想模块），本单例只转发文本、承载候选结果；
 * 候选恒为 conjecture，未经校验/冻结不得当作可信 IR。
 */

import { processCnl, type CnlExportKey, type CnlProcessResponse, type CnlUnit } from '../engine/cnlEngineClient'

export type CnlConsoleResult =
  | { ok: true; isConjecture: boolean; units: CnlUnit[]; exports: Partial<Record<CnlExportKey, string>> }
  | { ok: false; message: string; line?: number }

export type CnlConsoleSnapshot = {
  source: string
  busy: boolean
  result: CnlConsoleResult | null
}

type CnlConsoleListener = (snapshot: CnlConsoleSnapshot) => void

const DEFAULT_SOURCE = `定义。正数是实数，当且仅当 $x>0$。
定理。如果 $x>0$ 并且 $y>0$，那么 $x+y>0$。
证明。
假设 $x>0$ 并且 $y>0$。
那么 $x+y>0$。
证毕。`

class CnlConsole {
  private snapshot: CnlConsoleSnapshot = { source: DEFAULT_SOURCE, busy: false, result: null }
  private readonly listeners = new Set<CnlConsoleListener>()

  getSnapshot(): CnlConsoleSnapshot {
    return { ...this.snapshot, result: this.snapshot.result ? { ...this.snapshot.result } : null }
  }

  subscribe(listener: CnlConsoleListener): () => void {
    this.listeners.add(listener)
    listener(this.getSnapshot())
    return () => {
      this.listeners.delete(listener)
    }
  }

  setSource(source: string): void {
    this.setSnapshot({ ...this.snapshot, source })
  }

  clearResult(): void {
    this.setSnapshot({ ...this.snapshot, result: null })
  }

  /** 调后端 /process：前端不做文法校验/符号化，候选恒为 conjecture。 */
  async process(targets?: CnlExportKey[]): Promise<void> {
    const source = this.snapshot.source.trim()
    if (!source) {
      this.setSnapshot({ ...this.snapshot, result: { ok: false, message: '请输入受控自然语言文本。' } })
      return
    }
    this.setSnapshot({ ...this.snapshot, busy: true })
    const response: CnlProcessResponse = await processCnl({ source, targets })
    if (!response.ok) {
      this.setSnapshot({ ...this.snapshot, busy: false, result: { ok: false, message: response.error.message, line: response.error.line } })
      return
    }
    this.setSnapshot({
      ...this.snapshot,
      busy: false,
      result: { ok: true, isConjecture: response.isConjecture, units: response.units, exports: response.exports },
    })
  }

  private setSnapshot(next: CnlConsoleSnapshot): void {
    this.snapshot = next
    const snapshot = this.getSnapshot()
    for (const listener of this.listeners) {
      listener(snapshot)
    }
  }
}

export const cnlConsole = new CnlConsole()
