<template>
  <div ref="hostEl" class="react-legacy-host"></div>
</template>

<script setup lang="ts">
import React, { StrictMode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { onBeforeUnmount, onMounted, ref } from 'vue'
import LegacyApp from './App.tsx'

const hostEl = ref<HTMLDivElement | null>(null)
let root: Root | null = null

onMounted(() => {
  if (!hostEl.value) return
  root = createRoot(hostEl.value)
  root.render(React.createElement(StrictMode, null, React.createElement(LegacyApp)))
})

onBeforeUnmount(() => {
  root?.unmount()
  root = null
})
</script>

<style scoped>
.react-legacy-host {
  width: 100%;
  height: 100%;
}
</style>
