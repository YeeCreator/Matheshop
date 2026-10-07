/**
 * Python 引擎配置（公开侧）。
 *
 * 依「开源与非公开内容适配规范」规则 1 + 2：
 * - **公开侧**（本文件）只声明「环境变量名」，不含任何本机路径；
 * - **本机侧** 的真实位置写在 `.env.local`（已被 `.gitignore` 排除）。
 *
 * 本机配置方式：
 *   cp .env.example .env.local
 *   # 编辑 .env.local，填入 MATHSYMCALC_ENGINE_ROOT 的真实路径
 *
 * 说明：本文件当前被设置界面用于**展示配置提示**（告诉用户应设置哪个环境变量），
 * 故不在此处读取真实值 —— 真实值由后端服务与宿主环境自行解析。
 */

/** 后端服务读取的环境变量名（对外公开，不含路径信息）。 */
export const MATHESHOP_PYTHON_ENGINE_ENV = 'MATHSYMCALC_ENGINE_ROOT'

/** 配置提示文案（设置界面展示用，不含本机路径）。 */
export const MATHESHOP_PYTHON_ENGINE_ROOT = '<由环境变量 MATHSYMCALC_ENGINE_ROOT 提供>'
