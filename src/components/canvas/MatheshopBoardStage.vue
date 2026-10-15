<template>
  <ViewportCanvasShell
    :left-panel-width="leftPanelWidth"
    :right-panel-width="rightPanelWidth"
    :toolbar-height="toolbarHeight"
    :collapse-empty-side-panels="false"
  >
    <template #left><slot name="left" /></template>
    <template #right><slot name="right" /></template>
    <template #toolbarLeading><slot name="toolbarLeading" /></template>
    <template #toolbarCenter><slot name="toolbarCenter" /></template>
    <template #toolbarTrailing><slot name="toolbarTrailing" /></template>

    <ViewportCanvas
      ref="canvasRef"
      :view-box="viewBox"
      :padding-px="paddingPx"
      :min-scale="minScaleFactor"
      :max-scale="maxScaleFactor"
      :style="{ background }"
    >
      <template #default="{ cameraTransform, camera }">
        <div
          class="matheshop-board-stage__camera"
          :data-camera-transform="cameraTransform"
          :style="{ transform: cameraTransform, transformOrigin: '0 0' }"
        >
          <svg
            class="matheshop-board-stage__edges"
            :viewBox="bridge.viewBoxText"
            :width="viewBox.width"
            :height="viewBox.height"
            aria-hidden="true"
          >
            <path v-for="edge in edgePaths" :key="edge.id" class="matheshop-board-stage__edge" :d="edge.path" />
          </svg>
          <slot name="world" :camera="camera" :bridge="bridge" />
        </div>
      </template>
    </ViewportCanvas>
  </ViewportCanvasShell>
</template>

<script setup lang="ts">
/**
 * MatheshopBoardStage —— matheshop 画布舞台（官方 `@main-ui/view-canvas` 之上的薄适配层）。
 *
 * 相机数学、指针/滚轮交互、fit 与坐标桥**全部由官方模板提供**（`ViewportCanvas` /
 * `ViewportCanvasShell` / `useViewportHostBridge`）；本组件只补两件 matheshop 专有的事：
 *
 * 1. **连线层**：cell 之间的三次贝塞尔路径（`cells` / `edges` → SVG path）；
 * 2. **世界内容插槽**：`#world` 槽在相机变换内渲染宿主单元框，并回传坐标桥。
 *
 * 旧本地壳 `MatheshopCanvasSurface.vue` 已随之退役（其自实现的相机/交互逻辑与官方模板重复）。
 */
import { computed, ref } from 'vue'
import {
  ViewportCanvas,
  ViewportCanvasShell,
  buildHostBridge,
  type ViewportHostBridge,
} from '@main-ui/view-canvas'
import type { Camera2D, ViewBox } from '@main-ui/core/rendering'

/** 连线层消费的画布单元（世界坐标矩形）。 */
export type SurfaceCell = { id: string; x: number; y: number; width: number; height: number }

/** 连线层消费的连边（源/目标为 cell id）。 */
export type SurfaceEdge = { id: string; source: string; target: string }

/** 世界内容插槽回传的坐标桥（等价于官方 `ViewportHostBridge`）。 */
export type CanvasBridge = ViewportHostBridge

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
}>()

const background = computed(() => props.background ?? '#fbfbfd')
const leftPanelWidth = computed(() => props.leftPanelWidth ?? 210)
const rightPanelWidth = computed(() => props.rightPanelWidth ?? 320)
const toolbarHeight = computed(() => props.toolbarHeight ?? 36)
const paddingPx = computed(() => props.paddingPx ?? 80)
const minScaleFactor = computed(() => props.minScaleFactor ?? 0.08)
const maxScaleFactor = computed(() => props.maxScaleFactor ?? 64)

const canvasRef = ref<InstanceType<typeof ViewportCanvas> | null>(null)

/** client 坐标 → 视口容器内局部屏幕坐标。 */
const toLocal = (clientX: number, clientY: number): { x: number; y: number } | null => {
  const el = canvasRef.value?.$el as HTMLElement | undefined
  if (!el) return null
  const rect = el.getBoundingClientRect()
  return { x: clientX - rect.left, y: clientY - rect.top }
}

const bridge: ViewportHostBridge = buildHostBridge(props.viewBox, toLocal)

const centerOf = (cell: SurfaceCell) => ({ x: cell.x + cell.width / 2, y: cell.y + cell.height / 2 })

/** 与原画布壳一致的三次贝塞尔连线路径。 */
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

defineExpose({
  fitToBounds: () => canvasRef.value?.fitToBounds(),
  zoomIn: () => canvasRef.value?.zoomIn(),
  zoomOut: () => canvasRef.value?.zoomOut(),
  getCamera: (): Camera2D | undefined => canvasRef.value?.getCamera(),
})
</script>

<style scoped>
.matheshop-board-stage__camera {
  position: absolute;
  left: 0;
  top: 0;
}

.matheshop-board-stage__edges {
  position: absolute;
  left: 0;
  top: 0;
  overflow: visible;
  pointer-events: none;
}

.matheshop-board-stage__edge {
  fill: none;
  stroke: var(--main-ui-accent, #2563eb);
  stroke-width: 2;
}
</style>
