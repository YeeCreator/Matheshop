export type EngineChoice = 'builtin_native' | 'builtin_python' | 'external'

export type EngineSelectionState = {
  choice: EngineChoice
}

const LS_KEY = 'matheshop:engineSelection:v1'

export const DEFAULT_ENGINE_SELECTION: EngineSelectionState = {
  choice: 'builtin_native',
}

export function loadEngineSelection(): EngineSelectionState {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (!raw) return DEFAULT_ENGINE_SELECTION
    const parsed = JSON.parse(raw) as Partial<EngineSelectionState> | null
    if (!parsed || typeof parsed !== 'object') return DEFAULT_ENGINE_SELECTION

    const choice: EngineChoice =
      parsed.choice === 'builtin_native' || parsed.choice === 'builtin_python' || parsed.choice === 'external'
        ? parsed.choice
        : DEFAULT_ENGINE_SELECTION.choice

    return { choice }
  } catch {
    return DEFAULT_ENGINE_SELECTION
  }
}

export function saveEngineSelection(next: EngineSelectionState): void {
  localStorage.setItem(LS_KEY, JSON.stringify(next))
}
