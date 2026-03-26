import type { PersistedState, Task } from '../types/domain'
import type { SyncConfig } from '../types/sync'
import { DEFAULT_APP_SETTINGS } from './defaultSettings.ts'

const FALLBACK_SYNC_CONFIG: SyncConfig = {
  enabled: false,
  serverUrl: '',
  token: '',
}

function normalizeServerUrl(value: string): string {
  return value.trim().replace(/\/+$/, '')
}

function toComparableTime(value: string | null | undefined): number {
  if (!value) {
    return 0
  }
  const ms = Date.parse(value)
  return Number.isFinite(ms) ? ms : 0
}

function taskActivityTime(task: Task): number {
  const taskTimes = [
    task.updatedAt,
    task.createdAt,
    task.finishedAt,
    task.archivedAt,
    ...task.segments.flatMap((segment) => [segment.startAt, segment.pauseAt]),
  ]
  return Math.max(...taskTimes.map((value) => toComparableTime(value)))
}

function latestTaskActivityTime(state: PersistedState | null | undefined): number {
  if (!state || state.tasks.length === 0) {
    return 0
  }

  return Math.max(...state.tasks.map((task) => taskActivityTime(task)))
}

export function normalizeSyncConfig(value: Partial<SyncConfig> | null | undefined): SyncConfig {
  const serverUrl = normalizeServerUrl(typeof value?.serverUrl === 'string' ? value.serverUrl : '')
  const token = typeof value?.token === 'string' ? value.token.trim() : ''
  const enabled = Boolean(value?.enabled) && Boolean(serverUrl) && Boolean(token)

  return {
    ...FALLBACK_SYNC_CONFIG,
    enabled,
    serverUrl,
    token,
  }
}

export function pickAuthoritativeState(
  localState: PersistedState | null | undefined,
  remoteState: PersistedState | null | undefined,
): PersistedState | null {
  if (!localState && !remoteState) {
    return null
  }
  if (!localState) {
    return remoteState ?? null
  }
  if (!remoteState) {
    return localState
  }

  return toComparableTime(remoteState.updatedAt) > toComparableTime(localState.updatedAt) ? remoteState : localState
}

export function compareTaskActivity(
  localState: PersistedState | null | undefined,
  remoteState: PersistedState | null | undefined,
): -1 | 0 | 1 {
  if (!localState && !remoteState) {
    return 0
  }
  if (!localState) {
    return -1
  }
  if (!remoteState) {
    return 1
  }

  const localActivity = latestTaskActivityTime(localState)
  const remoteActivity = latestTaskActivityTime(remoteState)

  if (localActivity === remoteActivity) {
    return 0
  }

  return remoteActivity > localActivity ? -1 : 1
}

export function mergeRemoteTasksIntoLocalState(
  localState: PersistedState | null | undefined,
  remoteState: PersistedState | null | undefined,
): PersistedState {
  if (!remoteState) {
    return localState ?? {
      version: 1,
      tasks: [],
      settings: { ...DEFAULT_APP_SETTINGS },
      updatedAt: '',
    }
  }
  if (!localState) {
    return remoteState
  }

  return {
    ...remoteState,
    settings: { ...localState.settings },
  }
}

export function mergeLocalTasksIntoRemoteState(
  localState: PersistedState | null | undefined,
  remoteState: PersistedState | null | undefined,
): PersistedState {
  if (!localState) {
    return remoteState ?? {
      version: 1,
      tasks: [],
      settings: { ...DEFAULT_APP_SETTINGS },
      updatedAt: '',
    }
  }
  if (!remoteState) {
    return localState
  }

  return {
    ...localState,
    settings: { ...remoteState.settings },
  }
}

export function collectTaskAssetPaths(tasks: Task[]): string[] {
  const uniquePaths = new Set<string>()

  tasks.forEach((task) => {
    task.attachments.forEach((attachment) => {
      if (typeof attachment.storagePath === 'string' && attachment.storagePath) {
        uniquePaths.add(attachment.storagePath)
      }
    })
  })

  return [...uniquePaths]
}

export function buildRemoteAssetUrl(serverUrl: string, storagePath: string, token: string): string {
  const base = normalizeServerUrl(serverUrl)
  const path = storagePath
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/')
  const url = new URL(`${base}/api/assets/${path}`)
  if (token) {
    url.searchParams.set('token', token)
  }
  return url.toString()
}
