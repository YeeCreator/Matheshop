export type InlineSelection =
  | {
      kind: 'tokenRange'
      start: number
      end: number
    }

export function normalizeRange(start: number, end: number): { start: number; end: number } {
  return start <= end ? { start, end } : { start: end, end: start }
}

