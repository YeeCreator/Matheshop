import { evalWithPythonEngine, type PythonEngineEvalResponse } from './pythonEngineClient'
import type { EngineChoice } from './engineSelection'

export type EngineEvalOk = {
  ok: true
  result: { kind: 'number'; value: number }
  meta?: { engine: EngineChoice; elapsedMs?: number }
}

export type EngineEvalErr = {
  ok: false
  error: { code: string; message: string }
  meta?: { engine: EngineChoice; elapsedMs?: number }
}

export type EngineEvalResponse = EngineEvalOk | EngineEvalErr

export async function evalExpression(args: {
  text: string
  engine: { choice: EngineChoice }
}): Promise<EngineEvalResponse> {
  const { text, engine } = args

  if (engine.choice === 'builtin_python') {
    const r: PythonEngineEvalResponse = await evalWithPythonEngine({ text })
    return r.ok
      ? { ok: true, result: r.result, meta: { engine: 'builtin_python', elapsedMs: r.meta?.elapsedMs } }
      : { ok: false, error: r.error, meta: { engine: 'builtin_python', elapsedMs: r.meta?.elapsedMs } }
  }

  if (engine.choice === 'external') {
    // 占位：暂不实现外接引擎（不发起请求、不需要后端）
    return {
      ok: false,
      error: { code: 'not_implemented', message: '外接计算引擎：暂未实现（仅 UI 占位）' },
      meta: { engine: 'external' },
    }
  }

  // builtin_native：先占位（后续会接 TS 引擎 / 本地求值）
  return {
    ok: false,
    error: { code: 'not_implemented', message: '内置原生计算引擎：暂未接入（待实现 TS 引擎）' },
    meta: { engine: 'builtin_native' },
  }
}
