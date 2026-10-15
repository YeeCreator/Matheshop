<template>
  <div class="matheshop-canvas-surface">
    <header class="matheshop-canvas-surface__toolbar" :style="{ height: toPx(toolbarHeight) }">
      <div class="matheshop-canvas-surface__toolbar-leading"><slot name="toolbarLeading" /></div>
      <div class="matheshop-canvas-surface__toolbar-center"><slot name="toolbarCenter" /></div>
      <div class="matheshop-canvas-surface__toolbar-trailing"><slot name="toolbarTrailing" /></div>
    </header>
    <div class="matheshop-canvas-surface__body">
      <aside class="matheshop-canvas-surface__left" :style="{ width: toPx(leftPanelWidth) }">
        <slot name="left" />
      </aside>
      <div
        ref="hostRef"
        class="matheshop-canvas-surface__viewport"
        :style="{ background }"
        @wheel.prevent="onWheel"
        @pointerdown="onViewportPointerDown"
        @pointermove="onViewportPointerMove"
        @pointerup="onViewportPointerEnd"
        @pointercancel="onViewportPointerEnd"
      >
        <div class="matheshop-canvas-surface__world" :style="worldStyle">
          <svg
            class="matheshop-canvas-surface__edges"
            :viewBox="viewBoxText"
            :width="viewBox.width"
            :height="viewBox.height"
            aria-hidden="true"
          >
            <path v-for="edge in edgePaths" :key="edge.id" class="matheshop-canvas-surface__edge" :d="edge.path" />
          </svg>
          <slot name="world" :camera="camera" :bridge="bridge" />
        </div>
      </div>
      <aside class="matheshop-canvas-surface__right" :style="{ width: toPx(rightPanelWidth) }">
        <slot name="right" />
      </aside>
    </div>
  </div>
</template>

<script lang="ts">
import type { Camera2D, Vec2 } from '@main-ui/core/rendering'

/** 连线层消费的画布单元（世界坐标矩形）。 */
export type SurfaceCell = { id: string; x: number; y: number; width: number; height: number }

/** 连线层消费的连边（源/目标为 cell id）。 */
export type SurfaceEdge = { id: string; source: string; target: string }

/** 暴露给 #world 槽宿主的坐标换算桥（沿用原 viewport-2d-kit bridge 语义）。 */
export type CanvasBridge = {
  clientEventToWorld: (camera: Camera2D, event: { clientX: number; clientY: number }) => Vec2
  screenDeltaToWorld: (camera: Camera2D, delta: Vec2) => Vec2
}
</script>

<script setup lang="ts">
/**
 * MatheshopCanvasSurface —— 本地画布编辑壳（取代已下线的 flow-graph-kit-vue）。
 *
 * 布局：左/右面板 + 工具条三段 + 中央 2D 视口；相机数学与坐标换算基于
 * @main-ui/core/rendering（原 viewport-2d-kit 吸收后的官方基座）。
 * 交互：滚轮以光标为锚点缩放，空格+拖拽 / 中键拖拽平移。
 * #world 槽在 world 坐标系内渲染宿主自定义 DOM 内容，连线层与其同层叠加。
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import {
  cameraToCssTransform,
  clamp,
  fitCameraToViewBox,
  screenToWorld,
  panBy,
  zoomAtScreenPoint,
  type ViewBox,
} from '@main-ui/core/rendering'

const props = defineProps<{
  cells: SurfaceCell[]
  edges: SurfaceEdge[]
  viewBox: ViewBox
  background?: string
  leftPanelWidth?: number | string
  rightPanelWidth?: number | string
  toolbarHeight?: number | string
  paddingPx?: number
  minScaleFactor?: number
  maxScaleFactor?: number
  wheelZoomSpeed?: number
}>()

const background = computed(() => props.background ?? '#fbfbfd')
const leftPanelWidth = computed(() => props.leftPanelWidth ?? 210)
const rightPanelWidth = computed(() => props.rightPanelWidth ?? 320)
const toolbarHeight = computed(() => props.toolbarHeight ?? 36)
const paddingPx = computed(() => props.paddingPx ?? 80)
const minScaleFactor = computed(() => props.minScaleFactor ?? 0.08)
const maxScaleFactor = computed(() => props.maxScaleFactor ?? 64)
const wheelZoomSpeed = computed(() => props.wheelZoomSpeed ?? 0.0028)

const hostRef = ref<HTMLDivElement | null>(null)
const camera = ref<Camera2D>({ scale: 1, pan: { x: 0, y: 0 } })
const spaceHeld = ref(false)
let panPointerId: number | null = null
let panLastLocal: Vec2 | null = null

const toPx = (value: number | string) => (typeof value === 'number' ? `${value}px` : value)

/** 把 client 坐标换算为视口容器内的局部屏幕坐标。 */
const toLocal = (clientX: number, clientY: number): Vec2 | null => {
  const rect = hostRef.value?.getBoundingClientRect()
  if (!rect) return null
  return { x: clientX - rect.left, y: clientY - rect.top }
}

const bridge: CanvasBridge = {
  clientEventToWorld: (cam, event) => {
    const local = toLocal(event.clientX, event.clientY) ?? { x: 0, y: 0 }
    return screenToWorld(cam, local)
  },
  screenDeltaToWorld: (cam, delta) => ({ x: delta.x / cam.scale, y: delta.y / cam.scale }),
}

const worldStyle = computed(() => ({
  transform: cameraToCssTransform(camera.value),
  transformOrigin: '0 0',
}))

const viewBoxText = computed(() => `${props.viewBox.x} ${props.viewBox.y} ${props.viewBox.width} ${props.viewBox.height}`)

const centerOf = (cell: SurfaceCell) => ({ x: cell.x + cell.width / 2, y: cell.y + cell.height / 2 })

/** 与原 FlowGraphEditorSurface 一致的三次贝塞尔连线路径。 */
const edgePaths = computed(() => {
  const cellMap = new Map(props.cells.map((cell) => [cell.id, cell]))
  return props.edges.flatMap((edge) => {
    const source = cellMap.get(edge.source)
    const target = cellMap.get(edge.target)
    if (!source || !target) return []
    const from = centerOf(source)
    const to = centerOf(target)
    const dx = Math.abs(to.x - from.x)
    return [{
      id: edge.id,
      path: `M ${from.x} ${from.y} C ${from.x + dx * 0.42} ${from.y}, ${to.x - dx * 0.42} ${to.y}, ${to.x} ${to.y}`,
    }]
  })
})

const onWheel = (event: WheelEvent) => {
  const anchor = toLocal(event.clientX, event.clientY) ?? { x: 0, y: 0 }
  const factor = Math.exp(-event.deltaY * wheelZoomSpeed.value)
  const nextScale = clamp(camera.value.scale * factor, minScaleFactor.value, maxScaleFactor.value)
  if (nextScale === camera.value.scale) return
  const clampedFactor = nextScale / camera.value.scale
  camera.value = zoomAtScreenPoint(camera.value, { factor: clampedFactor, anchorScreen: anchor })
}

const onViewportPointerDown = (event: PointerEvent) => {
  if (event.button === 2) return
  const wantPan = spaceHeld.value || event.button === 1
  if (!wantPan) return
  event.preventDefault()
  panPointerId = event.pointerId
  panLastLocal = toLocal(event.clientX, event.clientY)
  ;(event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId)
}

const onViewportPointerMove = (event: PointerEvent) => {
  if (panPointerId !== event.pointerId || !panLastLocal) return
  const local = toLocal(event.clientX, event.clientY)
  if (!local) return
  camera.value = panBy(camera.value, { x: local.x - panLastLocal.x, y: local.y - panLastLocal.y })
  panLastLocal = local
}

const onViewportPointerEnd = (event: PointerEvent) => {
  if (panPointerId !== event.pointerId) return
  panPointerId = null
  panLastLocal = null
}

/** 空格按住进入平移模式；输入控件聚焦时不拦截空格。 */
const isTypingTarget = (target: EventTarget | null) =>
  target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || (target instanceof HTMLElement && target.isContentEditable)

const onWindowKeydown = (event: KeyboardEvent) => {
  if (event.code === 'Space' && !isTypingTarget(event.target)) {
    spaceHeld.value = true
    event.preventDefault()
  }
}

const onWindowKeyup = (event: KeyboardEvent) => {
  if (event.code === 'Space') spaceHeld.value = false
}

onMounted(() => {
  const host = hostRef.value
  if (host) {
    camera.value = fitCameraToViewBox({
      containerPx: { width: host.clientWidth, height: host.clientHeight },
      viewBox: props.viewBox,
      paddingPx: paddingPx.value,
    })
  }
  window.addEventListener('keydown', onWindowKeydown)
  window.addEventListener('keyup', onWindowKeyup)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onWindowKeydown)
  window.removeEventListener('keyup', onWindowKeyup)
})
</script>

<style scoped>
.matheshop-canvas-surface {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  min-height: 0;
}

.matheshop-canvas-surface__toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 0 8px;
  border-bottom: 1px solid var(--mui-color-border, #d9d9e3);
  flex: none;
}

.matheshop-canvas-surface__toolbar-leading,
.matheshop-canvas-surface__toolbar-trailing {
  display: flex;
  align-items: center;
  gap: 8px;
}

.matheshop-canvas-surface__toolbar-center {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 0;
}

.matheshop-canvas-surface__body {
  display: flex;
  flex: 1;
  min-height: 0;
}

.matheshop-canvas-surface__left,
.matheshop-canvas-surface__right {
  flex: none;
  overflow: auto;
  min-height: 0;
}

.matheshop-canvas-surface__viewport {
  position: relative;
  flex: 1;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}

.matheshop-canvas-surface__world {
  position: absolute;
  left: 0;
  top: 0;
}

.matheshop-canvas-surface__edges {
  position: absolute;
  left: 0;
  top: 0;
  overflow: visible;
  pointer-events: none;
}

.matheshop-canvas-surface__edge {
  fill: none;
  stroke: var(--main-ui-accent, #2563eb);
  stroke-width: 2;
}
</style>
