// @main-ui-kit-managed-shell-version: 1.0.0

/**
 * 设置页示例数据。
 */
export const settingsRows = [
  { section: '布局', key: 'workbench.layout.mode', value: 'split-tabs', description: '控制主区域默认布局模式。' },
  { section: '标签', key: 'workbench.tabs.defaultContent', value: 'flow-canvas', description: '控制新建标签时默认挂载的内容类型。' },
  { section: '视口', key: 'viewport.2d.engine', value: 'pixi', description: '声明 2D 视口模板的默认引擎。' },
  { section: '视口', key: 'viewport.3d.engine', value: 'none', description: '声明 3D 视口模板的默认引擎。' },
];

/**
 * 快捷键页示例数据。
 */
export const keybindingRows = [
  { command: 'workbench.newTab', keybinding: 'Ctrl+T', scope: 'Workbench', status: '已绑定' },
  { command: 'workbench.splitPrimary', keybinding: 'Ctrl+\\', scope: 'Editor', status: '已绑定' },
  { command: 'workbench.openSettings', keybinding: 'Ctrl+,', scope: 'Global', status: '已绑定' },
  { command: 'workbench.openKeybindings', keybinding: 'Ctrl+K Ctrl+S', scope: 'Global', status: '已绑定' },
];
