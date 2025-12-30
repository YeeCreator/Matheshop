import { describe, expect, it } from 'vitest'
import { evalWithNativeEngine } from './nativeEngine'

describe('nativeEngine', () => {
  it('evaluates basic arithmetic', () => {
    const r = evalWithNativeEngine({ text: '2+2' })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.result.value).toBe(4)
  })

  it('respects precedence', () => {
    const r = evalWithNativeEngine({ text: '2+3*4' })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.result.value).toBe(14)
  })

  it('handles parentheses', () => {
    const r = evalWithNativeEngine({ text: '(2+3)*4' })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.result.value).toBe(20)
  })

  it('is right-associative for exponent', () => {
    const r = evalWithNativeEngine({ text: '2^3^2' })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.result.value).toBe(512)
  })

  it('supports unary minus', () => {
    const r = evalWithNativeEngine({ text: '-(1+2)' })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.result.value).toBe(-3)
  })

  it('returns parse_error for empty input', () => {
    const r = evalWithNativeEngine({ text: '   ' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.code).toBe('parse_error')
  })

  it('returns division_by_zero', () => {
    const r = evalWithNativeEngine({ text: '1/0' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.code).toBe('division_by_zero')
  })
})

