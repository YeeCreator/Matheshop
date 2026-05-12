import React from 'react'

export type ThemeMode = 'light' | 'dark' | 'system'

export const ThemeProvider: React.FC<{
  children: React.ReactNode
  mode?: ThemeMode
  defaultMode?: ThemeMode
  storageKey?: string
  onModeChange?: (mode: ThemeMode) => void
}> = ({ children }) => <>{children}</>

export const Row: React.FC<{ children?: React.ReactNode; wrap?: boolean; style?: React.CSSProperties }> = ({ children, wrap, style }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: wrap ? 'wrap' : 'nowrap', ...(style ?? {}) }}>{children}</div>
)

export const Button: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'ghost' | 'solid' }> = ({ children, ...props }) => (
  <button type="button" {...props}>{children}</button>
)

export const IconButton = React.forwardRef<HTMLButtonElement, React.ButtonHTMLAttributes<HTMLButtonElement>>((props, ref) => (
  <button type="button" ref={ref} {...props}>{props.children}</button>
))
IconButton.displayName = 'IconButton'

export const ToolbarTitle: React.FC<{ children?: React.ReactNode }> = ({ children }) => <strong>{children}</strong>
export const ToolbarSeparator: React.FC = () => <span style={{ opacity: 0.4 }}>|</span>

export const ToolbarLabel: React.FC<{ label: string; children?: React.ReactNode }> = ({ label, children }) => (
  <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
    <span style={{ fontSize: 12 }}>{label}</span>
    {children}
  </label>
)

export const Toolbar: React.FC<{ left?: React.ReactNode; center?: React.ReactNode; right?: React.ReactNode; preset?: string }> = ({ left, center, right }) => (
  <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: 8, alignItems: 'center', padding: '8px 10px', borderBottom: '1px solid #3333' }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>{left}</div>
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'center' }}>{center}</div>
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'flex-end' }}>{right}</div>
  </div>
)

export const Panel: React.FC<{ title?: string; children?: React.ReactNode; preset?: string }> = ({ title, children }) => (
  <section style={{ border: '1px solid #3333', borderRadius: 6, padding: 8, marginBottom: 8 }}>
    {title ? <h3 style={{ margin: 0, marginBottom: 8, fontSize: 13 }}>{title}</h3> : null}
    {children}
  </section>
)

export const List: React.FC<{ children?: React.ReactNode }> = ({ children }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>{children}</div>
)

export const ListItem: React.FC<{ children?: React.ReactNode; selected?: boolean; onClick?: () => void; style?: React.CSSProperties }> = ({ children, selected, onClick, style }) => (
  <button type="button" onClick={onClick} style={{ textAlign: 'left', padding: '6px 8px', borderRadius: 4, border: '1px solid #3333', background: selected ? '#d9e8ff' : '#fff', ...(style ?? {}) }}>
    {children}
  </button>
)

export const ContentShell: React.FC<{ children?: React.ReactNode; style?: React.CSSProperties }> = ({ children, style }) => (
  <div style={{ width: '100%', height: '100%', ...(style ?? {}) }}>{children}</div>
)

export const TextArea: React.FC<React.TextareaHTMLAttributes<HTMLTextAreaElement> & { monospace?: boolean }> = ({ monospace, style, ...props }) => (
  <textarea
    {...props}
    style={{
      fontFamily: monospace ? 'Consolas, monospace' : undefined,
      ...(style ?? {}),
    }}
  />
)

export const MutedText: React.FC<{ children?: React.ReactNode; style?: React.CSSProperties }> = ({ children, style }) => (
  <span style={{ opacity: 0.7, ...(style ?? {}) }}>{children}</span>
)

export const MatchFrame: React.FC<{
  toolbar?: React.ReactNode
  leftSidebar?: React.ReactNode
  rightSidebar?: React.ReactNode
  center?: React.ReactNode
  layout?: unknown
  preset?: string
}> = ({ toolbar, leftSidebar, rightSidebar, center }) => (
  <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', background: '#f7f7f9', color: '#222' }}>
    {toolbar ?? null}
    <div style={{ display: 'grid', gridTemplateColumns: leftSidebar ? '240px 1fr 360px' : rightSidebar ? '1fr 360px' : '1fr', minHeight: 0, flex: 1 }}>
      {leftSidebar ? <aside style={{ borderRight: '1px solid #3333', padding: 8, overflow: 'auto' }}>{leftSidebar}</aside> : null}
      <main style={{ minWidth: 0, minHeight: 0, overflow: 'auto' }}>{center}</main>
      {rightSidebar ? <aside style={{ borderLeft: '1px solid #3333', padding: 8, overflow: 'auto' }}>{rightSidebar}</aside> : null}
    </div>
  </div>
)
