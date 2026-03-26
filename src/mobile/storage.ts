import type { PersistedState } from '../types/domain.ts'
import type { SyncConfig } from '../types/sync.ts'
import { normalizeSyncConfig } from '../lib/sync.ts'

export const MOBILE_SYNC_CONFIG_STORAGE_KEY = 'neo-float-mobile-sync-config'
export const MOBILE_STATE_STORAGE_KEY = 'neo-float-mobile-state'

type JsonStorage = {
  getItem: (key: string) => string | null
  setItem: (key: string, value: string) => void
  removeItem?: (key: string) => void
}

const EMPTY_SYNC_CONFIG: SyncConfig = {
  enabled: false,
  serverUrl: '',
  token: '',
}

function isPersistedState(value: unknown): value is PersistedState {
  if (!value || typeof value !== 'object') {
    return false
  }

  const candidate = value as Partial<PersistedState>
  return candidate.version === 1 && Array.isArray(candidate.tasks) && typeof candidate.updatedAt === 'string'
}

function parseStoredJson<T>(storage: JsonStorage, key: string): T | null {
  const raw = storage.getItem(key)
  if (!raw) {
    return null
  }

  try {
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

export function loadStoredSyncConfig(storage: JsonStorage): SyncConfig {
  const parsed = parseStoredJson<Partial<SyncConfig>>(storage, MOBILE_SYNC_CONFIG_STORAGE_KEY)
  return normalizeSyncConfig(parsed ?? EMPTY_SYNC_CONFIG)
}

export function saveStoredSyncConfig(storage: JsonStorage, config: SyncConfig): SyncConfig {
  const normalized = normalizeSyncConfig(config)
  storage.setItem(MOBILE_SYNC_CONFIG_STORAGE_KEY, JSON.stringify(normalized))
  return normalized
}

export function loadStoredMobileState(storage: JsonStorage): PersistedState | null {
  const parsed = parseStoredJson<unknown>(storage, MOBILE_STATE_STORAGE_KEY)
  return isPersistedState(parsed) ? parsed : null
}

export function saveStoredMobileState(storage: JsonStorage, state: PersistedState): void {
  storage.setItem(MOBILE_STATE_STORAGE_KEY, JSON.stringify(state))
}
