import { useEffect, useRef } from 'react'
import type { EngineChoice, EngineSelectionState } from '../engine/engineSelection'

/**
 * 设置面板参数。
 */
export interface SettingsPanelProps {
  /** 是否打开。 */
  open: boolean
  /** 关闭回调。 */
  onClose: () => void
  /** 引擎选择状态。 */
  engineSelection: EngineSelectionState
  /** 引擎切换回调。 */
  onChangeEngineChoice: (choice: EngineChoice) => void
  /** 主题模式（可选）。 */
  themeMode?: 'system' | 'light' | 'dark'
  /** 主题切换回调（可选）。 */
  onChangeThemeMode?: (mode: 'system' | 'light' | 'dark') => void
}

export default function SettingsPanel(props: SettingsPanelProps) {
  const { open, onClose, engineSelection, onChangeEngineChoice, themeMode, onChangeThemeMode } = props

  const panelRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!open) return

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.preventDefault()
      e.stopPropagation()
      onClose()
    }

    window.addEventListener('keydown', onKeyDown, { capture: true })
    return () => window.removeEventListener('keydown', onKeyDown, { capture: true } as never)
  }, [open, onClose])

  useEffect(() => {
    if (!open) return
    // 轻量做法：打开后把焦点给面板，键盘用户更友好
    panelRef.current?.focus()
  }, [open])

  if (!open) return null

  return (
    <div className="settings-page" role="presentation">
      <div className="settings-panel panel" role="dialog" aria-label="设置" tabIndex={-1} ref={panelRef}>
        <div className="settings-header">
          <button
            type="button"
            className="settings-back"
            aria-label="返回主界面"
            onClick={onClose}
          >
            ←
          </button>

          <h3 style={{ margin: 0 }}>设置</h3>

          {/* 右侧占位，保持标题居中（也可未来放“保存/帮助”等按钮） */}
          <div style={{ width: 30 }} />
        </div>

        <div className="settings-section">
          <h4 style={{ margin: '8px 0' }}>符号计算系统引擎</h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {(
              [
                { value: 'builtin_native', label: '内置原生计算引擎' },
                { value: 'builtin_python', label: '内置 Python 计算引擎' },
                { value: 'external', label: '外接计算引擎' },
              ] as Array<{ value: EngineChoice; label: string }>
            ).map((opt) => (
              <label key={opt.value} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input
                  type="radio"
                  name="matheshop-engine-choice"
                  value={opt.value}
                  checked={engineSelection.choice === opt.value}
                  onChange={() => onChangeEngineChoice(opt.value)}
                />
                {opt.label}
              </label>
            ))}

            <div className="small-muted">
              默认使用“内置原生计算引擎（TS 本地）”，不需要启动后端；只有选择“内置 Python 计算引擎/外接计算引擎”
              时才需要后端能力（外接目前仅 UI 占位）。
            </div>
          </div>
        </div>

        {themeMode && onChangeThemeMode ? (
          <div className="settings-section">
            <h4 style={{ margin: '8px 0' }}>主题模式</h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {(
                [
                  { value: 'system', label: '跟随系统' },
                  { value: 'light', label: '浅色' },
                  { value: 'dark', label: '深色' },
                ] as Array<{ value: 'system' | 'light' | 'dark'; label: string }>
              ).map((opt) => (
                <label key={opt.value} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input
                    type="radio"
                    name="matheshop-theme-mode"
                    value={opt.value}
                    checked={themeMode === opt.value}
                    onChange={() => onChangeThemeMode(opt.value)}
                  />
                  {opt.label}
                </label>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}
