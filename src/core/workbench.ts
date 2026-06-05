import { createSingleGroupLayout, defaultEditorCapability, defaultModalPresentation, defaultTabPresentation, type EditorDescriptor, type WorkspaceDescriptor } from 'main-ui/core'
import { createMainUiRuntime } from 'main-ui/vue'
import MatheshopCanvasEditor from '../vue/MatheshopCanvasEditor.vue'
import MatheshopAnalysisEditor from '../vue/MatheshopAnalysisEditor.vue'
import MatheshopFilesEditor from '../vue/MatheshopFilesEditor.vue'
import MatheshopSettingsEditor from '../vue/MatheshopSettingsEditor.vue'
import { matheshopWhiteboardFiles } from './whiteboardFiles'

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

export const createMatheshopMainUiRuntime = () => {
  const runtime = createMainUiRuntime({ activeWorkspaceId: MATHESHOP_CANVAS_WORKSPACE_ID })
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
  return runtime
}

export const matheshopRuntime = createMatheshopMainUiRuntime()