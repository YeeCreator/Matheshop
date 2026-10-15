<template>
  <div class="matheshop-geogebra">
    <header class="matheshop-geogebra__bar">
      <strong>GeoGebra 子面板（中等密度档）</strong>
      <button type="button" @click="reload">重载</button>
      <span class="matheshop-geogebra__hint">{{ status }}</span>
    </header>

    <iframe
      ref="frameRef"
      class="matheshop-geogebra__frame"
      :src="iframeUrl"
      title="GeoGebra 交互子面板"
      sandbox="allow-scripts allow-same-origin allow-forms"
      @load="onFrameLoad"
    />

    <footer class="matheshop-geogebra__bindings">
      <span>已绑定符号：{{ bindings.length ? bindings.join('、') : '（无）' }}</span>
    </footer>
  </div>
</template>

<script setup lang="ts">
/**
 * T10 · GeoGebra 内嵌交互子面板（范式一「可交互模型」密度档的可复用渲染子模块）。
 *
 * **定位**：GeoGebra 是**前端中等密度档的渲染子模块**，不是 MathEngine 的计算后端
 * （契约边界见设计 §3.4）。它把几何/动态图形的可交互演示**复用**现成引擎，
 * 避免从头自研。
 *
 * **双向绑定协议**（最小实现，避免过度耦合）：
 * - 出向（本组件 → GeoGebra）：`bindings` 声明要同步的符号名；
 * - 入向（GeoGebra → 本组件）：通过 `postMessage` 接收参数变更并 `@update:param` 抛出，
 *   由宿主回写全局符号表/节点（本组件不直接改宿主状态）。
 *
 * **安全**：iframe 带 `sandbox`，不使用 `allow-popups` / `allow-top-navigation`。
 */
import { computed, ref, onBeforeUnmount, toRef } from 'vue'

const props = defineProps<{
  /** GeoGebra 应用基址（缺省官方在线版；离线部署时传本地路径）。 */
  baseUrl?: string
  /** 预置的 GeoGebra 命令（如 `A=(1,2)`）；作为 URL 参数下发。 */
  commands?: string[]
  /** 要双向绑定的符号名（供宿主与全局符号表对齐）。 */
  symbols?: string[]
  /** 面板高度（px）。 */
  height?: number
}>()

const emit = defineEmits<{
  /** 面板就绪（iframe 加载完成）。 */
  ready: []
  /** GeoGebra 侧参数更新（宿主据此回写符号表）。 */
  'update:param': [{ name: string; value: number }]
}>()

const baseUrl = toRef(props, 'baseUrl')
const commands = toRef(props, 'commands')
const symbols = toRef(props, 'symbols')

const frameRef = ref<HTMLIFrameElement | null>(null)
const status = ref('未加载')
const bindings = computed(() => symbols.value ?? [])

/** 由基址 + 命令拼出 GeoGebra 嵌入式 URL。 */
const iframeUrl = computed(() => {
  const base = (baseUrl.value ?? 'https://www.geogebra.org/graphing').replace(/\/+$/, '')
  const params = new URLSearchParams({ embed: 'true', appName: 'graphing' })
  const cmds = commands.value ?? []
  cmds.forEach((cmd, index) => params.append(`command${index + 1}`, cmd))
  return `${base}?${params.toString()}`
})

const reload = () => {
  status.value = '重载中'
  const frame = frameRef.value
  if (frame) frame.src = iframeUrl.value
}

const onFrameLoad = () => {
  status.value = '就绪'
  emit('ready')
}

/** 接收 GeoGebra 侧的参数更新（约定消息形状 `{ type: 'ggb-param', name, value }`）。 */
const onMessage = (event: MessageEvent) => {
  const payload = event.data as { type?: string; name?: unknown; value?: unknown } | null
  if (!payload || payload.type !== 'ggb-param') return
  if (typeof payload.name === 'string' && typeof payload.value === 'number') {
    emit('update:param', { name: payload.name, value: payload.value })
  }
}

window.addEventListener('message', onMessage)
onBeforeUnmount(() => window.removeEventListener('message', onMessage))
</script>

<style scoped>
.matheshop-geogebra { display: flex; flex-direction: column; gap: 6px; font-size: 12px; }
.matheshop-geogebra__bar { display: flex; align-items: center; gap: 8px; }
.matheshop-geogebra__hint { color: #8b846b; }
.matheshop-geogebra__frame { width: 100%; height: 260px; border: 1px solid #e4e2d4; border-radius: 6px; background: #fff; }
.matheshop-geogebra__bindings { color: #6b6a5e; }
</style>
