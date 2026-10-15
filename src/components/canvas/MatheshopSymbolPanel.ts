/**
 * 契约4 · 全局符号表面板（侧栏）+ 变量级联动的宿主装配。
 *
 * - 左侧/右侧面板列出符号条目；公式内变量点击时滚动定位并高亮该条目；
 * - 悬停显示概念简述（由 `hint` 提供）。
 */
import { defineComponent, h, onBeforeUnmount, onMounted, ref } from 'vue'
import { matheshopSymbols, type SymbolEntry, type SymbolTableSnapshot } from '../../core/symbolTable'

/**
 * SymbolPanel —— 全局符号表面板。
 *
 * 通过 `highlightId` prop 或暴露的 `focusSymbol(id)` 方法高亮并滚动到指定条目。
 */
export const SymbolPanel = defineComponent({
  name: 'SymbolPanel',
  props: {
    /** 当前高亮的符号 id（由公式变量点击驱动）。 */
    highlightId: { type: String as () => string | null, default: null },
  },
  setup(props) {
    const snapshot = ref<SymbolTableSnapshot>(matheshopSymbols.getSnapshot())
    const listRef = ref<HTMLElement | null>(null)

    let unsubscribe: (() => void) | null = null
    onMounted(() => {
      unsubscribe = matheshopSymbols.subscribe((next) => (snapshot.value = next))
    })
    onBeforeUnmount(() => unsubscribe?.())

    const scrollTo = (id: string | null) => {
      if (!id || !listRef.value) return
      const node = listRef.value.querySelector<HTMLElement>(`[data-symbol-id="${id}"]`)
      node?.scrollIntoView({ block: 'nearest' })
    }

    return () => {
      const entries: SymbolEntry[] = snapshot.value.entries
      scrollTo(props.highlightId)
      return h('div', { class: 'matheshop-symbol-panel' }, [
        h('h2', '全局符号表'),
        entries.length === 0
          ? h('p', { class: 'matheshop-symbol-panel__empty' }, '暂无符号。')
          : h(
              'ul',
              { class: 'matheshop-symbol-panel__list', ref: listRef },
              entries.map((entry) =>
                h(
                  'li',
                  {
                    key: entry.id,
                    'data-symbol-id': entry.id,
                    class: ['matheshop-symbol-panel__item', entry.id === props.highlightId ? 'is-hot' : ''],
                    title: entry.description ?? '',
                  },
                  [
                    h('span', { class: 'matheshop-symbol-panel__name' }, entry.name),
                    h('span', { class: 'matheshop-symbol-panel__scope' }, entry.scope),
                    entry.aliases.length
                      ? h('span', { class: 'matheshop-symbol-panel__alias' }, `别名：${entry.aliases.join('、')}`)
                      : null,
                  ],
                ),
              ),
            ),
      ])
    }
  },
})
