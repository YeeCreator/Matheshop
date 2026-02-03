/**
 * useCellEditing.ts
 *
 * cell 编辑态管理的辅助 hook（无 React hook 依赖，仅函数封装）：
 * - requestStartEditing：请求进入编辑态（设置 editingCellId）
 * - requestFinishEditing：请求结束编辑态并提交（可选 runEval）
 * - commitIfEditingOtherOnPointerDown：当左键点击其它 cell 时，自动提交当前正在编辑的 cell
 *
 * 目的：将“编辑态切换/提交”的交互规则集中，避免散落在组件事件里。
 */
export type UseCellEditingArgs = {
  editingCellId: string | null
  setEditingCellId: (v: string | null) => void
  commitCellEditing: (cellId: string, opts?: { runEval?: boolean }) => void
}

export function useCellEditing(args: UseCellEditingArgs) {
  const { editingCellId, setEditingCellId, commitCellEditing } = args

  const requestStartEditing = (cellId: string) => {
    setEditingCellId(cellId)
  }

  const requestFinishEditing = (cellId: string, opts?: { runEval?: boolean }) => {
    commitCellEditing(cellId, opts)
  }

  const commitIfEditingOtherOnPointerDown = (targetCellId: string, evButton: number) => {
    if (editingCellId && editingCellId !== targetCellId && evButton === 0) {
      commitCellEditing(editingCellId)
    }
  }

  return {
    requestStartEditing,
    requestFinishEditing,
    commitIfEditingOtherOnPointerDown,
  }
}
