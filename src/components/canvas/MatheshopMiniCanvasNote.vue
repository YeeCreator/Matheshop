<template>
  <div class="matheshop-mini-note" :data-depth="ref.depth" :data-view="ref.view">
    <header class="matheshop-mini-note__bar">
      <span class="matheshop-mini-note__badge">便签 · 第 {{ ref.depth }} 层</span>
      <button type="button" @click="toggleView">{{ ref.view === 'thumbnail' ? '展开' : '收起' }}</button>
    </header>

    <div v-if="ref.view === 'thumbnail'" class="matheshop-mini-note__thumb">
      <small>子画布 #{{ ref.subBoardId }}</small>
      <span class="matheshop-mini-note__hint">缩略预览（点「展开」进入编辑）</span>
    </div>

    <div v-else class="matheshop-mini-note__expanded">
      <small>子画布 #{{ ref.subBoardId }} · 单元 {{ childCellCount }} 个</small>
      <p v-if="!canNestFurther" class="matheshop-mini-note__limit">已达最大嵌套深度</p>
      <p v-else class="matheshop-mini-note__hint">可再嵌一层便签</p>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * T3 · 内嵌子画布便签（缩略预览 ↔ 展开编辑两态）。
 *
 * 本组件只渲染便签外壳与状态切换；子画布内容由**独立的 board 实例**承载
 * （经 `matheshopWhiteboardFiles.getBoard(ref.subBoardId)` 取用），
 * 从而保持主画布快照扁平、不递归化。
 */
import { computed, toRef } from 'vue'
import { canNest, type SubBoardRef } from '../core/miniCanvas'

const props = defineProps<{
  /** 便签引用（含子画布 id、嵌套深度、视图态）。 */
  ref: SubBoardRef
  /** 子画布当前单元数（仅用于展示，由宿主查询后传入）。 */
  childCellCount?: number
}>()

const emit = defineEmits<{ 'update:view': [SubBoardRef['view']] }>()

const ref = toRef(props, 'ref')
const childCellCount = computed(() => props.childCellCount ?? 0)
const canNestFurther = computed(() => canNest(ref.value))

const toggleView = () => {
  emit('update:view', ref.value.view === 'thumbnail' ? 'expanded' : 'thumbnail')
}
</script>

<style scoped>
.matheshop-mini-note { border: 1px dashed #b8b29a; border-radius: 6px; padding: 6px 8px; background: #fffdf5; font-size: 12px; }
.matheshop-mini-note__bar { display: flex; align-items: center; justify-content: space-between; gap: 6px; }
.matheshop-mini-note__badge { color: #8b846b; }
.matheshop-mini-note__thumb { display: flex; flex-direction: column; gap: 2px; color: #6b6a5e; }
.matheshop-mini-note__expanded { margin-top: 4px; }
.matheshop-mini-note__hint { color: #8b846b; }
.matheshop-mini-note__limit { color: #b91c1c; margin: 2px 0 0; }
</style>
