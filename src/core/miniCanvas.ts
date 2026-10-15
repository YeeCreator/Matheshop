/**
 * T3 · 内嵌子画布便签（MiniCanvasNote，范式二容器原语）。
 *
 * **架构纪律（关键）**：主画布 `boardCore` 的 snapshot 是**扁平**的。
 * 若让 cell 直接持有子 cells/edges，会迫使 boardCore 递归化，订阅、克隆、
 * 撤销全部要改。故此处采用**独立 board + 引用**方案：
 *
 * ```
 * 主画布（board A）
 *   └─ cell#7  kind=MiniCanvas  subBoardId="sub-xxx"
 *                                 │
 * 子画布（board B，同样是一个普通白板记录）←── 引用，非嵌套
 * ```
 *
 * 子画布本身就是一份普通白板（`MatheshopWhiteboardFileRecord`），经
 * `matheshopWhiteboardFiles` 统一管理；主画布只存其 id。
 * 嵌套深度由 `maxNestingDepth` 约束，防止复杂度爆炸。
 */

import type { CellId, MatheshopCell } from './matheshopTypes'

/** 缺省最大嵌套深度（主画布为第 0 层；其便签为第 1 层）。 */
export const DEFAULT_MAX_NESTING_DEPTH = 3

/** 子画布引用（写在主画布 cell 上的最小数据）。 */
export type SubBoardRef = {
  /** 子画布对应的白板记录 id。 */
  subBoardId: string
  /** 当前嵌套深度（主画布为 0）；用于与 `maxNestingDepth` 比较。 */
  depth: number
  /** 视图态：缩略预览 or 展开编辑（属视图层，不入对象层）。 */
  view: 'thumbnail' | 'expanded'
}

/** 便签 cell 的判别辅助：`kind === 'MiniCanvas'` 且带 `subBoard`。 */
export type MiniCanvasCell = MatheshopCell & { kind: 'MiniCanvas'; subBoard: SubBoardRef }

/**
 * 判断一个 cell 是否是可展开的便签。
 *
 * @param cell 待判定的单元。
 * @returns 若是便签则返回其引用，否则 null。
 *
 * @example
 * const ref = asMiniCanvas(cell)   // -> SubBoardRef | null
 */
export function asMiniCanvas(cell: MatheshopCell): SubBoardRef | null {
  const kind = (cell as { kind?: string }).kind
  if (kind !== 'MiniCanvas') return null
  const ref = (cell as { subBoard?: SubBoardRef }).subBoard
  return ref && typeof ref.subBoardId === 'string' ? ref : null
}

/**
 * 是否可以再向内嵌一层（深度约束）。
 *
 * @param ref 当前便签引用；`null` 表示正在主画布（第 0 层）。
 * @param maxDepth 最大嵌套深度。
 * @returns 可再嵌则为 true。
 *
 * @example
 * canNest(null, 3)                          // -> true（主画布可嵌第 1 层）
 * canNest({ depth: 3, ... }, 3)             // -> false（已达上限）
 */
export function canNest(ref: SubBoardRef | null, maxDepth = DEFAULT_MAX_NESTING_DEPTH): boolean {
  const depth = ref?.depth ?? 0
  return depth < maxDepth
}

/**
 * 由父层引用派生新便签的子画布引用。
 *
 * @param subBoardId 新建子画布的记录 id。
 * @param parent 父层便签引用；`null` 表示父层是主画布。
 * @returns 新的便签引用（默认缩略态）。
 *
 * @example
 * const child = deriveSubBoardRef('wb-2', null)   // -> { depth: 1, view: 'thumbnail' }
 */
export function deriveSubBoardRef(subBoardId: string, parent: SubBoardRef | null): SubBoardRef {
  return { subBoardId, depth: (parent?.depth ?? 0) + 1, view: 'thumbnail' }
}

/** 便签的视图态切换意图。 */
export type SubBoardViewToggle = { cellId: CellId; view: SubBoardRef['view'] }
