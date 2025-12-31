import { useEffect, useMemo, useRef, useState } from 'react'
import CanvasBoard, { type CanvasHistorySource, type HistoryEntry, type Tool } from './components/CanvasBoard'
import InspectorPanel from './components/InspectorPanel'
import SettingsPanel from './components/SettingsPanel'
import {
  DEFAULT_ENGINE_SELECTION,
  loadEngineSelection,
  saveEngineSelection,
  type EngineSelectionState,
} from './engine/engineSelection'
import './App.css'

const TOOL_LABELS: Record<Tool, string> = {
  text: '文本/公式',
}

type InspectorSnapshot = {
  activeInlineEditor: {
    cellId: string
    selection: { kind: 'tokenRange'; start: number; end: number }
    draft: string
    anchorCss: { left: number; top: number }
  } | null
  selectedExprToken: { cellId: string; tokenId: string } | null
}

function App() {
  const [tool, setTool] = useState<Tool>('text')
  const [color, setColor] = useState('#111111')
  const [history, setHistory] = useState<HistoryEntry[]>([])

  const [engineSelection, setEngineSelection] = useState<EngineSelectionState>(() => {
    if (typeof window === 'undefined') return DEFAULT_ENGINE_SELECTION
    return loadEngineSelection()
  })

  const [activeView, setActiveView] = useState<'main' | 'settings'>('main')
  const settingsButtonRef = useRef<HTMLButtonElement | null>(null)

  const openSettings = () => {
    setActiveView('settings')
  }

  const closeSettings = () => {
    setActiveView('main')
    // 关闭后把焦点还给齿轮按钮（键盘用户更友好）
    settingsButtonRef.current?.focus()
  }

  useEffect(() => {
    saveEngineSelection(engineSelection)
    window.dispatchEvent(new CustomEvent('matheshop:engineSelection', { detail: engineSelection }))
  }, [engineSelection])

  useEffect(() => {
    // 确保首次挂载时也广播一次（CanvasBoard 可能比设置渲染更早读取）
    window.dispatchEvent(new CustomEvent('matheshop:engineSelection', { detail: engineSelection }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // simple layers placeholder
  const layers = useMemo(() => ['图层 1'], [])

  // “token” 触发 CanvasBoard 内部的 useEffect
  const [clearToken, setClearToken] = useState(0)

  const pushHistory = (entry: HistoryEntry, source: CanvasHistorySource = 'user') => {
    if (source !== 'user') return
    setHistory((prev) => [entry, ...prev].slice(0, 30))
  }

  const toolItems: Tool[] = ['text']

  const [inspector, setInspector] = useState<InspectorSnapshot>({ activeInlineEditor: null, selectedExprToken: null })

  useEffect(() => {
    const onInspector = (ev: Event) => {
      const ce = ev as CustomEvent
      if (!ce.detail) return
      setInspector(ce.detail as InspectorSnapshot)
    }
    window.addEventListener('matheshop:inspector', onInspector as EventListener)
    return () => window.removeEventListener('matheshop:inspector', onInspector as EventListener)
  }, [])

  const requestApply = () => {
    window.dispatchEvent(new CustomEvent('matheshop:inspector:apply'))
  }

  const requestCancel = () => {
    window.dispatchEvent(new CustomEvent('matheshop:inspector:cancel'))
  }

  const requestDraftChange = (draft: string) => {
    window.dispatchEvent(new CustomEvent('matheshop:inspector:draft', { detail: { draft } }))
  }

  return (
    <div className="container">
      {activeView === 'settings' ? null : (
        <div className="top-toolbar" role="toolbar" aria-label="主工具条">
          <div className="top-toolbar__left">
            <strong className="top-toolbar__title">Matheshop</strong>
            <span className="top-toolbar__sep" />
            <button type="button" className="top-toolbar__btn" onClick={() => setClearToken((x) => x + 1)}>
              清空
            </button>

            <label className="top-toolbar__label">
              文本颜色
              <input type="color" value={color} onChange={(e) => setColor(e.target.value)} />
            </label>
          </div>

          <div className="top-toolbar__right">
            <button
              ref={settingsButtonRef}
              type="button"
              className="settings-gear settings-gear--toolbar"
              aria-label="设置"
              aria-expanded={false}
              onClick={openSettings}
            >
              ⚙
            </button>
          </div>
        </div>
      )}

      <SettingsPanel
        open={activeView === 'settings'}
        onClose={closeSettings}
        engineSelection={engineSelection}
        onChangeEngineChoice={(choice) => setEngineSelection((prev) => ({ ...prev, choice }))}
      />

      {activeView === 'settings' ? null : (
        <div className="content-row">
          <div className="sidebar left-sidebar">
            <ul className="tool-list">
              {toolItems.map((t) => (
                <li
                  key={t}
                  className="tool-item"
                  onClick={() => setTool(t)}
                  style={{
                    fontWeight: tool === t ? 700 : 400,
                    background: tool === t ? '#e0e0e0' : undefined,
                  }}
                  role="button"
                  tabIndex={0}
                >
                  {TOOL_LABELS[t]}
                </li>
              ))}
            </ul>
          </div>

          <div className="main-content">
            <div className="canvas-toolbar">
              <span className="small-muted">提示：滚轮缩放；中键拖拽/按住空格拖拽平移；左键点击插入公式/文本</span>
            </div>

            <CanvasBoard tool={tool} color={color} onHistoryPush={pushHistory} requestClearToken={clearToken} />
          </div>

          <div className="sidebar right-sidebar">
            <InspectorPanel
              active={
                inspector.activeInlineEditor
                  ? {
                      cellId: inspector.activeInlineEditor.cellId,
                      selection: inspector.activeInlineEditor.selection,
                      draft: inspector.activeInlineEditor.draft,
                    }
                  : null
              }
              tokens={null}
              onChangeDraft={requestDraftChange}
              onApply={requestApply}
              onCancel={requestCancel}
            />

            <div className="panel">
              <h3>图层</h3>
              <ul className="layer-list">
                {layers.map((l) => (
                  <li key={l} className="layer-item">
                    {l}
                  </li>
                ))}
              </ul>
            </div>

            <div className="panel">
              <h3>历史记录</h3>
              <textarea
                className="history-textbox"
                readOnly
                value={
                  history.length === 0
                    ? '暂无'
                    : history
                        .slice()
                        .reverse()
                        .map((h) => h.label)
                        .join('\n')
                }
              />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default App
