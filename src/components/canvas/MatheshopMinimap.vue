<template>
  <svg
    v-if="cells.length"
    class="matheshop-minimap"
    :viewBox="`${bounds.x} ${bounds.y} ${bounds.width} ${bounds.height}`"
    :width="width"
    :height="height"
    aria-label="画布缩略图"
  >
    <rect
      v-for="cell in cells"
      :key="cell.id"
      :x="cell.x"
      :y="cell.y"
      :width="cell.width"
      :height="cell.height"
      class="matheshop-minimap__cell"
      :class="{ 'is-viewport': isInViewport(cell) }"
    />
    <rect
      v-if="viewport"
      :x="viewport.x"
      :y="viewport.y"
      :width="viewport.width"
      :height="viewport.height"
      class="matheshop-minimap__viewport"
    />
  </svg>
</template>

<script setup lang="ts">
/**
 * T6 · minimap（画布缩略导航，设计 §6.4）。
 *
 * 画出全部单元的相对位置，并以高亮矩形标出**当前视口**覆盖的区域，
 * 便于画布较大时快速定位。纯 SVG，不依赖渲染引擎。
 */
import { computed } from 'vue'

const props = defineProps<{
  /** 画布单元（世界坐标矩形）。 */
  cells: Array<{ id: string; x: number; y: number; width: number; height: number }>
  /** 当前视口矩形（世界坐标）；缺省只画单元。 */
  viewport?: { x: number; y: number; width: number; height: number } | null
  /** 缩略图渲染宽高（px）。 */
  width?: number
  height?: number
}>()

const width = computed(() => props.width ?? 160)
const height = computed(() => props.height ?? 110)

/** 全部单元 + 视口的包围盒（含少量留白），作为 viewBox。 */
const bounds = computed(() => {
  const boxes = [...props.cells, ...(props.viewport ? [props.viewport] : [])]
  const minX = Math.min(...boxes.map((b) => b.x), 0)
  const minY = Math.min(...boxes.map((b) => b.y), 0)
  const maxX = Math.max(...boxes.map((b) => b.x + b.width), 1)
  const maxY = Math.max(...boxes.map((b) => b.y + b.height), 1)
  const pad = Math.max((maxX - minX) * 0.04, 20)
  return { x: minX - pad, y: minY - pad, width: maxX - minX + pad * 2, height: maxY - minY + pad * 2 }
})

/** 单元是否落在当前视口内（用于高亮）。 */
const isInViewport = (cell: { x: number; y: number; width: number; height: number }) => {
  const v = props.viewport
  if (!v) return false
  return cell.x + cell.width >= v.x && cell.x <= v.x + v.width && cell.y + cell.height >= v.y && cell.y <= v.y + v.height
}
</script>

<style scoped>
.matheshop-minimap { border: 1px solid #e4e2d4; border-radius: 4px; background: #fffef8; }
.matheshop-minimap__cell { fill: #ddd8c3; stroke: #b8b29a; stroke-width: 1; }
.matheshop-minimap__cell.is-viewport { fill: #ffe9a3; }
.matheshop-minimap__viewport { fill: none; stroke: #b8860b; stroke-width: 2; stroke-dasharray: 6 4; }
</style>
