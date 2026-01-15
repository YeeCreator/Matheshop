/**
 * ids.ts
 *
 * 层级状态路径工具：
 * - 提供对以点分隔路径的常见操作（join/split/判定祖先/求 LCA /从根/从叶的路径序列等）。
 * - 这些工具用于 state path 的计算（如 LCA、ancestor chain、path 合并），是状态机内部路径计算基础。
 */

export function joinPath(parts: string[]): string {
  return parts.join('.');
}

export function splitPath(path: string): string[] {
  return path.split('.').filter(Boolean);
}

export function isAncestorPath(ancestor: string, leaf: string): boolean {
  if (ancestor === leaf) return true;
  return leaf.startsWith(ancestor + '.');
}

export function ancestorsFromRoot(path: string): string[] {
  const parts = splitPath(path);
  const res: string[] = [];
  for (let i = 1; i <= parts.length; i++) {
    res.push(joinPath(parts.slice(0, i)));
  }
  return res;
}

export function ancestorsFromLeaf(path: string): string[] {
  return ancestorsFromRoot(path).reverse();
}

export function lcaPath(a: string, b: string): string {
  const A = splitPath(a);
  const B = splitPath(b);
  const min = Math.min(A.length, B.length);
  const common: string[] = [];
  for (let i = 0; i < min; i++) {
    if (A[i] !== B[i]) break;
    common.push(A[i]);
  }
  return joinPath(common);
}
