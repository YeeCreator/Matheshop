import type { SettingsPersistenceAdapter, SettingsSnapshot } from 'main-ui/core'

const STORAGE_KEY = 'matheshop:settings:v1'

const clone = <T>(value: T): T => structuredClone(value)

/**
 * Matheshop 宿主侧的 localStorage 设置持久化适配器。
 *
 * main-ui 的 `SettingsStore` 只内置了内存适配器，宿主需要自行提供
 * localStorage（或其它持久层）实现。这里沿用 Matheshop 现有的
 * localStorage 约定，把 `SettingsSnapshot` 以 JSON 形式持久化。
 */
export const createMatheshopSettingsPersistenceAdapter = (): SettingsPersistenceAdapter => {
  return {
    async load() {
      if (typeof window === 'undefined') {
        return null
      }
      try {
        const raw = window.localStorage.getItem(STORAGE_KEY)
        if (!raw) {
          return null
        }
        const parsed = JSON.parse(raw) as Partial<SettingsSnapshot> | null
        if (!parsed || typeof parsed !== 'object') {
          return null
        }
        return {
          version: typeof parsed.version === 'number' ? parsed.version : 1,
          user: parsed.user ?? {},
          workspace: parsed.workspace ?? {},
          profile: parsed.profile ?? {},
        }
      } catch {
        return null
      }
    },
    async save(snapshot) {
      if (typeof window === 'undefined') {
        return
      }
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(clone(snapshot)))
    },
    async clear() {
      if (typeof window === 'undefined') {
        return
      }
      window.localStorage.removeItem(STORAGE_KEY)
    },
  }
}

export const MATHESHOP_SETTINGS_STORAGE_KEY = STORAGE_KEY
