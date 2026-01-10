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

