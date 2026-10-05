<template>
  <section class="matheshop-cnl">
    <header class="matheshop-cnl__header">
      <h2>受控自然语言符号化</h2>
      <p>
        输入中英混合受控数学文本（定义 / 定理 / 证明 句式），由后端 GF 猜想模块解析为候选 IR 并多路导出。
        前端不做文法校验；候选恒为 <strong>conjecture</strong>，须经校验 / 冻结后方可采信。
      </p>
    </header>

    <div class="matheshop-cnl__input">
      <textarea :value="snapshot.source" rows="10" spellcheck="false" @input="onInput" />
      <div class="matheshop-cnl__actions">
        <button type="button" :disabled="snapshot.busy" @click="onProcess">
          {{ snapshot.busy ? '解析中…' : '解析并导出' }}
        </button>
      </div>
    </div>

    <div v-if="errResult" class="matheshop-cnl__error">
      解析失败<span v-if="errResult.line">（第 {{ errResult.line }} 行）</span>：{{ errResult.message }}
    </div>

    <div v-if="okResult" class="matheshop-cnl__result">
      <p class="matheshop-cnl__badge">
        候选状态：<strong>conjecture</strong>（{{ okResult.units.length }} 个顶层单元 · 只读 IR · 未入保真内核）
      </p>
      <div class="matheshop-cnl__exports">
        <article v-for="key in exportKeys" :key="key" class="matheshop-cnl__export">
          <h3>{{ key }}</h3>
          <pre>{{ okResult.exports[key] ?? '（无）' }}</pre>
        </article>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, shallowRef } from 'vue'
import { cnlConsole, type CnlConsoleSnapshot } from '../core/cnlConsole'
import type { CnlExportKey } from '../engine/cnlEngineClient'

const snapshot = shallowRef<CnlConsoleSnapshot>(cnlConsole.getSnapshot())
const exportKeys: CnlExportKey[] = ['latex', 'sympy', 'lean', 'forthel', 'prolog', 'ace']
let unsubscribe: (() => void) | null = null

const okResult = computed(() => (snapshot.value.result?.ok ? snapshot.value.result : null))
const errResult = computed(() => (snapshot.value.result && !snapshot.value.result.ok ? snapshot.value.result : null))

const onInput = (event: Event) => {
  cnlConsole.setSource((event.target as HTMLTextAreaElement).value)
}

const onProcess = () => {
  void cnlConsole.process()
}

onMounted(() => {
  unsubscribe = cnlConsole.subscribe((next) => {
    snapshot.value = next
  })
})

onBeforeUnmount(() => {
  unsubscribe?.()
})
</script>
