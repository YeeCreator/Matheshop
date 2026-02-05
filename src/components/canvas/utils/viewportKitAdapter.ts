import type { Camera as LegacyCamera } from './geometry'
import type { Camera2D, Vec2 } from 'viewport-kit'

/**
 * viewport-kit 适配层
 *
 * 目的：在不一次性大改所有渲染层/命中测试代码的前提下，先把 CanvasBoard 的视口交互迁移到 viewport-kit。
 *
 * 约定：
 * - matheshop 旧相机（LegacyCamera）：x/y/zoom，其中 x/y 是“视口左上角的 world 坐标”。
 * - viewport-kit 相机（Camera2D）：pan/scale，其中 pan 是“屏幕像素平移”，scale 是 world→screen 的缩放。
 * - 为避免一次性改动大量代码，短期仍让下游层继续消费 LegacyCamera。
 *   CanvasBoard 内部以 Camera2D 为权威，再派生出 LegacyCamera。
 */

export type ViewportKitBridge = {
  /** 当前容器下的相机（屏幕像素 pan + world→screen scale） */
  camera2d: Camera2D
  /** 供旧逻辑使用的相机（world 左上 + zoom） */
  legacyCamera: LegacyCamera
  /** 把容器本地 CSS 像素坐标转换为 canvas 像素坐标（考虑 DPR 与尺寸比） */
  localCssPxToCanvasPx: (ptLocal: Vec2) => Vec2 | null
  /** 把 canvas 像素坐标转换为容器本地 CSS 像素坐标 */
  canvasPxToLocalCssPx: (ptCanvas: Vec2) => Vec2 | null
}

export function camera2DToLegacy(camera2d: Camera2D, opts: { dprScale: number }): LegacyCamera {
  // camera2d 的 pan 基于“容器本地 CSS 像素”，legacy 的 screen 基于 “canvas 像素”。
  // 所以 scale 也要按同样倍率放大到 canvas 像素域。
  const zoom = camera2d.scale * opts.dprScale
  const x = -camera2d.pan.x / camera2d.scale
  const y = -camera2d.pan.y / camera2d.scale
  return { x, y, zoom }
}

export function legacyToCamera2D(cam: LegacyCamera, opts: { dprScale: number }): Camera2D {
  const scale = cam.zoom / opts.dprScale
  return {
    scale,
    pan: { x: -cam.x * scale, y: -cam.y * scale },
  }
}

/**
 * 计算容器 CSS 像素 → canvas 像素的缩放比。
 *
 * 注意：canvas.width/height 是像素缓冲区尺寸（通常 = css 尺寸 * dpr）。
 */
export function getDprScaleFromCanvas(canvasEl: HTMLCanvasElement): number {
  const rect = canvasEl.getBoundingClientRect()
  if (rect.width <= 0 || rect.height <= 0) return window.devicePixelRatio || 1
  const sx = canvasEl.width / rect.width
  const sy = canvasEl.height / rect.height
  // 理论上 sx≈sy，这里取均值以降低极端情况下的漂移。
  return (sx + sy) / 2
}

export function localCssPxToCanvasPx(opts: {
  canvasEl: HTMLCanvasElement
  ptLocal: Vec2
}): Vec2 | null {
  const { canvasEl, ptLocal } = opts
  const rect = canvasEl.getBoundingClientRect()
  if (rect.width <= 0 || rect.height <= 0) return null
  return {
    x: (ptLocal.x / rect.width) * canvasEl.width,
    y: (ptLocal.y / rect.height) * canvasEl.height,
  }
}

export function canvasPxToLocalCssPx(opts: {
  canvasEl: HTMLCanvasElement
  ptCanvas: Vec2
}): Vec2 | null {
  const { canvasEl, ptCanvas } = opts
  const rect = canvasEl.getBoundingClientRect()
  if (canvasEl.width <= 0 || canvasEl.height <= 0) return null
  return {
    x: (ptCanvas.x / canvasEl.width) * rect.width,
    y: (ptCanvas.y / canvasEl.height) * rect.height,
  }
}
