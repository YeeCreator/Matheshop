<template>
  <section class="matheshop-files">
    <header class="matheshop-files__header">
      <div>
        <h2>计算白板文件</h2>
        <p>每个白板文件都可以独立打开成一个白板标签页。</p>
      </div>
      <button type="button" @click="createAndOpenFile">新建白板</button>
    </header>

    <TableView
      :columns="fileColumns"
      :rows="fileRows"
      :editable="false"
      row-key="id"
      :selected-row-id="null"
      :row-height="28"
      @row-select="onRowSelect"
    />
  </section>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, shallowRef } from 'vue'
import { useWorkbench } from 'main-ui/vue'
import { TableView, type TableColumn, type TableRow } from '@main-ui/view-table'
import { MATHESHOP_CANVAS_EDITOR_KIND, MATHESHOP_CANVAS_GROUP_ID, MATHESHOP_CANVAS_WORKSPACE_ID } from '../core/workbenchConstants'
import { matheshopWhiteboardFiles, type MatheshopWhiteboardFileSummary } from '../core/whiteboardFiles'

const { dispatch, document } = useWorkbench()
const files = shallowRef<MatheshopWhiteboardFileSummary[]>(matheshopWhiteboardFiles.listFiles())
let unsubscribe: (() => void) | null = null

const formatDate = (value: string) => new Date(value).toLocaleString()

/** view-table 列定义。 */
const fileColumns: TableColumn[] = [
  { key: 'title', title: '名称', sortable: true },
  { key: 'updatedAt', title: '最近更新', width: 200, sortable: true },
  { key: 'createdAt', title: '创建时间', width: 200, sortable: true },
]

/** 把文件摘要映射为 view-table 行数据。 */
const fileRows = computed<TableRow[]>(() =>
  files.value.map((file) => ({
    id: file.id,
    title: file.title,
    updatedAt: formatDate(file.updatedAt),
    createdAt: formatDate(file.createdAt),
  })),
)

/** 双击行打开白板文件。 */
const onRowSelect = (rowId: string) => {
  openFile(rowId)
}

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