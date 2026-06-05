<template>
  <section class="matheshop-settings">
    <header class="matheshop-settings__header">
      <h2>Matheshop 设置</h2>
      <p>渲染层使用 Vue3，工作台由 main-ui 提供，视口由 viewport-2d-kit 驱动。</p>
    </header>

    <div class="matheshop-settings__group">
      <h3>计算引擎</h3>
      <label v-for="item in engineChoices" :key="item.value" class="matheshop-radio-row">
        <input type="radio" name="engine" :value="item.value" :checked="snapshot.engineSelection.choice === item.value" @change="setEngine(item.value)" />
        <span>{{ item.label }}</span>
      </label>
    </div>

    <div class="matheshop-settings__group">
      <h3>Python 后台</h3>
      <dl>
        <dt>环境变量</dt>
        <dd>{{ pythonEngineEnv }}</dd>
        <dt>默认项目路径</dt>
        <dd>{{ pythonEngineRoot }}</dd>
        <dt>HTTP 入口</dt>
        <dd>/api/engine/v1/eval</dd>
      </dl>
    </div>
  </section>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, shallowRef } from 'vue'
import { MATHESHOP_PYTHON_ENGINE_ENV, MATHESHOP_PYTHON_ENGINE_ROOT } from '../core/pythonEngineConfig'
import { matheshopWhiteboardFiles } from '../core/whiteboardFiles'
import { loadEngineSelection, type EngineChoice, type EngineSelectionState } from '../engine/engineSelection'

const snapshot = shallowRef<EngineSelectionState>(loadEngineSelection())
let unsubscribe: (() => void) | null = null

const engineChoices: Array<{ value: EngineChoice; label: string }> = [
  { value: 'builtin_python', label: '内置 Python 高性能计算后台' },
  { value: 'builtin_native', label: '浏览器 TypeScript 轻量后备' },
  { value: 'external', label: '外接计算引擎占位' },
]

const pythonEngineEnv = MATHESHOP_PYTHON_ENGINE_ENV
const pythonEngineRoot = MATHESHOP_PYTHON_ENGINE_ROOT

const setEngine = (choice: EngineChoice) => {
  matheshopWhiteboardFiles.applyEngineChoiceToAll(choice)
}

onMounted(() => {
  unsubscribe = matheshopWhiteboardFiles.subscribe(() => {
    snapshot.value = loadEngineSelection()
  })
  snapshot.value = loadEngineSelection()
})

onBeforeUnmount(() => {
  unsubscribe?.()
})
</script>