<template>
  <MainUiProvider :runtime="runtime">
    <WorkbenchShell />
  </MainUiProvider>
</template>

<script setup lang="ts">
import 'main-ui/styles.css'
import { MainUiProvider, WorkbenchShell } from 'main-ui/vue'
import { matheshopRuntime as runtime } from './core/workbench'
import './App.css'
</script>
