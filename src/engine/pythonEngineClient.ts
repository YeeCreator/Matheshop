export type PythonEngineEvalOk = {
  ok: true
  result: { kind: 'number'; value: number }
  meta?: { elapsedMs?: number }
}

export type PythonEngineEvalErr = {
  ok: false
  error: { code: string; message: string }
  meta?: { elapsedMs?: number }
}

export type PythonEngineEvalResponse = PythonEngineEvalOk | PythonEngineEvalErr

function getEngineBaseUrl(): string {
  // Vite: import.meta.env
  const v = (import.meta as unknown as { env?: Record<string, string | undefined> }).env
  const base = v?.VITE_ENGINE_BASE_URL
  return base?.trim() ? base.trim().replace(/\/+$/, '') : ''
}

export async function evalWithPythonEngine(args: { text: string }): Promise<PythonEngineEvalResponse> {
  const base = getEngineBaseUrl()
  const url = base ? `${base}/v1/eval` : '/api/engine/v1/eval'

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ text: args.text }),
  })

  if (!res.ok) {
    return { ok: false, error: { code: 'http_error', message: `HTTP ${res.status}` } }
  }

  return (await res.json()) as PythonEngineEvalResponse
}
