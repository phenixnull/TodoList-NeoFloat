export interface SyncConfig {
  enabled: boolean
  serverUrl: string
  token: string
}

export interface SyncStatus {
  enabled: boolean
  phase: 'idle' | 'syncing' | 'error'
  lastSyncAt: string | null
  lastPullAt: string | null
  lastPushAt: string | null
  lastError: string | null
}
