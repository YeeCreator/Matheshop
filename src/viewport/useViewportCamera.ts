import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Camera2D, ViewBox } from 'viewport-kit/core'

export type UseViewportCameraOptions = {
  containerRef: React.RefObject<HTMLElement | null>
  viewBox: ViewBox
  paddingPx?: number
  minScaleFactor?: number
  maxScaleFactor?: number
  wheelZoomSpeed?: number
  wheelPanSpeed?: number
  getCursorLocal?: () => { x: number; y: number } | null
  interactionMode?: {
    dragPan?: boolean
    dragPanCondition?: (e: unknown) => boolean
    wheelPan?: boolean
    ctrlWheelZoom?: boolean
    pinchZoom?: boolean
    wheelZoomAnchor?: 'cursor' | 'center'
  }
}

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value))

export function useViewportCamera(opts: UseViewportCameraOptions) {
  const {
    containerRef,
    viewBox,
    paddingPx = 0,
    minScaleFactor = 0.08,
    maxScaleFactor = 64,
    wheelZoomSpeed = 0.0028,
    wheelPanSpeed = 1.0,
  } = opts

  const [camera, setCameraState] = useState<Camera2D>({ scale: 1, pan: { x: 0, y: 0 } })
  const fitScaleRef = useRef(1)

  const fitToCenter = useCallback(() => {
    const el = containerRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0) return

    const sx = (rect.width - paddingPx * 2) / Math.max(1, viewBox.width)
    const sy = (rect.height - paddingPx * 2) / Math.max(1, viewBox.height)
    const fitScale = Math.max(0.0001, Math.min(sx, sy))
    fitScaleRef.current = fitScale

    const worldCenterX = viewBox.x + viewBox.width / 2
    const worldCenterY = viewBox.y + viewBox.height / 2
    const panX = rect.width / 2 - worldCenterX * fitScale
    const panY = rect.height / 2 - worldCenterY * fitScale

    setCameraState({ scale: fitScale, pan: { x: panX, y: panY } })
  }, [containerRef, paddingPx, viewBox.height, viewBox.width, viewBox.x, viewBox.y])

  useEffect(() => {
    fitToCenter()
  }, [fitToCenter])

  const setCamera = useCallback(
    (next: Camera2D) => {
      const minScale = fitScaleRef.current * minScaleFactor
      const maxScale = fitScaleRef.current * maxScaleFactor
      setCameraState({
        scale: clamp(next.scale, minScale, maxScale),
        pan: next.pan,
      })
    },
    [maxScaleFactor, minScaleFactor],
  )

  const handlers = useMemo(() => {
    return {
      onPointerDown: (_e: unknown) => {},
      onPointerMove: (_e: unknown) => {},
      onPointerUp: (_e: unknown) => {},
      onPointerCancel: (_e: unknown) => {},
      onWheel: (e: unknown) => {
        const anyE = e as {
          preventDefault?: () => void
          ctrlKey?: boolean
          metaKey?: boolean
          deltaY?: number
          clientX?: number
          clientY?: number
        }
        const el = containerRef.current
        if (!el) return
        anyE.preventDefault?.()

        const deltaY = anyE.deltaY ?? 0
        const rect = el.getBoundingClientRect()

        if (anyE.ctrlKey || anyE.metaKey) {
          const minScale = fitScaleRef.current * minScaleFactor
          const maxScale = fitScaleRef.current * maxScaleFactor
          const factor = Math.exp(-deltaY * wheelZoomSpeed)
          const nextScale = clamp(camera.scale * factor, minScale, maxScale)

          const cursorX = anyE.clientX ?? rect.left + rect.width / 2
          const cursorY = anyE.clientY ?? rect.top + rect.height / 2
          const lx = cursorX - rect.left
          const ly = cursorY - rect.top
          const wx = (lx - camera.pan.x) / camera.scale
          const wy = (ly - camera.pan.y) / camera.scale
          const panX = lx - wx * nextScale
          const panY = ly - wy * nextScale
          setCameraState({ scale: nextScale, pan: { x: panX, y: panY } })
          return
        }

        setCameraState((prev) => ({
          ...prev,
          pan: {
            x: prev.pan.x,
            y: prev.pan.y - deltaY * wheelPanSpeed,
          },
        }))
      },
    }
  }, [camera.pan.x, camera.pan.y, camera.scale, containerRef, maxScaleFactor, minScaleFactor, wheelPanSpeed, wheelZoomSpeed])

  return { camera, setCamera, fitToCenter, handlers }
}
