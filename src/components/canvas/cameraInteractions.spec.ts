import { describe, expect, it } from 'vitest'
import {
  WHEEL_PAN_SPEED,
  horizontalPanDelta,
  isMiddleButton,
  isShiftWheel,
  isSpacePanGesture,
} from './cameraInteractions'

describe('cameraInteractions · PRD 手势判定（纯函数）', () => {
  it('FR-002：中键（button=1）判为中键平移', () => {
    expect(isMiddleButton({ button: 1 })).toBe(true)
    expect(isMiddleButton({ button: 0 })).toBe(false)
    expect(isMiddleButton({ button: 2 })).toBe(false)
  })

  it('FR-003：仅在按住空格且左键时判为空格平移', () => {
    expect(isSpacePanGesture(true, { button: 0 })).toBe(true)
    expect(isSpacePanGesture(false, { button: 0 })).toBe(false)
    expect(isSpacePanGesture(true, { button: 1 })).toBe(false)
    expect(isSpacePanGesture(true, { button: 2 })).toBe(false)
  })

  it('FR-004：Shift 按下才判为横向平移滚轮', () => {
    expect(isShiftWheel({ shiftKey: true })).toBe(true)
    expect(isShiftWheel({ shiftKey: false })).toBe(false)
  })

  it('FR-004：横向位移为屏幕像素（不按缩放折算，避免被放大 1/scale 倍）', () => {
    expect(horizontalPanDelta(100)).toEqual({ x: 100, y: 0 })
    expect(horizontalPanDelta(-40)).toEqual({ x: -40, y: 0 })
    expect(horizontalPanDelta(0)).toEqual({ x: 0, y: 0 })
  })

  it('FR-004：滚轮单位与屏幕像素 1:1（灵敏度为 1）', () => {
    expect(WHEEL_PAN_SPEED).toBe(1)
    expect(horizontalPanDelta(120)).toEqual({ x: 120, y: 0 })
  })
})
