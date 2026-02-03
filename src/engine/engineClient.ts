import { evalWithPythonEngine, type PythonEngineEvalResponse } from './pythonEngineClient'
import type { EngineChoice } from './engineSelection'
import { evalWithNativeEngine } from '../../engine/engine_ts/src/index'
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

  if (engine.choice === 'builtin_native') {
    return evalWithNativeEngine({ text })
  }

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

  // should be unreachable
  return { ok: false, error: { code: 'bad_engine_choice', message: '未知引擎选项' } }
}
