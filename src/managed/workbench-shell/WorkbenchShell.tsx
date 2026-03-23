// @main-ui-kit-managed-shell-version: 1.1.0

import type { ReactNode } from 'react'

/**
 * Matheshop 托管壳层参数。
 */
export interface WorkbenchShellProps {
  /** 当前视图模式。 */
  activeView: 'main' | 'settings'
  /** 菜单栏左侧内容。 */
  menubarLeft?: ReactNode
  /** 菜单栏右侧内容。 */
  menubarRight?: ReactNode
  /** 工具条左侧内容。 */
  toolbarLeft?: ReactNode
  /** 工具条右侧内容。 */
  toolbarRight?: ReactNode
  /** 活动栏内容。 */
  activitybar?: ReactNode
  /** 左侧栏内容。 */
  leftSidebar?: ReactNode
  /** 主区域内容。 */
  mainContent: ReactNode
  /** 右侧栏内容。 */
  rightSidebar?: ReactNode
  /** 底部面板内容。 */
  bottomPanel?: ReactNode
  /** 状态栏左侧内容。 */
  statusbarLeft?: ReactNode
  /** 状态栏右侧内容。 */
  statusbarRight?: ReactNode
}

/**
 * Matheshop 托管工作台壳层。
 * @param props 壳层参数。
 * @returns React 组件。
 */
export default function WorkbenchShell(props: WorkbenchShellProps) {
  const {
    activeView,
    menubarLeft,
    menubarRight,
    toolbarLeft,
    toolbarRight,
    activitybar,
    leftSidebar,
    mainContent,
    rightSidebar,
    bottomPanel,
    statusbarLeft,
    statusbarRight,
  } = props

  const settingMode = activeView === 'settings'

  return (
    <section className="math-shell" aria-label="Matheshop 托管壳层">
      <header className="math-shell__menubar">
        <div className="math-shell__menubar-group">{menubarLeft}</div>
        <div className="math-shell__menubar-group">{menubarRight}</div>
      </header>

      <div className="math-shell__toolbar">
        <div className="math-shell__toolbar-group">{toolbarLeft}</div>
        <div className="math-shell__toolbar-group">{toolbarRight}</div>
      </div>

      <div className={settingMode ? 'math-shell__body math-shell__body--settings' : 'math-shell__body'}>
        {settingMode ? null : <aside className="math-shell__activitybar">{activitybar}</aside>}
        {settingMode ? null : <aside className="math-shell__sidebar">{leftSidebar}</aside>}

        <main className="math-shell__main">{mainContent}</main>

        {settingMode ? null : <aside className="math-shell__sidebar math-shell__sidebar--right">{rightSidebar}</aside>}
      </div>

      {settingMode ? null : <div className="math-shell__bottom-panel">{bottomPanel}</div>}

      <footer className="math-shell__statusbar">
        <div className="math-shell__statusbar-group">{statusbarLeft}</div>
        <div className="math-shell__statusbar-group">{statusbarRight}</div>
      </footer>
    </section>
  )
}
