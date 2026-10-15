/**
 * 契约3 可渲染数据客户端（C3 链路：MathEngine → matheshop）。
 *
 * 调用 MathEngine 后端 service 的 `/renderable`：后端把「抽样点集 → 图网络」
 * 组装为可渲染结构（形态摘要 + 关系数据 + 节点坐标），前端**只消费**，
 * 不解析数学、不产渲染指令。
 *
 * 后端契约见 `MathEngine/mathengine/service/app.py` 与
 * `documents/DEV_GUIDE.md` §7.1；跨仓契约文本见 UHW 主任务 §3.1 契约3。
 */

import type { RelationDatum } from '../core/relationData'

/** 契约3 形态摘要（低密度档渲染概念象形图标用；只取类别形态，不含数值）。 */
export type RenderableSummary = {
  /** 结构类别：graph / matrix / hypergraph / tensor / pointset / generic。 */
  type: string
  /** 前端概念图标形态键（与 ConceptShape 对齐）。 */
  shape: string
  /** 各维规模。 */
  size: number[]
}

/** 契约3 节点（坐标由后端给出，布局仍归视图层）。 */
export type RenderableNode = { id: number; x: number; y: number }

/** 契约3 可渲染结构（`POST /renderable` 成功响应的主体）。 */
export type RenderableStructure = {
  summary: RenderableSummary
  relations: RelationDatum[]
  nodes: RenderableNode[]
}

/** `/renderable` 请求参数（与后端 `RenderableRequest` 逐字段对齐）。 */
export type RenderableRequest = {
  numPoints?: number
  kind?: string
  distribution?: string
  algorithm?: string | null
  network?: string
  direction?: 'undirected' | 'directed'
  radius?: number
  weights?: number[] | null
  labels?: Array<string | null> | null
  seed?: number | null
}

export type RenderableOk = { ok: true; structure: RenderableStructure }
export type RenderableErr = { ok: false; error: { code: string; message: string } }
export type RenderableResponse = RenderableOk | RenderableErr

function getEngineBaseUrl(): string {
  const v = (import.meta as unknown as { env?: Record<string, string | undefined> }).env
  const base = v?.VITE_MATHENGINE_BASE_URL
  return base?.trim() ? base.trim().replace(/\/+$/, '') : ''
}

type RawPayload = {
  success: boolean
  summary?: RenderableSummary
  relations?: RelationDatum[]
  nodes?: RenderableNode[]
  error?: { code: string; message: string }
}

/**
 * 取一份契约3 可渲染结构。
 *
 * @param request 请求参数（缺省 `numPoints=12`、`kind='graph'`）。
 * @returns 成功时 `{ ok: true, structure }`；失败时结构化错误（含网络不可达）。
 *
 * @example
 * const res = await fetchRenderableStructure({ numPoints: 12, seed: 5 })
 * if (res.ok) renderRelations(res.structure.relations)
 */
export async function fetchRenderableStructure(request: RenderableRequest = {}): Promise<RenderableResponse> {
  const base = getEngineBaseUrl()
  const url = base ? `${base}/renderable` : '/api/mathengine/renderable'

  const body = {
    num_points: request.numPoints ?? 12,
    kind: request.kind ?? 'graph',
    distribution: request.distribution ?? 'Posssion Disk',
    algorithm: request.algorithm ?? null,
    network: request.network ?? 'Voronoi',
    direction: request.direction ?? 'undirected',
    radius: request.radius ?? 1.0,
    weights: request.weights ?? null,
    labels: request.labels ?? null,
    seed: request.seed ?? null,
  }

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      return { ok: false, error: { code: 'http_error', message: `HTTP ${res.status}` } }
    }
    const data = (await res.json()) as RawPayload
    if (!data.success) {
      return { ok: false, error: data.error ?? { code: 'renderable_error', message: '可渲染数据请求失败' } }
    }
    return {
      ok: true,
      structure: {
        summary: data.summary ?? { type: 'generic', shape: 'generic', size: [] },
        relations: data.relations ?? [],
        nodes: data.nodes ?? [],
      },
    }
  } catch (err) {
    return { ok: false, error: { code: 'network_error', message: err instanceof Error ? err.message : String(err) } }
  }
}
