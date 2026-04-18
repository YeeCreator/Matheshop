import type { CanvasHistorySource, HistoryEntry, Tool } from '../../components/CanvasBoard'
import CanvasBoard from '../../components/CanvasBoard'
import SettingsPanel from '../../components/SettingsPanel'
import type { EngineChoice, EngineSelectionState } from '../../engine/engineSelection'

/**
 * Matheshop 剥离层内容路由参数。
 */
export interface DetachedContentRouterProps {
  /** 当前视图模式。 */
  activeView: 'main' | 'settings'
  /** 设置页关闭回调。 */
  onCloseSettings: () => void
  /** 引擎选择状态。 */
  engineSelection: EngineSelectionState
  /** 引擎切换回调。 */
  onChangeEngineChoice: (choice: EngineChoice) => void
  /** 当前工具。 */
  tool: Tool
  /** 当前颜色。 */
  color: string
  /** 历史记录回调。 */
  onHistoryPush: (entry: HistoryEntry, source?: CanvasHistorySource) => void
  /** 清空触发 token。 */
  clearToken: number
}

/**
 * Matheshop 剥离层内容路由。
 * @param props 路由参数。
 * @returns React 组件。
 */
export default function DetachedContentRouter(props: DetachedContentRouterProps) {
  const {
    activeView,
    onCloseSettings,
    engineSelection,
    onChangeEngineChoice,
    tool,
    color,
    onHistoryPush,
    clearToken,
  } = props

  if (activeView === 'settings') {
    return (
      <SettingsPanel
        open={true}
        onClose={onCloseSettings}
        engineSelection={engineSelection}
        onChangeEngineChoice={onChangeEngineChoice}
      />
    )
  }

  return (
    <section className="math-detached-content" aria-label="Matheshop 内容区">
      <p className="math-detached-content__hint">提示：滚轮缩放；中键拖拽/按住空格拖拽平移；左键点击插入公式/文本</p>
      <CanvasBoard tool={tool} color={color} onHistoryPush={onHistoryPush} requestClearToken={clearToken} />
    </section>
  )
}
