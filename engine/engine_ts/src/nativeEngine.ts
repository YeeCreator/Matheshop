import { parseArithExpr } from './parser/arithParser'
import type { ArithExpr } from './parser/arithAst'

export type NativeEngineResultOk = {
  ok: true
  result: { kind: 'number'; value: number }
  meta?: { engine: 'builtin_native'; elapsedMs?: number }
}

export type NativeEngineResultErr = {
  ok: false
  error: { code: string; message: string }
  meta?: { engine: 'builtin_native'; elapsedMs?: number }
}

export type NativeEngineEvalResponse = NativeEngineResultOk | NativeEngineResultErr

export type NativeEngineEvalArgs = {
  text: string
  /** 防止恶意/意外超大表达式导致卡死；默认足够大但不是无限 */
  maxNodes?: number
}

export function evalWithNativeEngine(args: NativeEngineEvalArgs): NativeEngineEvalResponse {
  const started = performance.now()

  const text = args.text
  if (!text.trim()) {
    return {
      ok: false,
      error: { code: 'parse_error', message: '空表达式' },
      meta: { engine: 'builtin_native', elapsedMs: Math.round(performance.now() - started) },
    }
  }

  let expr: ArithExpr
  try {
    expr = parseArithExpr(text).expr
  } catch (e) {
    return {
      ok: false,
      error: { code: 'parse_error', message: e instanceof Error ? e.message : '解析失败' },
      meta: { engine: 'builtin_native', elapsedMs: Math.round(performance.now() - started) },
    }
  }

  let remaining = args.maxNodes ?? 50_000

  const evalRec = (node: ArithExpr): number => {
    remaining--
    if (remaining < 0) {
      throw new Error('表达式过大，已超出内置引擎的计算上限')
    }

    switch (node.type) {
      case 'num':
        return node.value
      case 'unary': {
        const v = evalRec(node.expr)
        return -v
      }
      case 'bin': {
        const a = evalRec(node.left)
        const b = evalRec(node.right)
        switch (node.op) {
          case '+':
            return a + b
          case '-':
            return a - b
          case '*':
            return a * b
          case '/':
            if (b === 0) throw new Error('除以 0')
            return a / b
          case '^':
            return Math.pow(a, b)
        }
      }
    }
  }

  try {
    const value = evalRec(expr)
    if (!Number.isFinite(value)) {
      return {
        ok: false,
        error: { code: 'non_finite', message: '计算结果不是有限数（NaN/Infinity）' },
        meta: { engine: 'builtin_native', elapsedMs: Math.round(performance.now() - started) },
      }
    }

    return {
      ok: true,
      result: { kind: 'number', value },
      meta: { engine: 'builtin_native', elapsedMs: Math.round(performance.now() - started) },
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : '计算失败'
    const code = msg.includes('除以 0') ? 'division_by_zero' : 'eval_error'
    return {
      ok: false,
      error: { code, message: msg },
      meta: { engine: 'builtin_native', elapsedMs: Math.round(performance.now() - started) },
    }
  }
}

