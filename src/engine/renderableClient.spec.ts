import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchRenderableStructure } from './renderableClient'

/** 契约3 后端成功响应夹具（字段与 ME `RenderableStructure` 对齐）。 */
const OK_PAYLOAD = {
  success: true,
  summary: { type: 'graph', shape: 'network', size: [3] },
  relations: [
    { i: 0, j: 1, weight: 1.0 },
    { i: 1, j: 2, weight: 2.0, label: '强影响' },
  ],
  nodes: [
    { id: 0, x: 0.1, y: 0.2 },
    { id: 1, x: 0.3, y: 0.4 },
    { id: 2, x: 0.5, y: 0.6 },
  ],
}

const mockFetchOnce = (payload: unknown, init: { ok?: boolean; status?: number } = {}) => {
  const spy = vi.fn().mockResolvedValue({
    ok: init.ok ?? true,
    status: init.status ?? 200,
    json: async () => payload,
  })
  vi.stubGlobal('fetch', spy)
  return spy
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('renderableClient · 契约3 可渲染数据消费', () => {
  it('成功响应解析为 summary / relations / nodes', async () => {
    mockFetchOnce(OK_PAYLOAD)

    const result = await fetchRenderableStructure({ numPoints: 3, seed: 7 })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.structure.summary).toEqual({ type: 'graph', shape: 'network', size: [3] })
    expect(result.structure.relations).toHaveLength(2)
    expect(result.structure.relations[0]).toEqual({ i: 0, j: 1, weight: 1.0 })
    expect(result.structure.nodes).toHaveLength(3)
  })

  it('请求体使用后端契约的 snake_case 字段名', async () => {
    const spy = mockFetchOnce(OK_PAYLOAD)

    await fetchRenderableStructure({ numPoints: 9, kind: 'matrix', direction: 'directed', seed: 1 })

    const body = JSON.parse(String(spy.mock.calls[0][1]?.body))
    expect(body).toMatchObject({
      num_points: 9,
      kind: 'matrix',
      direction: 'directed',
      seed: 1,
      network: 'Voronoi',
      radius: 1.0,
    })
  })

  it('缺省参数按契约3 默认值填充', async () => {
    const spy = mockFetchOnce(OK_PAYLOAD)

    await fetchRenderableStructure()

    const body = JSON.parse(String(spy.mock.calls[0][1]?.body))
    expect(body).toMatchObject({ num_points: 12, kind: 'graph', algorithm: null, weights: null, labels: null, seed: null })
  })

  it('HTTP 非 2xx 返回 http_error', async () => {
    mockFetchOnce({}, { ok: false, status: 502 })

    const result = await fetchRenderableStructure()

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('http_error')
    expect(result.error.message).toContain('502')
  })

  it('后端 success:false 时透传结构化错误', async () => {
    mockFetchOnce({ success: false, error: { code: 'renderable_error', message: 'distribution nope is not supported.' } })

    const result = await fetchRenderableStructure({ distribution: 'nope' })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('renderable_error')
    expect(result.error.message).toContain('distribution nope')
  })

  it('网络不可达返回 network_error（供宿主回退 mock）', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Failed to fetch')))

    const result = await fetchRenderableStructure()

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('network_error')
    expect(result.error.message).toContain('Failed to fetch')
  })

  it('响应缺字段时给出安全兜底，不抛异常', async () => {
    mockFetchOnce({ success: true })

    const result = await fetchRenderableStructure()

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.structure.summary.shape).toBe('generic')
    expect(result.structure.relations).toEqual([])
    expect(result.structure.nodes).toEqual([])
  })
})
