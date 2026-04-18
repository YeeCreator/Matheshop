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
import {
  Button,
  ContentShell,
  IconButton,
  List,
  ListItem,
  MutedText,
  Panel,
  Row,
  TextArea,
  ToolbarLabel,
  ToolbarSeparator,
  ToolbarTitle,
  Toolbar,
  MatchFrame,
  ThemeProvider,
  type ThemeMode,
} from 'main-ui-react/layout'

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
  const [themeMode, setThemeMode] = useState<ThemeMode>(() => {
    if (typeof window === 'undefined') return 'system'
    const stored = window.localStorage.getItem('matheshop:themeMode:v1')
    return stored === 'light' || stored === 'dark' || stored === 'system' ? stored : 'system'
  })

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

  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem('matheshop:themeMode:v1', themeMode)
  }, [themeMode])

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
    <ThemeProvider mode={themeMode} defaultMode="system" storageKey="matheshop:themeMode:v1" onModeChange={setThemeMode}>
      <MatchFrame
        preset="vscodium"
        layout={{
          // 宿主（matheshop）本身已让 #root/body 100% 高度，这里保持 main-ui-react 默认的 viewport 高度策略
          heightMode: 'viewport',
          leftSidebar: {
            width: 220,
            scroll: true,
            padding: 12,
            background: 'var(--main-ui-react-vscodium-sidebarBackground)',
            bordered: true,
          },
          rightSidebar: {
            width: 360,
            scroll: true,
            padding: 12,
            background: 'var(--main-ui-react-vscodium-sidebarBackground)',
            bordered: true,
          },
        }}
        toolbar={
        activeView === 'settings' ? null : (
          <Toolbar
            preset="vscodium"
            left={
              <>
                <ToolbarTitle>Matheshop</ToolbarTitle>
                <ToolbarSeparator />
                <Button
                  variant="ghost"
                  onClick={() => setClearToken((x) => x + 1)}
                  style={{ color: 'var(--main-ui-react-vscodium-textPrimary)', borderColor: 'var(--main-ui-react-vscodium-controlBorder)', background: 'var(--main-ui-react-vscodium-controlBackground)' }}
                >
                  清空
                </Button>
                <ToolbarLabel label="文本颜色">
                  <input
                    type="color"
                    title="文本颜色"
                    aria-label="文本颜色"
                    value={color}
                    onChange={(e) => setColor(e.target.value)}
                  />
                </ToolbarLabel>
              </>
            }
            right={
              <IconButton
                ref={settingsButtonRef}
                aria-label="设置"
                aria-expanded={false}
                onClick={openSettings}
                style={{ color: 'var(--main-ui-react-vscodium-textPrimary)', borderColor: 'var(--main-ui-react-vscodium-controlBorder)', background: 'var(--main-ui-react-vscodium-controlBackground)' }}
              >
                ⚙
              </IconButton>
            }
          />
        )
        }
        leftSidebar={
        activeView === 'settings' ? null : (
          <Panel preset="vscodium" title="工具">
            <List>
              {toolItems.map((t) => (
                <ListItem
                  key={t}
                  onClick={() => setTool(t)}
                  selected={tool === t}
                  style={{ background: tool === t ? 'var(--main-ui-react-vscodium-controlSelectedBackground)' : 'var(--main-ui-react-vscodium-controlBackground)', color: 'var(--main-ui-react-vscodium-controlText)', borderColor: 'var(--main-ui-react-vscodium-controlBorder)' }}
                >
                  {TOOL_LABELS[t]}
                </ListItem>
              ))}
            </List>
          </Panel>
        )
        }
        center={
        <>
          <SettingsPanel
            open={activeView === 'settings'}
            onClose={closeSettings}
            engineSelection={engineSelection}
            onChangeEngineChoice={(choice) => setEngineSelection((prev) => ({ ...prev, choice }))}
            themeMode={themeMode}
            onChangeThemeMode={setThemeMode}
          />

          {activeView === 'settings' ? null : (
            <ContentShell style={{ background: 'var(--main-ui-react-vscodium-viewportBackground)', color: 'var(--main-ui-react-vscodium-textPrimary)' }}>
              <Row wrap>
                <MutedText style={{ color: 'var(--main-ui-react-vscodium-textSecondary)' }}>提示：滚轮缩放；中键拖拽/按住空格拖拽平移；左键点击插入公式/文本</MutedText>
              </Row>

              <CanvasBoard tool={tool} color={color} onHistoryPush={pushHistory} requestClearToken={clearToken} />
            </ContentShell>
          )}
        </>
        }
        rightSidebar={
        activeView === 'settings' ? null : (
          <div className="math-right-sidebar-stack">
            <Panel preset="vscodium" title="Inspector">
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
            </Panel>

            <Panel preset="vscodium" title="图层">
              <List>
                {layers.map((l) => (
                  <ListItem key={l} style={{ background: 'var(--main-ui-react-vscodium-controlBackground)', color: 'var(--main-ui-react-vscodium-controlText)', borderColor: 'var(--main-ui-react-vscodium-controlBorder)' }}>{l}</ListItem>
                ))}
              </List>
            </Panel>

            <Panel preset="vscodium" title="历史记录">
              <TextArea
                readOnly
                monospace
                style={{ background: 'var(--main-ui-react-vscodium-viewportBackground)', color: 'var(--main-ui-react-vscodium-textPrimary)', borderColor: 'var(--main-ui-react-vscodium-controlBorder)' }}
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
            </Panel>
          </div>
        )
        }
      />
    </ThemeProvider>
  )
}

export default App
