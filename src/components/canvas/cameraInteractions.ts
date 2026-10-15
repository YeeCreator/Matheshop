/**
 * MatheshopBoardStage 的相机交互补全（PRD FR-002 / FR-003 / FR-004）。
 *
 * 官方 `@main-ui/view-canvas` 的 `ViewportCanvas` 内置交互为「左键拖拽平移 + 滚轮以光标为锚点缩放」
 * （后者同时覆盖 PRD FR-001 滚轮缩放与 FR-005 拦截页面缩放）；而 matheshop PRD
 * （`docs/PRD.md` §4.1）另要求三条：
 *
 * | PRD | 手势 | 官方模板 | 本模块 |
 * | --- | --- | --- | --- |
 * | FR-002 | 中键拖拽平移 | ✗ | ✅ 补 |
 * | FR-003 | 空格+左键拖拽平移 | ✗ | ✅ 补 |
 * | FR-004 | Shift+滚轮横向平移 | ✗ | ✅ 补 |
 *
 * **补法**：事件挂在**官方画布外围的包裹元素**上、以**捕获阶段**处理 —— 捕获阶段先于目标元素上的
 * 模板监听器执行，故命中本模块负责的手势时 `stopPropagation()` 即可阻止模板内置 handler 响应；
 * 未命中的手势一律不拦截，照常冒泡给模板与宿主单元框。
 *
 * 纯函数（`isSpacePanGesture` / `isMiddleButton` / `isShiftWheel` / `horizontalPanDelta`）单独导出，便于单测。
 */

import { onBeforeUnmount, onMounted, type Ref } from 'vue'
import { panBy, type Camera2D, type Vec2 } from '@main-ui/core/rendering'

/** FR-003：空格+左键拖拽平移。 */
export function isSpacePanGesture(spaceHeld: boolean, event: { button: number }): boolean {
  return spaceHeld && event.button === 0
}

/** FR-002：中键拖拽平移。 */
export function isMiddleButton(event: { button: number }): boolean {
  return event.button === 1
}

/** FR-004：Shift+滚轮横向平移。 */
export function isShiftWheel(event: { shiftKey: boolean }): boolean {
  return event.shiftKey
}

/** 滚轮横移灵敏度（屏幕像素/滚轮单位）；1 = 视口与滚轮量 1:1。 */
export const WHEEL_PAN_SPEED = 1

/**
 * Shift+滚轮产生的**屏幕**位移。
 *
 * 注意：`@main-ui/core/rendering` 的 `panBy` 接收的是**屏幕像素**位移（相机 `pan` 即屏幕空间），
 * 故此处**不得**再除以相机缩放——否则视口移动量会被放大 `1/scale` 倍。
 *
 * @param deltaX 滚轮横向量（本实现取 `WheelEvent.deltaY`）。
 * @returns 屏幕坐标下的位移向量（仅 x）。
 */
export function horizontalPanDelta(deltaX: number): Vec2 {
  return { x: deltaX * WHEEL_PAN_SPEED, y: 0 }
}

export type CameraInteractionOptions = {
  /** 官方画布**外围**的包裹元素（捕获点）。 */
  host: Ref<HTMLElement | null>
  /** 读取当前相机（来自官方模板默认插槽）。 */
  getCamera: () => Camera2D
  /** 写回相机（建议经官方模板的 `setCamera`，以复用其缩放约束）。 */
  setCamera: (camera: Camera2D) => void
  /** FR-003 开关；缺省 `true`。 */
  enableSpacePan?: boolean
  /** FR-002 开关；缺省 `true`。 */
  enableMiddlePan?: boolean
  /** FR-004 开关；缺省 `true`。 */
  enableShiftWheelPan?: boolean
}

/**
 * 把 PRD 要求、但官方模板未内置的相机手势补到包裹元素上。
 *
 * @param options 包裹元素、相机读写与三条开关。
 * @returns 幂等的 `dispose()`（组件卸载时自动调用，也可手动提前拆除）。
 *
 * @example
 * const dispose = installCameraInteractions({ host: wrapperRef, getCamera, setCamera })
 * // 组件卸载时会自动 dispose；需要提前拆除时手动调用
 */
export function installCameraInteractions(options: CameraInteractionOptions): () => void {
  const enableSpacePan = options.enableSpacePan ?? true
  const enableMiddlePan = options.enableMiddlePan ?? true
  const enableShiftWheelPan = options.enableShiftWheelPan ?? true

  let spaceHeld = false
  let panPointerId: number | null = null
  let panLast: Vec2 | null = null

  /** 输入控件聚焦时不拦截空格（避免打断编辑）。 */
  const isTypingTarget = (target: EventTarget | null): boolean =>
    target instanceof HTMLInputElement
    || target instanceof HTMLTextAreaElement
    || (target instanceof HTMLElement && target.isContentEditable)

  const wantsPan = (event: PointerEvent): boolean =>
    (enableMiddlePan && isMiddleButton(event)) || (enableSpacePan && isSpacePanGesture(spaceHeld, event))

  const toLocal = (event: PointerEvent): Vec2 | null => {
    const el = options.host.value
    if (!el) return null
    const rect = el.getBoundingClientRect()
    return { x: event.clientX - rect.left, y: event.clientY - rect.top }
  }

  const onWindowPointerMove = (event: PointerEvent): void => {
    if (panPointerId !== event.pointerId || !panLast) return
    const local = toLocal(event)
    if (!local) return
    options.setCamera(panBy(options.getCamera(), { x: local.x - panLast.x, y: local.y - panLast.y }))
    panLast = local
  }

  const endPan = (event: PointerEvent): void => {
    if (panPointerId !== event.pointerId) return
    panPointerId = null
    panLast = null
    window.removeEventListener('pointermove', onWindowPointerMove)
    window.removeEventListener('pointerup', endPan)
    window.removeEventListener('pointercancel', endPan)
  }

  const onPointerDownCapture = (event: PointerEvent): void => {
    if (!wantsPan(event)) return
    event.preventDefault()
    event.stopPropagation()
    panPointerId = event.pointerId
    panLast = toLocal(event)
    window.addEventListener('pointermove', onWindowPointerMove)
    window.addEventListener('pointerup', endPan)
    window.addEventListener('pointercancel', endPan)
  }

  const onWheelCapture = (event: WheelEvent): void => {
    if (!enableShiftWheelPan || !isShiftWheel(event)) return
    event.preventDefault()
    event.stopPropagation()
    options.setCamera(panBy(options.getCamera(), horizontalPanDelta(event.deltaY)))
  }

  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.code !== 'Space' || isTypingTarget(event.target)) return
    spaceHeld = true
    event.preventDefault()
  }

  const onKeyUp = (event: KeyboardEvent): void => {
    if (event.code === 'Space') spaceHeld = false
  }

  const attach = (): void => {
    const el = options.host.value
    if (el) {
      el.addEventListener('pointerdown', onPointerDownCapture, { capture: true })
      el.addEventListener('wheel', onWheelCapture, { capture: true, passive: false })
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
  }

  const dispose = (): void => {
    const el = options.host.value
    if (el) {
      el.removeEventListener('pointerdown', onPointerDownCapture, { capture: true })
      el.removeEventListener('wheel', onWheelCapture, { capture: true })
    }
    window.removeEventListener('keydown', onKeyDown)
    window.removeEventListener('keyup', onKeyUp)
    window.removeEventListener('pointermove', onWindowPointerMove)
    window.removeEventListener('pointerup', endPan)
    window.removeEventListener('pointercancel', endPan)
    spaceHeld = false
    panPointerId = null
    panLast = null
  }

  onMounted(attach)
  onBeforeUnmount(dispose)

  return dispose
}
