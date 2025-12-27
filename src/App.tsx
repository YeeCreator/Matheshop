import { useMemo, useState } from 'react'
import CanvasBoard, { type HistoryEntry, type Tool } from './components/CanvasBoard'
import './App.css'

const TOOL_LABELS: Record<Tool, string> = {
  select: '选择工具',
  brush: '画笔工具',
  eraser: '橡皮擦工具',
  fill: '填充工具',
  text: '文字工具',
  zoom: '缩放工具',
}

function App() {
  const [tool, setTool] = useState<Tool>('brush')
  const [color, setColor] = useState('#ff0000')
  const [brushSize, setBrushSize] = useState(8)
  const [history, setHistory] = useState<HistoryEntry[]>([])

  // simple layers placeholder
  const layers = useMemo(() => ['图层 1'], [])

  // “token” 触发 CanvasBoard 内部的 useEffect
  const [undoToken, setUndoToken] = useState(0)
  const [clearToken, setClearToken] = useState(0)
  const [fillToken, setFillToken] = useState(0)

  const pushHistory = (entry: HistoryEntry) => {
    setHistory((prev) => [entry, ...prev].slice(0, 30))
  }

  const toolItems: Tool[] = ['select', 'brush', 'eraser', 'fill', 'text', 'zoom']

  return (
    <div className="container">
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
          <button
            type="button"
            onClick={() => {
              setTool('brush')
            }}
          >
            画笔
          </button>
          <button
            type="button"
            onClick={() => {
              setTool('eraser')
            }}
          >
            橡皮擦
          </button>
          <button
            type="button"
            onClick={() => setUndoToken((x) => x + 1)}
            disabled={history.length === 0}
          >
            撤销
          </button>
          <button type="button" onClick={() => setClearToken((x) => x + 1)}>
            清空
          </button>
          <button type="button" onClick={() => setFillToken((x) => x + 1)}>
            填充
          </button>

          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            笔刷
            <input
              type="range"
              min={1}
              max={60}
              value={brushSize}
              onChange={(e) => setBrushSize(Number(e.target.value))}
            />
            <span style={{ minWidth: 32 }}>{brushSize}</span>
          </label>

          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            颜色
            <input
              type="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
            />
          </label>
        </div>

        <CanvasBoard
          tool={tool}
          color={color}
          brushSize={brushSize}
          onHistoryPush={pushHistory}
          requestUndoToken={undoToken}
          requestClearToken={clearToken}
          requestFillToken={fillToken}
        />
      </div>

      <div className="sidebar right-sidebar">
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
          <h3>颜色选择器</h3>
          <input
            type="color"
            value={color}
            onChange={(e) => setColor(e.target.value)}
          />
        </div>

        <div className="panel">
          <h3>历史记录</h3>
          <ul className="history-list">
            {history.length === 0 ? (
              <li className="history-item">暂无</li>
            ) : (
              history.map((h) => (
                <li key={h.id} className="history-item">
                  {h.label}
                </li>
              ))
            )}
          </ul>
        </div>
      </div>
    </div>
  )
}

export default App
