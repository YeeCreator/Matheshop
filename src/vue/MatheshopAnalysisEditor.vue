<template>
  <section class="matheshop-analysis">
    <header class="matheshop-analysis__header">
      <h2>分析总览</h2>
      <p>统计当前所有白板文件的规模与最近活动。</p>
    </header>

    <div class="matheshop-analysis__stats">
      <article class="matheshop-analysis__stat">
        <strong>{{ files.length }}</strong>
        <span>白板文件</span>
      </article>
      <article class="matheshop-analysis__stat">
        <strong>{{ totalCells }}</strong>
        <span>单元框总数</span>
      </article>
      <article class="matheshop-analysis__stat">
        <strong>{{ totalEdges }}</strong>
        <span>连线总数</span>
      </article>
    </div>

    <div class="matheshop-analysis__list">
      <article v-for="file in files" :key="file.id" class="matheshop-analysis__card">
        <div>
          <strong>{{ file.title }}</strong>
          <p>最近更新：{{ formatDate(file.updatedAt) }}</p>
        </div>
        <dl>
          <dt>单元框</dt>
          <dd>{{ getSnapshot(file.id)?.cells.length ?? 0 }}</dd>
          <dt>连线</dt>
          <dd>{{ getSnapshot(file.id)?.edges.length ?? 0 }}</dd>
        </dl>
      </article>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, shallowRef } from 'vue'
import { matheshopWhiteboardFiles, type MatheshopWhiteboardFileSummary } from '../core/whiteboardFiles'

const files = shallowRef<MatheshopWhiteboardFileSummary[]>(matheshopWhiteboardFiles.listFiles())
let unsubscribe: (() => void) | null = null

const getSnapshot = (fileId: string) => matheshopWhiteboardFiles.getSnapshot(fileId)
const formatDate = (value: string) => new Date(value).toLocaleString()

const totalCells = computed(() => files.value.reduce((sum, file) => sum + (getSnapshot(file.id)?.cells.length ?? 0), 0))
const totalEdges = computed(() => files.value.reduce((sum, file) => sum + (getSnapshot(file.id)?.edges.length ?? 0), 0))

onMounted(() => {
  unsubscribe = matheshopWhiteboardFiles.subscribe((next) => {
    files.value = next
  })
})

onBeforeUnmount(() => {
  unsubscribe?.()
})
</script>