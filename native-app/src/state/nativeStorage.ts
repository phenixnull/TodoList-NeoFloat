import AsyncStorage from '@react-native-async-storage/async-storage'
import { createEmptyMobileState } from '../../../src/mobile/mobileState'
import type { PersistedState } from '../../../src/types/domain'
import type { SyncConfig } from '../../../src/types/sync'
import { normalizeSyncConfig } from '../../../src/lib/sync'
import { sumClosedDurations } from '../../../src/lib/time'

const MOBILE_SYNC_CONFIG_STORAGE_KEY = 'neo-float-native-sync-config'
const MOBILE_STATE_STORAGE_KEY = 'neo-float-native-state'

function isPersistedState(value: unknown): value is PersistedState {
  if (!value || typeof value !== 'object') {
    return false
  }

  const candidate = value as Partial<PersistedState>
  return candidate.version === 1 && Array.isArray(candidate.tasks) && typeof candidate.updatedAt === 'string'
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
              durationMs:
                typeof segment.durationMs === 'number' && Number.isFinite(segment.durationMs)
                  ? Math.max(0, segment.durationMs)
                  : 0,
            }))
        : []

      const totalDurationMs =
        typeof task.totalDurationMs === 'number' && Number.isFinite(task.totalDurationMs)
          ? Math.max(0, task.totalDurationMs)
          : sumClosedDurations(segments)

      return {
        ...task,
        hidden: Boolean(task.hidden),
        showDuration: task.showDuration !== false,
        durationLayoutMode: task.durationLayoutMode === 'inline' ? 'inline' : 'stacked',
        segments,
        totalDurationMs,
        order: typeof task.order === 'number' ? task.order : index + 1,
      }
    }),
  }
}

export async function loadNativeSyncConfig(): Promise<SyncConfig> {
  const raw = await AsyncStorage.getItem(MOBILE_SYNC_CONFIG_STORAGE_KEY)
  if (!raw) {
    return normalizeSyncConfig({ enabled: false, serverUrl: '', token: '' })
  }

  try {
    return normalizeSyncConfig(JSON.parse(raw) as Partial<SyncConfig>)
  } catch {
    return normalizeSyncConfig({ enabled: false, serverUrl: '', token: '' })
  }
}

export async function saveNativeSyncConfig(config: SyncConfig): Promise<SyncConfig> {
  const normalized = normalizeSyncConfig(config)
  await AsyncStorage.setItem(MOBILE_SYNC_CONFIG_STORAGE_KEY, JSON.stringify(normalized))
  return normalized
}

export async function loadNativeState(): Promise<PersistedState> {
  const raw = await AsyncStorage.getItem(MOBILE_STATE_STORAGE_KEY)
  if (!raw) {
    return createEmptyMobileState(new Date().toISOString())
  }

  try {
    const parsed = JSON.parse(raw) as unknown
    return isPersistedState(parsed) ? normalizePersistedState(parsed) : createEmptyMobileState(new Date().toISOString())
  } catch {
    return createEmptyMobileState(new Date().toISOString())
  }
}

export async function saveNativeState(state: PersistedState): Promise<void> {
  await AsyncStorage.setItem(MOBILE_STATE_STORAGE_KEY, JSON.stringify(state))
}
