/**
 * exprSelection.ts
 *
 * 表达式（token/字符串）相关的“内联选择”数据结构与工具函数：
 * - InlineSelection：用于描述编辑器内的选区（当前实现为 tokenRange）
 * - normalizeRange：将 start/end 归一化为 start <= end，便于后续渲染或编辑逻辑统一处理
 */
export type InlineSelection =
  | {
      kind: 'tokenRange'
      start: number
      end: number
    }

export function normalizeRange(start: number, end: number): { start: number; end: number } {
  return start <= end ? { start, end } : { start: end, end: start }
}
