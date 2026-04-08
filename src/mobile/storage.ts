import type { PersistedState } from '../types/domain.ts'
import type { SyncConfig } from '../types/sync.ts'
import { normalizeSyncConfig } from '../lib/sync.ts'
import { normalizeTaskMeta } from '../lib/taskMeta.ts'
import { sumClosedDurations } from '../lib/time.ts'

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

function normalizePersistedState(state: PersistedState): PersistedState {
  return {
    ...state,
    tasks: state.tasks.map((task, index) => {
      const segments = Array.isArray(task.segments)
        ? task.segments
            .filter((segment) => Boolean(segment && typeof segment.startAt === 'string'))
            .map((segment) => ({
              startAt: segment.startAt,
              pauseAt: typeof segment.pauseAt === 'string' ? segment.pauseAt : null,
              durationMs: typeof segment.durationMs === 'number' && Number.isFinite(segment.durationMs) ? Math.max(0, segment.durationMs) : 0,
            }))
        : []

      const totalDurationMs =
        typeof task.totalDurationMs === 'number' && Number.isFinite(task.totalDurationMs)
          ? Math.max(0, task.totalDurationMs)
          : sumClosedDurations(segments)

      return {
        ...task,
        meta: normalizeTaskMeta(task.meta),
        hidden: Boolean(task.hidden),
        hiddenAt:
          typeof task.hiddenAt === 'string'
            ? task.hiddenAt
            : task.hidden
              ? typeof task.updatedAt === 'string'
                ? task.updatedAt
                : typeof task.archivedAt === 'string'
                  ? task.archivedAt
                  : typeof task.finishedAt === 'string'
                    ? task.finishedAt
                    : typeof task.createdAt === 'string'
                      ? task.createdAt
                      : null
              : null,
        showDuration: task.showDuration !== false,
        durationLayoutMode: task.durationLayoutMode === 'inline' ? 'inline' : 'stacked',
        segments,
        totalDurationMs,
        order: typeof task.order === 'number' ? task.order : index + 1,
      }
    }),
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
  return isPersistedState(parsed) ? normalizePersistedState(parsed) : null
}

export function saveStoredMobileState(storage: JsonStorage, state: PersistedState): void {
  storage.setItem(MOBILE_STATE_STORAGE_KEY, JSON.stringify(state))
}
