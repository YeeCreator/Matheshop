import { createSingleGroupLayout, defaultEditorCapability, defaultModalPresentation, defaultTabPresentation, type EditorDescriptor, type WorkspaceDescriptor } from 'main-ui/core'
import { createMainUiRuntime } from 'main-ui/vue'
import MatheshopCanvasEditor from '../vue/MatheshopCanvasEditor.vue'
import MatheshopSettingsEditor from '../vue/MatheshopSettingsEditor.vue'
import { createMatheshopBoardCore } from './boardCore'

export const MATHESHOP_WORKSPACE_ID = 'matheshop.workspace'
export const MATHESHOP_CANVAS_EDITOR_KIND = 'matheshop.canvas'
export const MATHESHOP_SETTINGS_EDITOR_KIND = 'matheshop.settings'
export const MATHESHOP_CANVAS_RENDERER_KEY = 'matheshop.renderer.canvas'
export const MATHESHOP_SETTINGS_RENDERER_KEY = 'matheshop.renderer.settings'

export const matheshopBoard = createMatheshopBoardCore()

const canvasEditor: EditorDescriptor = {
  kind: MATHESHOP_CANVAS_EDITOR_KIND,
  title: 'Matheshop 画布',
  description: 'Vue3 渲染 + TypeScript core 的数学白板',
  icon: 'grid',
  rendererKey: MATHESHOP_CANVAS_RENDERER_KEY,
  capability: {
    ...defaultEditorCapability,
    allowDuplicate: false,
    allowMultipleInstances: false,
    allowClose: false,
    launcherVisibility: 'hidden-when-opened',
  },
  presentation: defaultTabPresentation,
  availability: { allowedWorkspaceIds: [MATHESHOP_WORKSPACE_ID] },
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
  availability: { allowedWorkspaceIds: [MATHESHOP_WORKSPACE_ID] },
}

const workspace: WorkspaceDescriptor = {
  id: MATHESHOP_WORKSPACE_ID,
  title: 'Matheshop',
  description: 'main-ui Vue3 workbench',
  icon: 'math',
  allowedEditorKinds: [MATHESHOP_CANVAS_EDITOR_KIND, MATHESHOP_SETTINGS_EDITOR_KIND],
  recommendedEditorKinds: [MATHESHOP_CANVAS_EDITOR_KIND, MATHESHOP_SETTINGS_EDITOR_KIND],
  defaultOpenRequests: [{ editorKind: MATHESHOP_CANVAS_EDITOR_KIND, title: '画布', restoreKey: 'matheshop-main-canvas' }],
  createDefaultLayout: () => createSingleGroupLayout({ groupId: 'matheshop-group-main', leafNodeId: 'matheshop-leaf-main' }),
  allowUserReset: true,
}

export const createMatheshopMainUiRuntime = () => {
  const runtime = createMainUiRuntime({ activeWorkspaceId: MATHESHOP_WORKSPACE_ID })
  runtime.core.registerEditor(canvasEditor)
  runtime.core.registerEditor(settingsEditor)
  runtime.core.registerWorkspace(workspace)
  const canvasRenderer = MatheshopCanvasEditor as unknown as Parameters<typeof runtime.vue.registerEditorRenderer>[1]
  const settingsRenderer = MatheshopSettingsEditor as unknown as Parameters<typeof runtime.vue.registerEditorRenderer>[1]
  runtime.vue.registerEditorRenderer(MATHESHOP_CANVAS_RENDERER_KEY, canvasRenderer)
  runtime.vue.registerEditorRenderer(MATHESHOP_SETTINGS_RENDERER_KEY, settingsRenderer)
  return runtime
}

export const matheshopRuntime = createMatheshopMainUiRuntime()