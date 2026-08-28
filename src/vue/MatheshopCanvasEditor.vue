<template>
  <FlowGraphEditorSurface :document="graphDocument" :view-box="viewBox">
    <template #left>
      <div class="matheshop-side-content">
        <h2>工具</h2>
        <button class="matheshop-tool-button is-active" type="button">文本/公式</button>
        <button class="matheshop-tool-button" :class="{ 'is-active': snapshot.linkMode }" type="button" @click="toggleLinkMode">连线</button>
        <label class="matheshop-color-field">
          <span>颜色</span>
          <input type="color" :value="snapshot.color" @input="setColor" />
        </label>
        <button class="matheshop-tool-button" type="button" @click="clearBoard">清空</button>
      </div>
    </template>

    <template #toolbarLeading>
      <strong>Matheshop</strong>
    </template>

    <template #toolbarCenter>
      <span class="matheshop-toolbar-status">{{ snapshot.statusMessage }}</span>
    </template>

    <template #toolbarTrailing>
      <button type="button" :disabled="!snapshot.selectedCellId" @click="evaluateSelected">求值</button>
    </template>

    <template #world="{ camera, bridge }">
      <div class="matheshop-world" @dblclick.self="onCanvasDoubleClick($event, camera, bridge)">
        <article
          v-for="cell in snapshot.cells"
          :key="cell.id"
          class="matheshop-cell"
          :class="cellClass(cell.id)"
          :style="cellStyle(cell)"
          @click.stop="onCellClick(cell.id)"
          @dblclick.stop="beginEditing(cell.id)"
          @pointerdown.stop="onCellPointerDown($event, cell, camera, bridge)"
        >
          <header class="matheshop-cell__header">
            <span>#{{ cell.seq }}</span>
            <span v-if="snapshot.linkMode && snapshot.linkFromCellId === cell.id">起点</span>
          </header>

          <textarea
            v-if="snapshot.editingCellId === cell.id"
            class="matheshop-cell__editor"
            :value="snapshot.editingDraft"
            @input="updateDraft"
            @keydown="onEditorKeydown"
            @pointerdown.stop
          />
          <div v-else class="matheshop-cell__content" v-html="renderCell(cell)" />

          <button
            v-if="snapshot.selectedCellId === cell.id"
            class="matheshop-cell__resize"
            type="button"
            title="调整大小"
            @pointerdown.stop="onResizePointerDown($event, cell, camera, bridge)"
          />
        </article>
      </div>
    </template>

    <template #right>
      <div class="matheshop-side-content">
        <h2>Inspector</h2>
        <template v-if="selectedCell">
          <p>单元框 #{{ selectedCell.seq }}</p>
          <dl>
            <dt>位置</dt>
            <dd>{{ Math.round(selectedCell.position.x) }}, {{ Math.round(selectedCell.position.y) }}</dd>
            <dt>尺寸</dt>
            <dd>{{ Math.round(selectedCell.size.w) }} x {{ Math.round(selectedCell.size.h) }}</dd>
            <dt>引擎</dt>
            <dd>{{ snapshot.engineSelection.choice }}</dd>
          </dl>
          <button type="button" @click="deleteSelected">删除选中</button>
        </template>
        <p v-else>未选中单元框。</p>

        <h2>历史记录</h2>
        <textarea class="matheshop-history" readonly :value="historyText" />
      </div>
    </template>
  </FlowGraphEditorSurface>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, shallowRef, watch } from 'vue'
import type { EditorRenderContext } from 'main-ui/core'
import { useWorkbench } from 'main-ui/vue'
import type { Viewport2DCamera } from 'viewport-2d-kit/core'
import type { ViewportHostBridge } from 'viewport-2d-kit/vue'
import { FlowGraphEditorSurface } from 'flow-graph-kit-vue'
import { renderBlocksToHtml } from '../core/blocks'
import type { MatheshopBoardCore, MatheshopBoardSnapshot } from '../core/boardCore'
import type { MatheshopCell, MatheshopEdge, Vec2 } from '../core/matheshopTypes'
import { createMatheshopGraphEditorDocument } from '../adapters/flowGraphKitAdapter'
import { matheshopWhiteboardFiles } from '../core/whiteboardFiles'
import { MATHESHOP_BOARD_COMMAND_EVENT, type MatheshopBoardCommandDetail } from '../core/boardCommands'

const props = defineProps<{ context: EditorRenderContext }>()
const { document } = useWorkbench()

const resolveWhiteboardFileId = (context: EditorRenderContext) => {
  const fileId = context.editor.payload?.whiteboardFileId
  return typeof fileId === 'string' ? fileId : matheshopWhiteboardFiles.ensureBootstrapFile().id
}

const activeBoard = shallowRef<MatheshopBoardCore>(matheshopWhiteboardFiles.getBoard(resolveWhiteboardFileId(props.context)))
const snapshot = shallowRef<MatheshopBoardSnapshot>(activeBoard.value.getSnapshot())
const viewBox = { x: 0, y: 0, width: 2200, height: 1400 }
const graphDocument = computed(() => createMatheshopGraphEditorDocument(snapshot.value))

let unsubscribe: (() => void) | null = null
let dragState: null | { id: string; startClient: Vec2; startPosition: Vec2; bridge: ViewportHostBridge; camera: Viewport2DCamera } = null
let resizeState: null | { id: string; startClient: Vec2; startSize: { w: number; h: number }; bridge: ViewportHostBridge; camera: Viewport2DCamera } = null

const selectedCell = computed(() => snapshot.value.cells.find((cell) => cell.id === snapshot.value.selectedCellId) ?? null)
const historyText = computed(() => snapshot.value.history.length === 0 ? '暂无' : snapshot.value.history.map((entry) => entry.label).join('\n'))

const connectBoard = (fileId: string) => {
  unsubscribe?.()
  const board = matheshopWhiteboardFiles.getBoard(fileId)
  activeBoard.value = board
  snapshot.value = board.getSnapshot()
  unsubscribe = board.subscribe((next) => {
    snapshot.value = next
  })
}

const renderCell = (cell: MatheshopCell) => renderBlocksToHtml(cell.blocks)

const cellStyle = (cell: MatheshopCell) => ({
  left: `${cell.position.x}px`,
  top: `${cell.position.y}px`,
  width: `${cell.size.w}px`,
  height: `${cell.size.h}px`,
  color: cell.color,
})

const cellClass = (cellId: string) => ({
  'is-selected': snapshot.value.selectedCellId === cellId,
  'is-link-source': snapshot.value.linkFromCellId === cellId,
})

const onCanvasDoubleClick = (event: MouseEvent, camera: Viewport2DCamera, bridge: ViewportHostBridge) => {
  const world = bridge.clientEventToWorld(camera, event)
  activeBoard.value.addCell({ x: world.x - 120, y: world.y - 56 })
  void nextTick(() => focusActiveEditor())
}

const onCellClick = (cellId: string) => {
  activeBoard.value.handleCellLinkClick(cellId)
}

const beginEditing = (cellId: string) => {
  activeBoard.value.beginEditing(cellId)
  void nextTick(() => focusActiveEditor())
}

const focusActiveEditor = () => {
  const editor = document.querySelector<HTMLTextAreaElement>('.matheshop-cell__editor')
  editor?.focus()
  editor?.select()
}

const onCellPointerDown = (event: PointerEvent, cell: MatheshopCell, camera: Viewport2DCamera, bridge: ViewportHostBridge) => {
  if (event.button !== 0 || snapshot.value.editingCellId === cell.id || snapshot.value.linkMode) return
  activeBoard.value.selectCell(cell.id)
  dragState = {
    id: cell.id,
    startClient: { x: event.clientX, y: event.clientY },
    startPosition: { ...cell.position },
    bridge,
    camera,
  }
  window.addEventListener('pointermove', onWindowPointerMove)
  window.addEventListener('pointerup', onWindowPointerUp, { once: true })
}

const onResizePointerDown = (event: PointerEvent, cell: MatheshopCell, camera: Viewport2DCamera, bridge: ViewportHostBridge) => {
  resizeState = {
    id: cell.id,
    startClient: { x: event.clientX, y: event.clientY },
    startSize: { ...cell.size },
    bridge,
    camera,
  }
  window.addEventListener('pointermove', onWindowPointerMove)
  window.addEventListener('pointerup', onWindowPointerUp, { once: true })
}

const onWindowPointerMove = (event: PointerEvent) => {
  if (dragState) {
    const delta = dragState.bridge.screenDeltaToWorld(dragState.camera, {
      x: event.clientX - dragState.startClient.x,
      y: event.clientY - dragState.startClient.y,
    })
    activeBoard.value.moveCell(dragState.id, {
      x: dragState.startPosition.x + delta.x,
      y: dragState.startPosition.y + delta.y,
    })
  }

  if (resizeState) {
    const delta = resizeState.bridge.screenDeltaToWorld(resizeState.camera, {
      x: event.clientX - resizeState.startClient.x,
      y: event.clientY - resizeState.startClient.y,
    })
    activeBoard.value.resizeCell(resizeState.id, {
      w: resizeState.startSize.w + delta.x,
      h: resizeState.startSize.h + delta.y,
    })
  }
}

const onWindowPointerUp = () => {
  dragState = null
  resizeState = null
  window.removeEventListener('pointermove', onWindowPointerMove)
}

const updateDraft = (event: Event) => {
  activeBoard.value.updateEditingDraft((event.target as HTMLTextAreaElement).value)
}

const onEditorKeydown = (event: KeyboardEvent) => {
  if (event.key === 'Escape') {
    event.preventDefault()
    activeBoard.value.cancelEditing()
    return
  }

  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault()
    activeBoard.value.commitEditing()
    if (event.ctrlKey || event.metaKey) {
      void activeBoard.value.evaluateSelected()
    }
  }
}

const onGlobalKeydown = (event: KeyboardEvent) => {
  if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return
  if (event.key === 'Escape') {
    activeBoard.value.cancelEditing()
  }
}

/** 判断当前激活的 editor 是否为本实例，避免多个白板标签页同时响应全局命令。 */
const isActiveEditor = () => {
  const workspace = document.value.workspaceStates[document.value.activeWorkspaceId]
  if (!workspace) return false
  const group = workspace.layout.groups[workspace.layout.activeGroupId ?? '']
  const activeTabId = group?.activeTabId
  if (!activeTabId) return false
  const activeTab = workspace.tabs[activeTabId]
  return activeTab?.editorInstanceId === props.context.editor.id
}

/** 消费 main-ui command 体系广播的画布命令，本地不再自行监听快捷键。 */
const onBoardCommandEvent = (event: Event) => {
  if (!isActiveEditor()) return
  const command = (event as CustomEvent<MatheshopBoardCommandDetail>).detail?.command
  switch (command) {
    case 'clear':
      clearBoard()
      break
    case 'toggleLinkMode':
      toggleLinkMode()
      break
    case 'deleteSelected':
      deleteSelected()
      break
    case 'evaluate':
      evaluateSelected()
      break
  }
}

const setColor = (event: Event) => {
  activeBoard.value.setColor((event.target as HTMLInputElement).value)
}

const clearBoard = () => activeBoard.value.clear()
const deleteSelected = () => activeBoard.value.deleteSelected()
const toggleLinkMode = () => activeBoard.value.toggleLinkMode()
const evaluateSelected = () => void activeBoard.value.evaluateSelected()

onMounted(() => {
  connectBoard(resolveWhiteboardFileId(props.context))
  window.addEventListener('keydown', onGlobalKeydown)
  window.addEventListener(MATHESHOP_BOARD_COMMAND_EVENT, onBoardCommandEvent)
})

watch(
  () => resolveWhiteboardFileId(props.context),
  (fileId) => {
    connectBoard(fileId)
  },
)

onBeforeUnmount(() => {
  unsubscribe?.()
  window.removeEventListener('keydown', onGlobalKeydown)
  window.removeEventListener(MATHESHOP_BOARD_COMMAND_EVENT, onBoardCommandEvent)
  window.removeEventListener('pointermove', onWindowPointerMove)
})
</script>