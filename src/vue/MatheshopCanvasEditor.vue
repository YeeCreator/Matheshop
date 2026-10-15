<template>
  <MatheshopCanvasSurface :cells="surfaceCells" :edges="surfaceEdges" :view-box="viewBox">
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
          <InspectorView
            :schema="inspectorSchema"
            :values="inspectorValues"
            @change="onInspectorChange"
          />
          <button type="button" @click="deleteSelected">删除选中</button>
        </template>
        <p v-else>未选中单元框。</p>

        <h2>历史记录</h2>
        <ConsoleView
          :entries="historyEntries"
          :clear-enabled="false"
          :row-height="20"
        />

        <h2>联动样板（T4）</h2>
        <label class="matheshop-linkage-toggle">
          <input type="checkbox" :checked="showLinkageDemo" @change="toggleLinkageDemo" />
          <span>显示矩阵↔网络联动（mock 数据）</span>
        </label>
        <MatheshopRelationLinkage v-if="showLinkageDemo" :relations="MOCK_RELATIONS" />

        <SymbolPanel :highlight-id="highlightSymbolId" />
        <label class="matheshop-linkage-toggle">
          <input type="checkbox" :checked="showFormulaDemo" @change="toggleFormulaDemo" />
          <span>显示公式锚点（T5 · 点变量查符号表）</span>
        </label>
        <FormulaView
          v-if="showFormulaDemo"
          :latex="FORMULA_DEMO"
          :anchors="formulaAnchors"
          @anchor-hover="onAnchorHover"
          @anchor-click="onAnchorClick"
        />
      </div>
    </template>
  </MatheshopCanvasSurface>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import type { EditorRenderContext } from 'main-ui/core'
import { useWorkbench } from 'main-ui/vue'
import { InspectorView, type InspectorSchema, type InspectorChangePayload } from '@main-ui/view-inspector'
import { ConsoleView, type ConsoleEntry } from '@main-ui/view-console'
import type { Camera2D } from '@main-ui/core/rendering'
import MatheshopCanvasSurface, { type CanvasBridge } from '../components/canvas/MatheshopCanvasSurface.vue'
import MatheshopRelationLinkage from '../components/canvas/MatheshopRelationLinkage.vue'
import { SymbolPanel } from '../components/canvas/MatheshopSymbolPanel'
import { FormulaView, type FormulaAnchorIntent } from '@main-ui/view-formula'
import { renderBlocksToHtml, renderConceptIcon } from '../core/blocks'
import type { MatheshopBoardCore, MatheshopBoardSnapshot } from '../core/boardCore'
import type { CellKind, ConceptShape, MatheshopCell, MatheshopEdge, Vec2 } from '../core/matheshopTypes'
import type { RelationDatum } from '../core/relationData'
import { deriveAnchors, matheshopSymbols } from '../core/symbolTable'
import { matheshopWhiteboardFiles } from '../core/whiteboardFiles'
import { MATHESHOP_BOARD_COMMAND_EVENT, type MatheshopBoardCommandDetail } from '../core/boardCommands'
import { MATHESHOP_ENGINE_CHOICES } from '../core/workbenchConstants'

const props = defineProps<{ context: EditorRenderContext }>()
const { document } = useWorkbench()

/** T4 联动样板开关（mock 数据先行；待 ME P3 就绪后切真实数据源）。 */
const showLinkageDemo = ref(false)
const toggleLinkageDemo = (event: Event) => {
  showLinkageDemo.value = (event.target as HTMLInputElement).checked
}

/** 契约3 mock 关系数据：4 个体、6 条有向关系（示范双向联动）。 */
const MOCK_RELATIONS: RelationDatum[] = [
  { i: 0, j: 1, weight: 2, label: '强影响' },
  { i: 0, j: 2, weight: 1 },
  { i: 1, j: 2, weight: 3 },
  { i: 2, j: 0, weight: 1.5 },
  { i: 2, j: 3, weight: 2 },
  { i: 3, j: 1, weight: 1, label: '弱影响' },
]

/** T5 公式锚点样板：符号表 + 公式内变量联动。 */
const showFormulaDemo = ref(false)
const highlightSymbolId = ref<string | null>(null)
const FORMULA_DEMO = 'A_{ij} = \\sum_{k} x_k \\cdot b_j'
const toggleFormulaDemo = (event: Event) => {
  showFormulaDemo.value = (event.target as HTMLInputElement).checked
}

/** 预置符号（mock；对齐契约4 的 id/别名/作用域三要素）。 */
matheshopSymbols.replaceAll([
  { id: 'sym:A', name: 'A', aliases: ['adjacency', '邻接矩阵'], scope: 'global', description: '邻接矩阵：a_ij 表示 i→j 的影响' },
  { id: 'sym:x', name: 'x', aliases: ['变量 x'], scope: 'global', description: '自变量' },
  { id: 'sym:b', name: 'b', aliases: ['偏置'], scope: 'global', description: '偏置项' },
])

const formulaAnchors = computed(() => deriveAnchors(FORMULA_DEMO, matheshopSymbols))
const onAnchorHover = (intent: FormulaAnchorIntent) => {
  highlightSymbolId.value = intent.symbolId
}
const onAnchorClick = (intent: FormulaAnchorIntent) => {
  highlightSymbolId.value = intent.symbolId
  const entry = matheshopSymbols.find(intent.symbolId)
  console.info('[T5] 公式变量命中符号：', entry?.name ?? intent.name, '→', intent.symbolId)
}

const resolveWhiteboardFileId = (context: EditorRenderContext) => {
  const fileId = context.editor.payload?.whiteboardFileId
  return typeof fileId === 'string' ? fileId : matheshopWhiteboardFiles.ensureBootstrapFile().id
}

const activeBoard = shallowRef<MatheshopBoardCore>(matheshopWhiteboardFiles.getBoard(resolveWhiteboardFileId(props.context)))
const snapshot = shallowRef<MatheshopBoardSnapshot>(activeBoard.value.getSnapshot())
const viewBox = { x: 0, y: 0, width: 2200, height: 1400 }
const surfaceCells = computed(() => snapshot.value.cells.map((cell) => ({
  id: cell.id,
  x: cell.position.x,
  y: cell.position.y,
  width: cell.size.w,
  height: cell.size.h,
})))
const surfaceEdges = computed(() => snapshot.value.edges.map((edge) => ({ id: edge.id, source: edge.from, target: edge.to })))

let unsubscribe: (() => void) | null = null
let dragState: null | { id: string; startClient: Vec2; startPosition: Vec2; bridge: CanvasBridge; camera: Camera2D } = null
let resizeState: null | { id: string; startClient: Vec2; startSize: { w: number; h: number }; bridge: CanvasBridge; camera: Camera2D } = null

const selectedCell = computed(() => snapshot.value.cells.find((cell) => cell.id === snapshot.value.selectedCellId) ?? null)
const historyText = computed(() => snapshot.value.history.length === 0 ? '暂无' : snapshot.value.history.map((entry) => entry.label).join('\n'))

/** 把白板历史映射为 view-console 条目（FR-452 配套）。 */
const historyEntries = computed<ConsoleEntry[]>(() =>
  [...snapshot.value.history].reverse().map((entry) => ({
    id: entry.id,
    level: 'info',
    message: entry.label,
    timestamp: new Date(entry.createdAt).getTime(),
  })),
)

/** 契约1 · 可选知识单元类型（Inspector 下拉项）。 */
const CONCEPT_KIND_OPTIONS: CellKind[] = [
  'Definition', 'Axiom', 'Lemma', 'Theorem', 'Corollary', 'Proof',
  'Example', 'CounterExample', 'Exercise', 'ConceptSketch', 'VisualModel',
]

/** view-inspector schema：单元框属性检视字段（FR-452）。 */
const inspectorSchema: InspectorSchema = [
  { kind: 'number', key: 'seq', label: '序号', min: 1, step: 1 },
  {
    kind: 'select',
    key: 'kind',
    label: '类型',
    options: [
      { value: '', label: '（无）' },
      ...CONCEPT_KIND_OPTIONS.map((k) => ({ value: k, label: k })),
    ],
  },
  { kind: 'number', key: 'density', label: '语义密度', min: 0, max: 1, step: 0.1 },
  { kind: 'number', key: 'posX', label: '位置 X', step: 1 },
  { kind: 'number', key: 'posY', label: '位置 Y', step: 1 },
  { kind: 'number', key: 'sizeW', label: '宽度', min: 120, step: 1 },
  { kind: 'number', key: 'sizeH', label: '高度', min: 80, step: 1 },
  { kind: 'string', key: 'color', label: '颜色' },
  { kind: 'select', key: 'engine', label: '引擎', options: MATHESHOP_ENGINE_CHOICES.map((c) => ({ value: c.value, label: c.label })) },
]

/** 从选中单元框派生 Inspector 受控值表。 */
const inspectorValues = computed(() => {
  const cell = selectedCell.value
  if (!cell) return null
  return {
    seq: cell.seq,
    kind: cell.kind ?? '',
    density: cell.density ?? 1,
    posX: Math.round(cell.position.x),
    posY: Math.round(cell.position.y),
    sizeW: Math.round(cell.size.w),
    sizeH: Math.round(cell.size.h),
    color: cell.color,
    engine: snapshot.value.engineSelection.choice,
  }
})

/** 消费 Inspector 变更意图，路由到 boardCore 对应变更方法。 */
const onInspectorChange = ({ key, value }: InspectorChangePayload) => {
  const cell = selectedCell.value
  if (!cell) return
  switch (key) {
    case 'kind':
      activeBoard.value.setCellKind(cell.id, (value as string) === '' ? undefined : (value as CellKind))
      break
    case 'density':
      activeBoard.value.setCellDensity(cell.id, value as number)
      break
    case 'posX':
      activeBoard.value.moveCell(cell.id, { x: value as number, y: cell.position.y })
      break
    case 'posY':
      activeBoard.value.moveCell(cell.id, { x: cell.position.x, y: value as number })
      break
    case 'sizeW':
      activeBoard.value.resizeCell(cell.id, { w: value as number, h: cell.size.h })
      break
    case 'sizeH':
      activeBoard.value.resizeCell(cell.id, { w: cell.size.w, h: value as number })
      break
    case 'color':
      activeBoard.value.setCellColor(cell.id, value as string)
      break
    case 'engine':
      activeBoard.value.setEngineChoice(value as typeof snapshot.value.engineSelection.choice)
      break
  }
}

const connectBoard = (fileId: string) => {
  unsubscribe?.()
  const board = matheshopWhiteboardFiles.getBoard(fileId)
  activeBoard.value = board
  snapshot.value = board.getSnapshot()
  unsubscribe = board.subscribe((next) => {
    snapshot.value = next
  })
}

const renderCell = (cell: MatheshopCell) => {
  const density = cell.density ?? 1
  // 契约1 契约1 · 粒度轴：低密度（<0.5）只显概念象形图标，隐藏公式细节。
  if (density < 0.5) {
    const shape = CONCEPT_SHAPE_BY_KIND[cell.kind ?? 'ConceptSketch'] ?? 'generic'
    const icon = cell.blocks.find((block) => block.type === 'conceptIcon')
    return renderConceptIcon(
      icon && icon.type === 'conceptIcon' ? icon : { id: `icon-${cell.id}`, type: 'conceptIcon', shape },
    )
  }
  return renderBlocksToHtml(cell.blocks)
}

/** 契约1 · 知识单元类型 → 概念象形图标形态（形态只表类别）。 */
const CONCEPT_SHAPE_BY_KIND: Record<CellKind, ConceptShape> = {
  Definition: 'domain',
  Axiom: 'generic',
  Lemma: 'generic',
  Theorem: 'generic',
  Corollary: 'generic',
  Proof: 'generic',
  Example: 'network',
  CounterExample: 'network',
  Exercise: 'generic',
  ConceptSketch: 'generic',
  VisualModel: 'matrix',
}

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

const onCanvasDoubleClick = (event: MouseEvent, camera: Camera2D, bridge: CanvasBridge) => {
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

const onCellPointerDown = (event: PointerEvent, cell: MatheshopCell, camera: Camera2D, bridge: CanvasBridge) => {
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

const onResizePointerDown = (event: PointerEvent, cell: MatheshopCell, camera: Camera2D, bridge: CanvasBridge) => {
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