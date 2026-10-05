/**
 * 受控自然语言（CNL）符号化接口客户端。
 *
 * 调用 MathEngine 后端 service 的 `/process`（见工程轨 `设计：数学引擎` §11）。
 * 前端纪律（`docs/DEVELOPER_GUIDE.md` §8）：文法解析与校验永远在后端，前端不做
 * 符号化；后端返回的候选 IR 恒为 conjecture，前端据此视觉区分猜想与已验证公式。
 */

export type CnlExportKey = 'latex' | 'sympy' | 'lean' | 'forthel' | 'prolog' | 'ace'

export type CnlUnit = { kind: string; name: string; steps: number }

export type CnlProcessOk = {
  ok: true
  isConjecture: boolean
  units: CnlUnit[]
  candidateIr: unknown[]
  exports: Partial<Record<CnlExportKey, string>>
}

export type CnlProcessErr = {
  ok: false
  error: { code: string; message: string; line?: number }
}

export type CnlProcessResponse = CnlProcessOk | CnlProcessErr

function getCnlBaseUrl(): string {
  const v = (import.meta as unknown as { env?: Record<string, string | undefined> }).env
  const base = v?.VITE_MATHENGINE_BASE_URL
  return base?.trim() ? base.trim().replace(/\/+$/, '') : ''
}

type ProcessPayload = {
  success: boolean
  isConjecture?: boolean
  units?: CnlUnit[]
  candidateIr?: unknown[]
  exports?: Partial<Record<CnlExportKey, string>>
  errors?: Array<{ line: number; message: string; text: string }>
}

export async function processCnl(args: { source: string; targets?: CnlExportKey[] }): Promise<CnlProcessResponse> {
  const base = getCnlBaseUrl()
  const url = base ? `${base}/process` : '/api/mathengine/process'

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ source: args.source, targets: args.targets ?? null }),
    })
    if (!res.ok) {
      return { ok: false, error: { code: 'http_error', message: `HTTP ${res.status}` } }
    }
    const data = (await res.json()) as ProcessPayload
    if (!data.success) {
      const first = data.errors?.[0]
      return { ok: false, error: { code: 'cnl_parse_error', message: first?.message ?? '受控自然语言解析失败', line: first?.line } }
    }
    return {
      ok: true,
      isConjecture: data.isConjecture ?? true,
      units: data.units ?? [],
      candidateIr: data.candidateIr ?? [],
      exports: data.exports ?? {},
    }
  } catch (err) {
    return { ok: false, error: { code: 'network_error', message: err instanceof Error ? err.message : String(err) } }
  }
}
