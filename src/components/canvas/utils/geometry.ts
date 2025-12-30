export type Camera = {
  x: number
  y: number
  zoom: number
}

export function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n))
}

export function resizeCanvasToDisplaySize(canvas: HTMLCanvasElement) {
  const rect = canvas.getBoundingClientRect()
  const dpr = window.devicePixelRatio || 1
  const nextWidth = Math.max(1, Math.floor(rect.width * dpr))
  const nextHeight = Math.max(1, Math.floor(rect.height * dpr))
  if (canvas.width !== nextWidth || canvas.height !== nextHeight) {
    canvas.width = nextWidth
    canvas.height = nextHeight
    return true
  }
  return false
}

export function worldToScreen(world: { x: number; y: number }, cam: Camera) {
  return { x: (world.x - cam.x) * cam.zoom, y: (world.y - cam.y) * cam.zoom }
}

export function screenToWorld(screen: { x: number; y: number }, cam: Camera) {
  return { x: screen.x / cam.zoom + cam.x, y: screen.y / cam.zoom + cam.y }
}

export function getCanvasScreenPoint(canvas: HTMLCanvasElement, clientX: number, clientY: number) {
  const rect = canvas.getBoundingClientRect()
  const xCss = clientX - rect.left
  const yCss = clientY - rect.top
  const sx = (xCss / rect.width) * canvas.width
  const sy = (yCss / rect.height) * canvas.height
  return { x: sx, y: sy }
}

