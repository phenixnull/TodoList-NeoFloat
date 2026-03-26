import type { EventDraft, PersistedState, TaskImageAttachment } from './domain'
import type { SyncConfig, SyncStatus } from './sync'

type PersistPayload = {
  state: PersistedState
  event: EventDraft
}

type ApiResult = {
  ok: boolean
  error?: string
}

type SyncNowResult = ApiResult & {
  result?: {
    direction: 'disabled' | 'noop' | 'pull' | 'push'
  }
}

type EdgeSide = 'left' | 'right' | 'top' | null
type EdgeMode = 'none' | 'auto' | 'manual'
type EdgeState = {
  hidden: boolean
  side: EdgeSide
  mode: EdgeMode
  manual: boolean
}

declare global {
  interface Window {
    todoAPI?: {
      getState: () => Promise<PersistedState>
      getEventDateRange: () => Promise<{ earliestDate: string | null; latestDate: string | null }>
      persistState: (payload: PersistPayload) => Promise<ApiResult>
      saveTaskImage: (payload: {
        taskId: string
        mimeType: string
        bytes: Uint8Array
      }) => Promise<ApiResult & { image?: TaskImageAttachment }>
      readTaskImageDataUrl: (storagePath: string) => Promise<string | null>
      openTaskImage: (storagePath: string) => Promise<ApiResult>
      setWindowOptions: (options: {
        opacity?: number
        alwaysOnTop?: boolean
        edgeAutoHide?: boolean
      }) => Promise<ApiResult>
      setAutoLaunch: (enabled: boolean) => Promise<ApiResult>
      windowControl: (action: 'minimize' | 'close') => Promise<ApiResult>
      getEdgeState: () => Promise<EdgeState>
      toggleEdgeCollapse: () => Promise<ApiResult & { state?: EdgeState }>
      getWindowPosition: () => Promise<{ x: number; y: number } | null>
      setWindowPosition: (position: { x: number; y: number }) => Promise<ApiResult>
      getWindowBounds: () => Promise<{ x: number; y: number; width: number; height: number } | null>
      setWindowBounds: (bounds: {
        x: number
        y: number
        width: number
        height: number
      }) => Promise<ApiResult>
      getSyncConfig: () => Promise<SyncConfig & { error?: string }>
      setSyncConfig: (config: SyncConfig) => Promise<SyncConfig & { error?: string }>
      getSyncStatus: () => Promise<SyncStatus>
      syncNow: () => Promise<SyncNowResult>
      onPersistError: (callback: (message: string) => void) => () => void
      onEdgeState: (callback: (state: EdgeState) => void) => () => void
      onBeforeCloseFlush: (callback: () => Promise<void> | void) => () => void
      onSyncStatus: (callback: (status: SyncStatus) => void) => () => void
      onStateRefreshed: (callback: () => void) => () => void
    }
  }
}

export {}
