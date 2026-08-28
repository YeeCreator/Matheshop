import { createSingleGroupLayout, defaultEditorCapability, defaultModalPresentation, defaultTabPresentation, type EditorDescriptor, type WorkspaceDescriptor } from 'main-ui/core'
import { createMainUiRuntime } from 'main-ui/vue'
import MatheshopCanvasEditor from '../vue/MatheshopCanvasEditor.vue'
import MatheshopAnalysisEditor from '../vue/MatheshopAnalysisEditor.vue'
import MatheshopFilesEditor from '../vue/MatheshopFilesEditor.vue'
import MatheshopSettingsEditor from '../vue/MatheshopSettingsEditor.vue'
import { matheshopWhiteboardFiles } from './whiteboardFiles'
import { createMatheshopSettingsPersistenceAdapter } from './settingsPersistence'
import { MATHESHOP_BOARD_COMMAND_EVENT, type MatheshopBoardCommand } from './boardCommands'
import { loadEngineSelection, type EngineChoice } from '../engine/engineSelection'

export const MATHESHOP_CANVAS_WORKSPACE_ID = 'matheshop.workspace.canvas'
export const MATHESHOP_FILES_WORKSPACE_ID = 'matheshop.workspace.files'
export const MATHESHOP_ANALYSIS_WORKSPACE_ID = 'matheshop.workspace.analysis'
export const MATHESHOP_CANVAS_EDITOR_KIND = 'matheshop.canvas'
export const MATHESHOP_FILES_EDITOR_KIND = 'matheshop.files'
export const MATHESHOP_ANALYSIS_EDITOR_KIND = 'matheshop.analysis'
export const MATHESHOP_SETTINGS_EDITOR_KIND = 'matheshop.settings'
export const MATHESHOP_CANVAS_RENDERER_KEY = 'matheshop.renderer.canvas'
export const MATHESHOP_FILES_RENDERER_KEY = 'matheshop.renderer.files'
export const MATHESHOP_ANALYSIS_RENDERER_KEY = 'matheshop.renderer.analysis'
export const MATHESHOP_SETTINGS_RENDERER_KEY = 'matheshop.renderer.settings'
export const MATHESHOP_CANVAS_GROUP_ID = 'matheshop-group-main'

export const MATHESHOP_ENGINE_CHOICE_SETTING_ID = 'matheshop.engineChoice'

/** 供 setting schema 与设置面板共用的引擎选项清单。 */
export const MATHESHOP_ENGINE_CHOICES: Array<{ value: EngineChoice; label: string }> = [
  { value: 'builtin_python', label: '内置 Python 高性能计算后台' },
  { value: 'builtin_native', label: '浏览器 TypeScript 轻量后备' },
  { value: 'external', label: '外接计算引擎占位' },
]

const bootstrapWhiteboard = matheshopWhiteboardFiles.ensureBootstrapFile()

const canvasEditor: EditorDescriptor = {
  kind: MATHESHOP_CANVAS_EDITOR_KIND,
  title: 'Matheshop 画布',
  description: 'Vue3 渲染 + TypeScript core 的数学白板',
  icon: 'grid',
  rendererKey: MATHESHOP_CANVAS_RENDERER_KEY,
  capability: {
    ...defaultEditorCapability,
    allowDuplicate: false,
    allowMultipleInstances: true,
    allowClose: true,
    launcherVisibility: 'hidden',
  },
  presentation: defaultTabPresentation,
  availability: { allowedWorkspaceIds: [MATHESHOP_CANVAS_WORKSPACE_ID] },
}

const filesEditor: EditorDescriptor = {
  kind: MATHESHOP_FILES_EDITOR_KIND,
  title: '白板文件',
  description: '管理计算白板文件并打开标签页',
  icon: 'folder',
  rendererKey: MATHESHOP_FILES_RENDERER_KEY,
  capability: {
    ...defaultEditorCapability,
    allowDuplicate: false,
    allowMultipleInstances: false,
    allowClose: false,
    launcherVisibility: 'hidden-when-opened',
  },
  presentation: defaultTabPresentation,
  availability: { allowedWorkspaceIds: [MATHESHOP_FILES_WORKSPACE_ID] },
}

const analysisEditor: EditorDescriptor = {
  kind: MATHESHOP_ANALYSIS_EDITOR_KIND,
  title: '分析总览',
  description: '查看白板文件统计和最近活动',
  icon: 'chart',
  rendererKey: MATHESHOP_ANALYSIS_RENDERER_KEY,
  capability: {
    ...defaultEditorCapability,
    allowDuplicate: false,
    allowMultipleInstances: false,
    allowClose: false,
    launcherVisibility: 'hidden-when-opened',
  },
  presentation: defaultTabPresentation,
  availability: { allowedWorkspaceIds: [MATHESHOP_ANALYSIS_WORKSPACE_ID] },
}

const settingsEditor: EditorDescriptor = {
  kind: MATHESHOP_SETTINGS_EDITOR_KIND,
  title: '设置',
  description: 'Matheshop 引擎与运行信息',
  icon: 'settings',
  rendererKey: MATHESHOP_SETTINGS_RENDERER_KEY,
  capability: {
    ...defaultEditorCapability,
    allowDuplicate: false,
    allowMultipleInstances: false,
    allowClose: true,
    launcherVisibility: 'visible',
  },
  presentation: {
    ...defaultModalPresentation,
    modalWidth: 560,
    modalHeight: 420,
  },
  availability: { allowedWorkspaceIds: [MATHESHOP_CANVAS_WORKSPACE_ID, MATHESHOP_FILES_WORKSPACE_ID, MATHESHOP_ANALYSIS_WORKSPACE_ID] },
}

const canvasWorkspace: WorkspaceDescriptor = {
  id: MATHESHOP_CANVAS_WORKSPACE_ID,
  title: '白板',
  description: '计算白板主工作区',
  icon: 'math',
  allowedEditorKinds: [MATHESHOP_CANVAS_EDITOR_KIND, MATHESHOP_SETTINGS_EDITOR_KIND],
  recommendedEditorKinds: [MATHESHOP_CANVAS_EDITOR_KIND, MATHESHOP_SETTINGS_EDITOR_KIND],
  defaultOpenRequests: [{ editorKind: MATHESHOP_CANVAS_EDITOR_KIND, title: bootstrapWhiteboard.title, payload: { whiteboardFileId: bootstrapWhiteboard.id }, restoreKey: bootstrapWhiteboard.id }],
  createDefaultLayout: () => createSingleGroupLayout({ groupId: MATHESHOP_CANVAS_GROUP_ID, leafNodeId: 'matheshop-leaf-main' }),
  allowUserReset: true,
}

const filesWorkspace: WorkspaceDescriptor = {
  id: MATHESHOP_FILES_WORKSPACE_ID,
  title: '文件',
  description: '计算白板文件与资源入口',
  icon: 'folder',
  allowedEditorKinds: [MATHESHOP_FILES_EDITOR_KIND, MATHESHOP_SETTINGS_EDITOR_KIND],
  recommendedEditorKinds: [MATHESHOP_FILES_EDITOR_KIND, MATHESHOP_SETTINGS_EDITOR_KIND],
  defaultOpenRequests: [{ editorKind: MATHESHOP_FILES_EDITOR_KIND, title: '白板文件' }],
  createDefaultLayout: () => createSingleGroupLayout({ groupId: 'matheshop-group-files', leafNodeId: 'matheshop-leaf-files' }),
  allowUserReset: true,
}

const analysisWorkspace: WorkspaceDescriptor = {
  id: MATHESHOP_ANALYSIS_WORKSPACE_ID,
  title: '分析',
  description: '白板统计与活动概览',
  icon: 'chart',
  allowedEditorKinds: [MATHESHOP_ANALYSIS_EDITOR_KIND, MATHESHOP_SETTINGS_EDITOR_KIND],
  recommendedEditorKinds: [MATHESHOP_ANALYSIS_EDITOR_KIND, MATHESHOP_SETTINGS_EDITOR_KIND],
  defaultOpenRequests: [{ editorKind: MATHESHOP_ANALYSIS_EDITOR_KIND, title: '分析总览' }],
  createDefaultLayout: () => createSingleGroupLayout({ groupId: 'matheshop-group-analysis', leafNodeId: 'matheshop-leaf-analysis' }),
  allowUserReset: true,
}

const isEngineChoice = (value: unknown): value is EngineChoice => {
  return value === 'builtin_python' || value === 'builtin_native' || value === 'external'
}

export const createMatheshopMainUiRuntime = () => {
  const runtime = createMainUiRuntime({
    activeWorkspaceId: MATHESHOP_CANVAS_WORKSPACE_ID,
    settingsPersistence: createMatheshopSettingsPersistenceAdapter(),
  })
  runtime.core.registerEditor(canvasEditor)
  runtime.core.registerEditor(filesEditor)
  runtime.core.registerEditor(analysisEditor)
  runtime.core.registerEditor(settingsEditor)
  runtime.core.registerWorkspace(canvasWorkspace)
  runtime.core.registerWorkspace(filesWorkspace)
  runtime.core.registerWorkspace(analysisWorkspace)
  const canvasRenderer = MatheshopCanvasEditor as unknown as Parameters<typeof runtime.vue.registerEditorRenderer>[1]
  const filesRenderer = MatheshopFilesEditor as unknown as Parameters<typeof runtime.vue.registerEditorRenderer>[1]
  const analysisRenderer = MatheshopAnalysisEditor as unknown as Parameters<typeof runtime.vue.registerEditorRenderer>[1]
  const settingsRenderer = MatheshopSettingsEditor as unknown as Parameters<typeof runtime.vue.registerEditorRenderer>[1]
  runtime.vue.registerEditorRenderer(MATHESHOP_CANVAS_RENDERER_KEY, canvasRenderer)
  runtime.vue.registerEditorRenderer(MATHESHOP_FILES_RENDERER_KEY, filesRenderer)
  runtime.vue.registerEditorRenderer(MATHESHOP_ANALYSIS_RENDERER_KEY, analysisRenderer)
  runtime.vue.registerEditorRenderer(MATHESHOP_SETTINGS_RENDERER_KEY, settingsRenderer)

  registerEngineChoiceSetting(runtime)
  registerBoardCommands(runtime)
  return runtime
}

/** 把计算引擎选择注册为 main-ui schema setting，并用 settings 作为统一持久化入口。 */
const registerEngineChoiceSetting = (runtime: ReturnType<typeof createMainUiRuntime>) => {
  runtime.core.registerSettingSchema({
    id: MATHESHOP_ENGINE_CHOICE_SETTING_ID,
    title: '计算引擎',
    description: '选择计算白板的默认求值引擎。',
    category: 'engine',
    type: 'enum',
    defaultValue: loadEngineSelection().choice,
    enumValues: MATHESHOP_ENGINE_CHOICES.map((item) => ({ value: item.value, label: item.label })),
  })

  // settings 是权威来源：一旦引擎选择通过设置面板变化，就同步回业务层。
  runtime.core.settings.subscribe((change) => {
    if (change.id === MATHESHOP_ENGINE_CHOICE_SETTING_ID && isEngineChoice(change.value)) {
      matheshopWhiteboardFiles.applyEngineChoiceToAll(change.value)
    }
  })
}

/** 注册画布命令与快捷键，把画布操作收敛进 main-ui 的 command 体系。 */
const registerBoardCommands = (runtime: ReturnType<typeof createMainUiRuntime>) => {
  const dispatchBoardCommand = (command: MatheshopBoardCommand) => {
    window.dispatchEvent(new CustomEvent(MATHESHOP_BOARD_COMMAND_EVENT, { detail: { command } }))
  }
  const inCanvasWorkspace = (context: { workspaceId: string }) => context.workspaceId === MATHESHOP_CANVAS_WORKSPACE_ID

  runtime.core.registerCommand({
    id: 'matheshop.canvas.clear',
    title: '清空画布',
    category: 'Matheshop',
    when: inCanvasWorkspace,
    run: () => dispatchBoardCommand('clear'),
  })
  runtime.core.registerCommand({
    id: 'matheshop.canvas.toggleLinkMode',
    title: '切换连线模式',
    category: 'Matheshop',
    when: inCanvasWorkspace,
    run: () => dispatchBoardCommand('toggleLinkMode'),
  })
  runtime.core.registerCommand({
    id: 'matheshop.canvas.deleteSelected',
    title: '删除选中单元框',
    category: 'Matheshop',
    when: inCanvasWorkspace,
    run: () => dispatchBoardCommand('deleteSelected'),
  })
  runtime.core.registerCommand({
    id: 'matheshop.canvas.evaluate',
    title: '求值选中单元框',
    category: 'Matheshop',
    when: inCanvasWorkspace,
    run: () => dispatchBoardCommand('evaluate'),
  })

  runtime.core.registerKeybinding({ commandId: 'matheshop.canvas.clear', keybinding: 'Ctrl+Shift+K' })
  runtime.core.registerKeybinding({ commandId: 'matheshop.canvas.toggleLinkMode', keybinding: 'L' })
  runtime.core.registerKeybinding({ commandId: 'matheshop.canvas.deleteSelected', keybinding: 'Delete' })
  runtime.core.registerKeybinding({ commandId: 'matheshop.canvas.deleteSelected', keybinding: 'Backspace' })
}

export const matheshopRuntime = createMatheshopMainUiRuntime()