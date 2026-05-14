<template>
  <div class="matheshop-editor">
    <aside class="matheshop-panel matheshop-panel--tools">
      <h2>工具</h2>
      <button class="matheshop-tool-button is-active" type="button">文本/公式</button>
      <button class="matheshop-tool-button" :class="{ 'is-active': snapshot.linkMode }" type="button" @click="toggleLinkMode">连线</button>
      <label class="matheshop-color-field">
        <span>颜色</span>
        <input type="color" :value="snapshot.color" @input="setColor" />
      </label>
      <button class="matheshop-tool-button" type="button" @click="clearBoard">清空</button>
    </aside>

    <section class="matheshop-stage">
      <div class="matheshop-stage__toolbar">
        <strong>Matheshop</strong>
        <span>{{ snapshot.statusMessage }}</span>
        <button type="button" :disabled="!snapshot.selectedCellId" @click="evaluateSelected">求值</button>
      </div>

      <div ref="viewportHost" class="matheshop-viewport-host">
        <Viewport2D
          :view-box="viewBox"
          background="#fbfbfd"
          :padding-px="80"
          :min-scale-factor="0.08"
          :max-scale-factor="64"
          :wheel-zoom-speed="0.0028"
          :wheel-pan-speed="1"
          hold-to-pan-key="space"
          :style="viewportStyle"
        >
          <template #default="{ camera }">
            <div class="matheshop-world" :style="worldStyle" @dblclick.self="onCanvasDoubleClick($event, camera)">
              <svg class="matheshop-edge-layer" :viewBox="viewBoxText" aria-hidden="true">
                <path v-for="edge in snapshot.edges" :key="edge.id" class="matheshop-edge" :d="edgePath(edge)" />
              </svg>

              <article
                v-for="cell in snapshot.cells"
                :key="cell.id"
                class="matheshop-cell"
                :class="cellClass(cell.id)"
                :style="cellStyle(cell)"
                @click.stop="onCellClick(cell.id)"
                @dblclick.stop="beginEditing(cell.id)"
                @pointerdown.stop="onCellPointerDown($event, cell, camera)"
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
                  @pointerdown.stop="onResizePointerDown($event, cell, camera)"
                />
              </article>
            </div>
          </template>
        </Viewport2D>
      </div>
    </section>

    <aside class="matheshop-panel matheshop-panel--inspector">
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
    </aside>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, shallowRef } from 'vue'
import type { Viewport2DCamera } from 'viewport-2d-kit/core'
import { screenToWorld } from 'viewport-2d-kit/core'
import { Viewport2D } from 'viewport-2d-kit/vue'
import { renderBlocksToHtml } from '../core/blocks'
import type { MatheshopBoardSnapshot } from '../core/boardCore'
import type { MatheshopCell, MatheshopEdge, Vec2 } from '../core/matheshopTypes'
import { matheshopBoard } from '../core/workbench'

const snapshot = shallowRef<MatheshopBoardSnapshot>(matheshopBoard.getSnapshot())
const viewportHost = shallowRef<HTMLDivElement | null>(null)
const viewBox = { x: 0, y: 0, width: 2200, height: 1400 }
const viewportStyle = { width: '100%', height: '100%' }
const worldStyle = { width: `${viewBox.width}px`, height: `${viewBox.height}px` }
const viewBoxText = `${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`

let unsubscribe: (() => void) | null = null
let dragState: null | { id: string; startClient: Vec2; startPosition: Vec2; scale: number } = null
let resizeState: null | { id: string; startClient: Vec2; startSize: { w: number; h: number }; scale: number } = null

const selectedCell = computed(() => snapshot.value.cells.find((cell) => cell.id === snapshot.value.selectedCellId) ?? null)
const historyText = computed(() => snapshot.value.history.length === 0 ? '暂无' : snapshot.value.history.map((entry) => entry.label).join('\n'))

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

const cellCenter = (cellId: string) => {
  const cell = snapshot.value.cells.find((item) => item.id === cellId)
  if (!cell) return null
  return { x: cell.position.x + cell.size.w / 2, y: cell.position.y + cell.size.h / 2 }
}

const edgePath = (edge: MatheshopEdge) => {
  const from = cellCenter(edge.from)
  const to = cellCenter(edge.to)
  if (!from || !to) return ''
  const dx = Math.abs(to.x - from.x)
  const c1 = { x: from.x + dx * 0.42, y: from.y }
  const c2 = { x: to.x - dx * 0.42, y: to.y }
  return `M ${from.x} ${from.y} C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${to.x} ${to.y}`
}

const clientToWorld = (event: MouseEvent | PointerEvent, camera: Viewport2DCamera): Vec2 => {
  const rect = viewportHost.value?.getBoundingClientRect()
  if (!rect) return { x: 0, y: 0 }
  return screenToWorld(camera, { x: event.clientX - rect.left, y: event.clientY - rect.top })
}

const onCanvasDoubleClick = (event: MouseEvent, camera: Viewport2DCamera) => {
  const world = clientToWorld(event, camera)
  matheshopBoard.addCell({ x: world.x - 120, y: world.y - 56 })
  void nextTick(() => focusActiveEditor())
}

const onCellClick = (cellId: string) => {
  matheshopBoard.handleCellLinkClick(cellId)
}

const beginEditing = (cellId: string) => {
  matheshopBoard.beginEditing(cellId)
  void nextTick(() => focusActiveEditor())
}

const focusActiveEditor = () => {
  const editor = viewportHost.value?.querySelector<HTMLTextAreaElement>('.matheshop-cell__editor')
  editor?.focus()
  editor?.select()
}

const onCellPointerDown = (event: PointerEvent, cell: MatheshopCell, camera: Viewport2DCamera) => {
  if (event.button !== 0 || snapshot.value.editingCellId === cell.id || snapshot.value.linkMode) return
  matheshopBoard.selectCell(cell.id)
  dragState = {
    id: cell.id,
    startClient: { x: event.clientX, y: event.clientY },
    startPosition: { ...cell.position },
    scale: camera.scale,
  }
  window.addEventListener('pointermove', onWindowPointerMove)
  window.addEventListener('pointerup', onWindowPointerUp, { once: true })
}

const onResizePointerDown = (event: PointerEvent, cell: MatheshopCell, camera: Viewport2DCamera) => {
  resizeState = {
    id: cell.id,
    startClient: { x: event.clientX, y: event.clientY },
    startSize: { ...cell.size },
    scale: camera.scale,
  }
  window.addEventListener('pointermove', onWindowPointerMove)
  window.addEventListener('pointerup', onWindowPointerUp, { once: true })
}

const onWindowPointerMove = (event: PointerEvent) => {
  if (dragState) {
    matheshopBoard.moveCell(dragState.id, {
      x: dragState.startPosition.x + (event.clientX - dragState.startClient.x) / dragState.scale,
      y: dragState.startPosition.y + (event.clientY - dragState.startClient.y) / dragState.scale,
    })
  }

  if (resizeState) {
    matheshopBoard.resizeCell(resizeState.id, {
      w: resizeState.startSize.w + (event.clientX - resizeState.startClient.x) / resizeState.scale,
      h: resizeState.startSize.h + (event.clientY - resizeState.startClient.y) / resizeState.scale,
    })
  }
}

const onWindowPointerUp = () => {
  dragState = null
  resizeState = null
  window.removeEventListener('pointermove', onWindowPointerMove)
}

const updateDraft = (event: Event) => {
  matheshopBoard.updateEditingDraft((event.target as HTMLTextAreaElement).value)
}

const onEditorKeydown = (event: KeyboardEvent) => {
  if (event.key === 'Escape') {
    event.preventDefault()
    matheshopBoard.cancelEditing()
    return
  }

  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault()
    matheshopBoard.commitEditing()
    if (event.ctrlKey || event.metaKey) {
      void matheshopBoard.evaluateSelected()
    }
  }
}

const onGlobalKeydown = (event: KeyboardEvent) => {
  if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return
  if (event.key === 'Delete' || event.key === 'Backspace') {
    matheshopBoard.deleteSelected()
  }
  if (event.key.toLowerCase() === 'l') {
    matheshopBoard.toggleLinkMode()
  }
}

const setColor = (event: Event) => {
  matheshopBoard.setColor((event.target as HTMLInputElement).value)
}

const clearBoard = () => matheshopBoard.clear()
const deleteSelected = () => matheshopBoard.deleteSelected()
const toggleLinkMode = () => matheshopBoard.toggleLinkMode()
const evaluateSelected = () => void matheshopBoard.evaluateSelected()

onMounted(() => {
  unsubscribe = matheshopBoard.subscribe((next) => {
    snapshot.value = next
  })
  window.addEventListener('keydown', onGlobalKeydown)
})

onBeforeUnmount(() => {
  unsubscribe?.()
  window.removeEventListener('keydown', onGlobalKeydown)
  window.removeEventListener('pointermove', onWindowPointerMove)
})
</script>