/**
 * matheshop 工作台常量与引擎选项（**叶子模块**）。
 *
 * 本模块**不得 import 任何 Vue 组件或 workbench 运行时**——它的存在意义正是
 * 让渲染层（`src/vue/*.vue`）与运行时装配（`core/workbench.ts`）共用常量，
 * 而不产生「workbench ↔ 编辑器组件」的循环依赖。
 */
import type { EngineChoice } from '../engine/engineSelection'

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
export const MATHESHOP_CNL_WORKSPACE_ID = 'matheshop.workspace.cnl'
export const MATHESHOP_CNL_EDITOR_KIND = 'matheshop.cnl'
export const MATHESHOP_CNL_RENDERER_KEY = 'matheshop.renderer.cnl'
export const MATHESHOP_CANVAS_GROUP_ID = 'matheshop-group-main'

export const MATHESHOP_ENGINE_CHOICE_SETTING_ID = 'matheshop.engineChoice'

/** 供 setting schema 与设置面板共用的引擎选项清单。 */
export const MATHESHOP_ENGINE_CHOICES: Array<{ value: EngineChoice; label: string }> = [
  { value: 'builtin_python', label: '内置 Python 高性能计算后台' },
  { value: 'builtin_native', label: '浏览器 TypeScript 轻量后备' },
  { value: 'external', label: '外接计算引擎占位' },
]
