<template>
  <section class="matheshop-files">
    <header class="matheshop-files__header">
      <div>
        <h2>计算白板文件</h2>
        <p>每个白板文件都可以独立打开成一个白板标签页。</p>
      </div>
      <button type="button" @click="createAndOpenFile">新建白板</button>
    </header>

    <div class="matheshop-files__list">
      <article v-for="file in files" :key="file.id" class="matheshop-files__card">
        <div class="matheshop-files__meta">
          <strong>{{ file.title }}</strong>
          <span>{{ formatDate(file.updatedAt) }}</span>
        </div>
        <div class="matheshop-files__actions">
          <button type="button" @click="openFile(file.id)">打开到白板</button>
          <button type="button" @click="renameFile(file.id, file.title)">重命名</button>
        </div>
      </article>
    </div>
  </section>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, shallowRef } from 'vue'
import { useWorkbench } from 'main-ui/vue'
import { MATHESHOP_CANVAS_EDITOR_KIND, MATHESHOP_CANVAS_GROUP_ID, MATHESHOP_CANVAS_WORKSPACE_ID } from '../core/workbench'
import { matheshopWhiteboardFiles, type MatheshopWhiteboardFileSummary } from '../core/whiteboardFiles'

const { dispatch, document } = useWorkbench()
const files = shallowRef<MatheshopWhiteboardFileSummary[]>(matheshopWhiteboardFiles.listFiles())
let unsubscribe: (() => void) | null = null

const formatDate = (value: string) => new Date(value).toLocaleString()

const activateExistingTab = async (fileId: string): Promise<boolean> => {
  const canvasWorkspace = document.value.workspaceStates[MATHESHOP_CANVAS_WORKSPACE_ID]
  const tabs = Object.values(canvasWorkspace.tabs)
  for (const tab of tabs) {
    const editor = canvasWorkspace.editors[tab.editorInstanceId]
    if (!editor || editor.kind !== MATHESHOP_CANVAS_EDITOR_KIND || editor.payload?.whiteboardFileId !== fileId) {
      continue
    }
    const group = Object.values(canvasWorkspace.layout.groups).find((candidate) => candidate.tabIds.includes(tab.id))
    if (!group) {
      continue
    }
    await dispatch({ type: 'workspace/switch', workspaceId: MATHESHOP_CANVAS_WORKSPACE_ID })
    await dispatch({ type: 'editor/activateTab', groupId: group.id, tabId: tab.id })
    return true
  }
  return false
}

const openFile = async (fileId: string) => {
  if (await activateExistingTab(fileId)) {
    return
  }
  const file = matheshopWhiteboardFiles.getFile(fileId)
  if (!file) {
    return
  }
  await dispatch({ type: 'workspace/switch', workspaceId: MATHESHOP_CANVAS_WORKSPACE_ID })
  await dispatch({
    type: 'editor/open',
    request: {
      editorKind: MATHESHOP_CANVAS_EDITOR_KIND,
      targetGroupId: MATHESHOP_CANVAS_GROUP_ID,
      title: file.title,
      restoreKey: file.id,
      payload: { whiteboardFileId: file.id },
    },
  })
}

const createAndOpenFile = async () => {
  const file = matheshopWhiteboardFiles.createFile()
  await openFile(file.id)
}

const renameFile = (fileId: string, currentTitle: string) => {
  const next = window.prompt('输入新的白板名称', currentTitle)
  if (!next) {
    return
  }
  matheshopWhiteboardFiles.renameFile(fileId, next)
}

onMounted(() => {
  unsubscribe = matheshopWhiteboardFiles.subscribe((next) => {
    files.value = next
  })
})

onBeforeUnmount(() => {
  unsubscribe?.()
})
</script>