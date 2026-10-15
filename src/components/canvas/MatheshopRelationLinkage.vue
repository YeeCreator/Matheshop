<template>
  <div class="matheshop-linkage">
    <header class="matheshop-linkage__bar">
      <strong>矩阵 ↔ 网络联动</strong>
      <span class="matheshop-linkage__hint">{{ focusHint }}</span>
      <button type="button" :disabled="!focus" @click="clearFocus">清除高亮</button>
    </header>

    <div class="matheshop-linkage__panes">
      <section class="matheshop-linkage__pane matheshop-linkage__pane--matrix">
        <h4>矩阵视图（代数视角）</h4>
        <p class="matheshop-linkage__note">行＝源 i（出邻域）· 列＝目标 j（入邻域）</p>
        <div class="matheshop-linkage__table">
          <table>
            <thead>
              <tr>
                <th class="matheshop-linkage__corner">i \ j</th>
                <th
                  v-for="j in indices"
                  :key="`h${j}`"
                  :class="{ 'is-hot': highlight.columns.has(j) }"
                  @click="focusColumn(j)"
                >
                  {{ j }}
                </th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="i in indices" :key="`r${i}`" :class="{ 'is-hot': highlight.rows.has(i) }">
                <th @click="focusRow(i)">{{ i }}</th>
                <td
                  v-for="j in indices"
                  :key="`c${i}-${j}`"
                  :class="{ 'is-hot': highlight.edges.has(`${i}-${j}`) }"
                  @click="focusCell(i, j)"
                >
                  {{ cellText(i, j) }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section class="matheshop-linkage__pane">
        <h4>网络视图（拓扑视角）</h4>
        <p class="matheshop-linkage__note">节点＝个体 · 有向边 i→j（点击节点看双向）</p>
        <svg class="matheshop-linkage__graph" :viewBox="`0 0 ${graphSize} ${graphSize}`">
          <line
            v-for="edge in network.edges"
            :key="`e${edge.i}-${edge.j}`"
            :x1="nodePos(edge.i).x"
            :y1="nodePos(edge.i).y"
            :x2="nodePos(edge.j).x"
            :y2="nodePos(edge.j).y"
            :class="{ 'is-hot': highlight.edges.has(`${edge.i}-${edge.j}`) }"
            class="matheshop-linkage__edge"
            marker-end="url(#arrowhead)"
          />
          <defs>
            <marker id="arrowhead" markerWidth="8" markerHeight="8" refX="20" refY="3" orient="auto">
              <path d="M0,0 L0,6 L7,3 z" fill="currentColor" opacity="0.45" />
            </marker>
          </defs>
          <g v-for="node in network.nodes" :key="`n${node}`">
            <circle
              :cx="nodePos(node).x"
              :cy="nodePos(node).y"
              r="16"
              :class="{ 'is-hot': highlight.nodes.has(node) }"
              class="matheshop-linkage__node"
              @click="focusNode(node)"
            />
            <text :x="nodePos(node).x" :y="nodePos(node).y + 4" text-anchor="middle" class="matheshop-linkage__label">
              {{ node }}
            </text>
          </g>
        </svg>
      </section>
    </div>

    <footer v-if="focus && focusEdgeLabels.length" class="matheshop-linkage__labels">
      <span v-for="item in focusEdgeLabels" :key="item">{{ item }}</span>
    </footer>
  </div>
</template>

<script setup lang="ts">
/**
 * 矩阵 ↔ 网络双视图联动组件（范式二首个样板 · T4）。
 *
 * 底层为**同一份关系数据** `{ i, j, weight, label }`，投影为两种视图：
 * 矩阵（代数视角）与网络图（拓扑视角），**双向联动高亮**。
 * 数据经 Props 注入（宿主可先给 mock，待 ME 就绪后切真实数据）；本组件不发网络请求。
 */
import { computed, ref, toRef } from 'vue'
import {
  highlightFor,
  projectMatrix,
  projectNetwork,
  type RelationDatum,
} from '../../core/relationData'

const props = defineProps<{
  /** 契约3 关系数据单源。 */
  relations: RelationDatum[]
}>()

const relations = toRef(props, 'relations')
const focus = ref<Parameters<typeof highlightFor>[1]>(null)

const matrix = computed(() => projectMatrix(relations.value))
const network = computed(() => projectNetwork(relations.value))
const indices = computed(() => matrix.value.indices)
const highlight = computed(() => highlightFor(relations.value, focus.value))

const graphSize = 320
const radius = 118

/** 节点按索引均分圆周（拓扑视角的稳定布局）。 */
const nodePos = (node: number): { x: number; y: number } => {
  const list = network.value.nodes
  const order = Math.max(1, list.indexOf(node))
  const angle = (order / Math.max(1, list.length)) * Math.PI * 2 - Math.PI / 2
  return { x: graphSize / 2 + radius * Math.cos(angle), y: graphSize / 2 + radius * Math.sin(angle) }
}

const cellText = (i: number, j: number) => {
  const value = matrix.value.weight(i, j)
  return value === undefined ? '' : String(value)
}

const focusRow = (index: number) => {
  focus.value = focus.value?.kind === 'row' && focus.value.index === index ? null : { kind: 'row', index }
}
const focusColumn = (index: number) => {
  focus.value = focus.value?.kind === 'column' && focus.value.index === index ? null : { kind: 'column', index }
}
const focusCell = (i: number, j: number) => {
  focus.value = { kind: 'row', index: i }
  void j
}
const focusNode = (index: number) => {
  focus.value = focus.value?.kind === 'node' && focus.value.index === index ? null : { kind: 'node', index }
}
const clearFocus = () => {
  focus.value = null
}

const focusHint = computed(() => {
  const current = focus.value
  if (!current) return '点击矩阵行/列或网络节点，两视图同步高亮'
  if (current.kind === 'row') return `行 ${current.index}（出邻域）`
  if (current.kind === 'column') return `列 ${current.index}（入邻域）`
  return `节点 ${current.index}（双向）`
})

/** 高亮边携带的标签（如「弱影响」），附于底栏。 */
const focusEdgeLabels = computed(() =>
  relations.value
    .filter((relation) => highlight.value.edges.has(`${relation.i}-${relation.j}`) && relation.label)
    .map((relation) => `${relation.i}→${relation.j}：${relation.label}`),
)
</script>

<style scoped>
.matheshop-linkage { display: flex; flex-direction: column; gap: 8px; font-size: 12px; }
.matheshop-linkage__bar { display: flex; align-items: center; gap: 8px; }
.matheshop-linkage__hint { color: #6b6a5e; }
.matheshop-linkage__panes { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.matheshop-linkage__pane { border: 1px solid #e4e2d4; border-radius: 6px; padding: 8px; }
.matheshop-linkage__note { margin: 2px 0 6px; color: #8b846b; font-size: 11px; }
.matheshop-linkage__table { max-height: 240px; overflow: auto; }
.matheshop-linkage__table table { border-collapse: collapse; font-variant-numeric: tabular-nums; }
.matheshop-linkage__table th, .matheshop-linkage__table td {
  border: 1px solid #e4e2d4; min-width: 26px; height: 22px; text-align: center; cursor: pointer; padding: 0 4px;
}
.matheshop-linkage__corner { background: #f7f6ec; cursor: default; }
.matheshop-linkage__table tbody th { background: #f7f6ec; }
.matheshop-linkage__table .is-hot { background: #ffe9a3; }
.matheshop-linkage__graph { width: 100%; height: 260px; }
.matheshop-linkage__edge { stroke: currentColor; stroke-width: 1.2; opacity: 0.35; }
.matheshop-linkage__edge.is-hot { stroke: #b8860b; stroke-width: 2.4; opacity: 1; }
.matheshop-linkage__node { fill: #fff; stroke: currentColor; stroke-width: 1.4; cursor: pointer; }
.matheshop-linkage__node.is-hot { fill: #ffe9a3; stroke: #b8860b; stroke-width: 2.2; }
.matheshop-linkage__label { font-size: 11px; pointer-events: none; }
.matheshop-linkage__labels { display: flex; flex-wrap: wrap; gap: 8px; color: #6b6a5e; }
</style>
