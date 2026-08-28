<template>
  <section class="matheshop-settings">
    <header class="matheshop-settings__header">
      <h2>Matheshop 设置</h2>
      <p>渲染层使用 Vue3，工作台由 main-ui 提供，视口由 viewport-2d-kit 驱动。</p>
    </header>

    <div class="matheshop-settings__group">
      <h3>计算引擎</h3>
      <SettingsEditor scope="user" />
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
import { SettingsEditor } from 'main-ui/vue'
import { MATHESHOP_PYTHON_ENGINE_ENV, MATHESHOP_PYTHON_ENGINE_ROOT } from '../core/pythonEngineConfig'

const pythonEngineEnv = MATHESHOP_PYTHON_ENGINE_ENV
const pythonEngineRoot = MATHESHOP_PYTHON_ENGINE_ROOT
</script>