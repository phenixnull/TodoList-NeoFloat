import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { compareTaskActivity, mergeLocalTasksIntoRemoteState, mergeRemoteTasksIntoLocalState } from '../lib/sync.ts'
import { calcTaskDuration, formatDuration, localDateTimeText, toLocalIso } from '../lib/time.ts'
import type { PersistedState, Task, TaskStatus } from '../types/domain.ts'
import type { SyncConfig } from '../types/sync.ts'
import { buildMobileAssetUrl, fetchRemoteState, saveRemoteState } from './api.ts'
import {
  addMobileTask,
  archiveMobileTask,
  createEmptyMobileState,
  deleteMobileTask,
  toggleMobileTaskFinished,
  toggleMobileTaskTimer,
  unarchiveMobileTask,
  updateMobileTaskContent,
} from './mobileState.ts'
import {
  loadStoredMobileState,
  loadStoredSyncConfig,
  saveStoredMobileState,
  saveStoredSyncConfig,
} from './storage.ts'

type MobileFilter = 'active' | 'finished' | 'archived' | 'all'
type SyncDirection = 'pull' | 'push' | 'noop' | null
type SyncPhase = 'idle' | 'syncing' | 'error'

type MobileSyncState = {
  phase: SyncPhase
  lastError: string | null
  lastSyncAt: string | null
  direction: SyncDirection
  dirty: boolean
  message: string
}

const APP_NAME = 'Neo Float Todo'
const AUTO_SYNC_DELAY_MS = 1400
const POLL_INTERVAL_MS = 45000

const TEXT_LOCAL_MODE = '\u672c\u5730\u6a21\u5f0f'
const TEXT_WAIT_CONNECT = '\u7b49\u5f85\u8fde\u63a5\u670d\u52a1\u5668'
const TEXT_SYNCING = '\u540c\u6b65\u4e2d...'
const TEXT_CHECKING_SERVER = '\u68c0\u67e5\u670d\u52a1\u5668\u66f4\u65b0...'
const TEXT_SYNC_FAILED = '\u540c\u6b65\u5931\u8d25'
const TEXT_PENDING_SYNC = '\u5f85\u540c\u6b65'
const TEXT_PUSHED = '\u5df2\u63a8\u9001'
const TEXT_PULLED = '\u5df2\u62c9\u53d6'
const TEXT_SYNCED = '\u5df2\u540c\u6b65'
const TEXT_SYNC_PUSH_MESSAGE = '\u672c\u5730\u4fee\u6539\u5df2\u63a8\u9001\u5230\u670d\u52a1\u5668'
const TEXT_SYNC_PULL_MESSAGE = '\u5df2\u62c9\u53d6\u670d\u52a1\u5668\u6700\u65b0\u8bb0\u5f55'
const TEXT_SYNC_MATCH_MESSAGE = '\u684c\u9762\u4e0e\u624b\u673a\u5df2\u7ecf\u4e00\u81f4'
const TEXT_SYNC_FAILED_MESSAGE =
  '\u540c\u6b65\u5931\u8d25\uff0c\u8bf7\u68c0\u67e5\u670d\u52a1\u5668\u5730\u5740\u548c Token'
const TEXT_LOCAL_DIRTY_MESSAGE = '\u672c\u5730\u5df2\u4fee\u6539\uff0c\u7b49\u5f85\u540c\u6b65'
const TEXT_CONFIG_SAVED_MESSAGE = '\u914d\u7f6e\u5df2\u4fdd\u5b58\uff0c\u51c6\u5907\u8fde\u63a5\u670d\u52a1\u5668'
const TEXT_CONFIG_INCOMPLETE_MESSAGE =
  '\u5730\u5740\u548c Token \u672a\u586b\u5b8c\u6574\uff0c\u5f53\u524d\u4fdd\u7559\u672c\u5730\u6a21\u5f0f'
const TEXT_SYNC_DISABLED_MESSAGE = '\u540c\u6b65\u5df2\u5173\u95ed\uff0c\u4ec5\u4fdd\u7559\u672c\u5730\u8bb0\u5f55'
const TEXT_NOT_SYNCED = '\u672a\u540c\u6b65'
const TEXT_MOBILE_BOARD = '\u624b\u673a\u4efb\u52a1\u9762\u677f'
const TEXT_SETTINGS = '\u8bbe\u7f6e'
const TEXT_CURRENT_VIEW = '\u5f53\u524d\u89c6\u56fe'
const TEXT_FILTER = '\u7b5b\u9009'
const TEXT_ACTIVE = '\u8fdb\u884c\u4e2d'
const TEXT_FINISHED = '\u5df2\u5b8c\u6210'
const TEXT_ARCHIVED = '\u5df2\u5f52\u6863'
const TEXT_ALL = '\u5168\u90e8'
const TEXT_RECENT_SYNC = '\u6700\u8fd1\u540c\u6b65'
const TEXT_LOCAL_MODIFIED_WAIT = '\u672c\u5730\u6709\u4fee\u6539\uff0c\u7b49\u5f85\u81ea\u52a8\u540c\u6b65'
const TEXT_NOT_CONNECTED = '\u672a\u8fde\u63a5\u670d\u52a1\u5668\uff0c\u4ec5\u4fdd\u7559\u672c\u5730\u8bb0\u5f55'
const TEXT_UPDATED_AT = '\u66f4\u65b0\u4e8e'
const TEXT_START = '\u5f00\u59cb'
const TEXT_PAUSE = '\u6682\u505c'
const TEXT_FINISH = '\u5b8c\u6210'
const TEXT_RESTORE = '\u6062\u590d'
const TEXT_MORE = '\u66f4\u591a'
const TEXT_ARCHIVE = '\u5f52\u6863'
const TEXT_UNARCHIVE = '\u53d6\u6d88\u5f52\u6863'
const TEXT_DELETE = '\u5220\u9664'
const TEXT_CLOSE = '\u5173\u95ed'
const TEXT_DONE = '\u5b8c\u6210'
const TEXT_SYNC_NOW = '\u7acb\u5373\u540c\u6b65'
const TEXT_VIEW_FILTER = '\u89c6\u56fe\u7b5b\u9009'
const TEXT_TASK_OVERVIEW = '\u4efb\u52a1\u6982\u89c8'
const TEXT_SYNC_SERVICE = '\u540c\u6b65\u670d\u52a1'
const TEXT_TOKEN_LOCAL_ONLY = 'Token \u53ea\u4fdd\u5b58\u5728\u5f53\u524d\u6d4f\u89c8\u5668'
const TEXT_ENABLE_SYNC = '\u542f\u7528\u540c\u6b65'
const TEXT_SERVER_URL = '\u670d\u52a1\u5668\u5730\u5740'
const TEXT_SAVE_SETTINGS = '\u4fdd\u5b58\u8bbe\u7f6e'
const TEXT_CANCEL = '\u53d6\u6d88'
const TEXT_FILL_TOKEN = '\u8f93\u5165\u540c\u6b65 Token'
const TEXT_SYNC_REQUIREMENTS =
  '\u8981\u542f\u7528\u540c\u6b65\uff0c\u670d\u52a1\u5668\u5730\u5740\u548c Token \u90fd\u8981\u586b\u5199'
const TEXT_EMPTY_STATE_TITLE = '\u5f53\u524d\u7b5b\u9009\u4e0b\u6ca1\u6709\u4efb\u52a1'
const TEXT_EMPTY_STATE_REMOTE =
  '\u53ef\u4ee5\u70b9\u51fb\u5e95\u90e8 + \u65b0\u5efa\u4efb\u52a1\uff0c\u6216\u8005\u5230\u8bbe\u7f6e\u91cc\u5207\u6362\u89c6\u56fe\u4e0e\u540c\u6b65'
const TEXT_EMPTY_STATE_LOCAL =
  '\u53ef\u4ee5\u70b9\u51fb\u5e95\u90e8 + \u65b0\u5efa\u4efb\u52a1\uff0c\u6216\u8005\u5148\u5728\u8bbe\u7f6e\u91cc\u8fde\u63a5\u670d\u52a1\u5668'
const TEXT_ACTIONS_TITLE = '\u4efb\u52a1\u64cd\u4f5c'
const TEXT_CONFIRM_DELETE = '\u786e\u5b9a\u8981\u5220\u9664\u8fd9\u6761\u4efb\u52a1\u5417\uff1f'
const TEXT_EMPTY_TASK = '\u7a7a\u4efb\u52a1'
const TEXT_STATUS_ARCHIVED = '\u5df2\u5f52\u6863'
const TEXT_STATUS_DOING = '\u8fdb\u884c\u4e2d'
const TEXT_STATUS_PAUSED = '\u5df2\u6682\u505c'
const TEXT_STATUS_FINISHED = '\u5df2\u5b8c\u6210'
const TEXT_STATUS_IDLE = '\u5f85\u5f00\u59cb'
const TEXT_FLAG_UNFINISHED = '\u672a\u5b8c\u6210'
const TEXT_ADD_TASK = '\u65b0\u5efa\u4efb\u52a1'
const TEXT_MOBILE_TIP = '\u4e3b\u754c\u9762\u53ea\u4fdd\u7559\u6838\u5fc3\u4efb\u52a1\uff0c\u5176\u4ed6\u9009\u9879\u90fd\u5728\u8bbe\u7f6e\u91cc'

const EMPTY_SYNC_CONFIG: SyncConfig = {
  enabled: false,
  serverUrl: '',
  token: '',
}

const EMPTY_SYNC_STATE: MobileSyncState = {
  phase: 'idle',
  lastError: null,
  lastSyncAt: null,
  direction: null,
  dirty: false,
  message: TEXT_LOCAL_MODE,
}

function getInitialConfig(): SyncConfig {
  if (typeof window === 'undefined') {
    return EMPTY_SYNC_CONFIG
  }
  return loadStoredSyncConfig(window.localStorage)
}

function getInitialSnapshot(): PersistedState {
  if (typeof window === 'undefined') {
    return createEmptyMobileState(toLocalIso())
  }
  return loadStoredMobileState(window.localStorage) ?? createEmptyMobileState(toLocalIso())
}

function formatSyncLabel(syncState: MobileSyncState): string {
  if (syncState.phase === 'syncing') {
    return TEXT_SYNCING
  }
  if (syncState.phase === 'error') {
    return TEXT_SYNC_FAILED
  }
  if (!syncState.lastSyncAt) {
    return syncState.dirty ? TEXT_PENDING_SYNC : TEXT_LOCAL_MODE
  }
  if (syncState.direction === 'push') {
    return TEXT_PUSHED
  }
  if (syncState.direction === 'pull') {
    return TEXT_PULLED
  }
  return syncState.dirty ? TEXT_PENDING_SYNC : TEXT_SYNCED
}

function taskStatusText(task: Task): string {
  if (task.archived) {
    return TEXT_STATUS_ARCHIVED
  }
  if (task.status === 'doing') {
    return TEXT_STATUS_DOING
  }
  if (task.status === 'paused') {
    return TEXT_STATUS_PAUSED
  }
  if (task.status === 'finished') {
    return TEXT_STATUS_FINISHED
  }
  return TEXT_STATUS_IDLE
}

function taskStatusClass(task: Task): TaskStatus | 'archived' {
  return task.archived ? 'archived' : task.status
}

function taskCompletionFlag(task: Task): string {
  if (task.archived) {
    return TEXT_STATUS_ARCHIVED
  }
  return task.status === 'finished' ? TEXT_STATUS_FINISHED : TEXT_FLAG_UNFINISHED
}

function taskRuntimeFlag(task: Task): string | null {
  if (task.archived || task.status === 'finished') {
    return null
  }
  if (task.status === 'doing') {
    return TEXT_STATUS_DOING
  }
  if (task.status === 'paused') {
    return TEXT_STATUS_PAUSED
  }
  return TEXT_STATUS_IDLE
}

function formatSyncTime(value: string | null): string {
  if (!value) {
    return TEXT_NOT_SYNCED
  }
  return localDateTimeText(value)
}

function summarizeTask(task: Task): string {
  const firstLine = task.contentRaw.trim().split(/\r?\n/, 1)[0]?.trim()
  if (!firstLine) {
    return TEXT_EMPTY_TASK
  }
  return firstLine.slice(0, 48)
}

export function MobileApp() {
  const [config, setConfig] = useState<SyncConfig>(() => getInitialConfig())
  const [draftConfig, setDraftConfig] = useState<SyncConfig>(() => getInitialConfig())
  const [snapshot, setSnapshot] = useState<PersistedState>(() => getInitialSnapshot())
  const [syncState, setSyncState] = useState<MobileSyncState>(() => ({
    ...EMPTY_SYNC_STATE,
    message: getInitialConfig().enabled ? TEXT_WAIT_CONNECT : TEXT_LOCAL_MODE,
  }))
  const [filter, setFilter] = useState<MobileFilter>('active')
  const [settingsOpen, setSettingsOpen] = useState(() => !getInitialConfig().enabled)
  const [taskMenuId, setTaskMenuId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [nowMs, setNowMs] = useState(() => Date.now())
  const snapshotRef = useRef(snapshot)
  const configRef = useRef(config)
  const syncLockRef = useRef(false)

  useEffect(() => {
    snapshotRef.current = snapshot
    saveStoredMobileState(window.localStorage, snapshot)
  }, [snapshot])

  useEffect(() => {
    configRef.current = config
  }, [config])

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNowMs(Date.now())
    }, 1000)

    return () => window.clearInterval(timer)
  }, [])

  const runSync = useCallback(async (reason: 'manual' | 'auto' | 'poll' | 'connect' | 'resume') => {
    const currentConfig = configRef.current
    if (!currentConfig.enabled) {
      setSyncState((current) => ({
        ...current,
        phase: 'idle',
        message: TEXT_LOCAL_MODE,
      }))
      return
    }

    if (syncLockRef.current) {
      return
    }

    syncLockRef.current = true
    setBusy(true)
    setSyncState((current) => ({
      ...current,
      phase: 'syncing',
      lastError: null,
      message: reason === 'poll' ? TEXT_CHECKING_SERVER : TEXT_SYNCING,
    }))

    try {
      const localState = snapshotRef.current
      const remoteState = await fetchRemoteState(currentConfig)
      const direction = compareTaskActivity(localState, remoteState)
      const syncedAt = toLocalIso()

      if (direction > 0) {
        const merged = mergeLocalTasksIntoRemoteState(localState, remoteState)
        const saved = await saveRemoteState(currentConfig, merged)
        setSnapshot(saved)
        setSyncState({
          phase: 'idle',
          lastError: null,
          lastSyncAt: syncedAt,
          direction: 'push',
          dirty: false,
          message: TEXT_SYNC_PUSH_MESSAGE,
        })
      } else if (direction < 0) {
        const merged = mergeRemoteTasksIntoLocalState(localState, remoteState)
        setSnapshot(merged)
        setSyncState({
          phase: 'idle',
          lastError: null,
          lastSyncAt: syncedAt,
          direction: 'pull',
          dirty: false,
          message: TEXT_SYNC_PULL_MESSAGE,
        })
      } else {
        setSyncState((current) => ({
          ...current,
          phase: 'idle',
          lastError: null,
          lastSyncAt: syncedAt,
          direction: 'noop',
          dirty: false,
          message: TEXT_SYNC_MATCH_MESSAGE,
        }))
      }
    } catch (error) {
      setSyncState((current) => ({
        ...current,
        phase: 'error',
        lastError: error instanceof Error ? error.message : String(error),
        message: TEXT_SYNC_FAILED_MESSAGE,
      }))
    } finally {
      syncLockRef.current = false
      setBusy(false)
    }
  }, [])

  useEffect(() => {
    if (!config.enabled || !syncState.dirty) {
      return
    }

    const timer = window.setTimeout(() => {
      void runSync('auto')
    }, AUTO_SYNC_DELAY_MS)

    return () => window.clearTimeout(timer)
  }, [config.enabled, runSync, snapshot.updatedAt, syncState.dirty])

  useEffect(() => {
    if (!config.enabled) {
      return
    }

    const intervalId = window.setInterval(() => {
      void runSync('poll')
    }, POLL_INTERVAL_MS)

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void runSync('resume')
      }
    }

    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => {
      window.clearInterval(intervalId)
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [config.enabled, runSync])

  useEffect(() => {
    if (config.enabled) {
      void runSync('connect')
    }
  }, [config.enabled, config.serverUrl, config.token, runSync])

  const orderedTasks = useMemo(() => [...snapshot.tasks].sort((a, b) => a.order - b.order), [snapshot.tasks])

  const taskCounts = useMemo(
    () => ({
      active: orderedTasks.filter((task) => !task.archived && task.status !== 'finished').length,
      finished: orderedTasks.filter((task) => !task.archived && task.status === 'finished').length,
      archived: orderedTasks.filter((task) => task.archived).length,
      all: orderedTasks.length,
    }),
    [orderedTasks],
  )

  const filterOptions: Array<{ id: MobileFilter; label: string; count: number }> = useMemo(
    () => [
      { id: 'active', label: TEXT_ACTIVE, count: taskCounts.active },
      { id: 'finished', label: TEXT_FINISHED, count: taskCounts.finished },
      { id: 'archived', label: TEXT_ARCHIVED, count: taskCounts.archived },
      { id: 'all', label: TEXT_ALL, count: taskCounts.all },
    ],
    [taskCounts.active, taskCounts.archived, taskCounts.all, taskCounts.finished],
  )

  const activeFilter = filterOptions.find((option) => option.id === filter) ?? filterOptions[0]

  const visibleTasks = useMemo(() => {
    switch (filter) {
      case 'active':
        return orderedTasks.filter((task) => !task.archived && task.status !== 'finished')
      case 'finished':
        return orderedTasks.filter((task) => !task.archived && task.status === 'finished')
      case 'archived':
        return orderedTasks.filter((task) => task.archived)
      default:
        return orderedTasks
    }
  }, [filter, orderedTasks])

  const selectedTask = useMemo(
    () => orderedTasks.find((task) => task.id === taskMenuId) ?? null,
    [orderedTasks, taskMenuId],
  )

  useEffect(() => {
    if (taskMenuId && !selectedTask) {
      setTaskMenuId(null)
    }
  }, [selectedTask, taskMenuId])

  const applyLocalState = (updater: (current: PersistedState, updatedAt: string) => PersistedState) => {
    const updatedAt = toLocalIso()
    setSnapshot((current) => updater(current, updatedAt))
    setSyncState((current) => ({
      ...current,
      phase: current.phase === 'error' ? 'idle' : current.phase,
      dirty: true,
      message: TEXT_LOCAL_DIRTY_MESSAGE,
      lastError: null,
    }))
  }

  const handleOpenSettings = () => {
    setDraftConfig(configRef.current)
    setSettingsOpen(true)
  }

  const handleCloseSettings = () => {
    setDraftConfig(configRef.current)
    setSettingsOpen(false)
  }

  const handleCloseTaskMenu = () => {
    setTaskMenuId(null)
  }

  const canEnableSync = Boolean(draftConfig.serverUrl.trim()) && Boolean(draftConfig.token.trim())

  const handleSaveConfig = async () => {
    const nextConfig: SyncConfig = {
      enabled: draftConfig.enabled && canEnableSync,
      serverUrl: draftConfig.serverUrl.trim(),
      token: draftConfig.token.trim(),
    }
    const saved = saveStoredSyncConfig(window.localStorage, nextConfig)
    configRef.current = saved
    setConfig(saved)
    setDraftConfig(saved)
    setSettingsOpen(false)
    setSyncState((current) => ({
      ...current,
      phase: 'idle',
      lastError: null,
      message:
        saved.enabled
          ? TEXT_CONFIG_SAVED_MESSAGE
          : draftConfig.enabled && !canEnableSync
            ? TEXT_CONFIG_INCOMPLETE_MESSAGE
            : TEXT_SYNC_DISABLED_MESSAGE,
    }))
  }

  const handleAddTask = () => {
    setFilter('active')
    applyLocalState((current, updatedAt) => addMobileTask(current, updatedAt))
  }

  const isOverlayOpen = settingsOpen || Boolean(selectedTask)

  useEffect(() => {
    if (!isOverlayOpen) {
      return
    }

    const previousOverflow = document.body.style.overflow
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') {
        return
      }
      if (selectedTask) {
        setTaskMenuId(null)
        return
      }
      setDraftConfig(configRef.current)
      setSettingsOpen(false)
    }

    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', onKeyDown)

    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [isOverlayOpen, selectedTask])

  const handleDeleteTask = (taskId: string) => {
    if (typeof window !== 'undefined' && !window.confirm(TEXT_CONFIRM_DELETE)) {
      return
    }

    applyLocalState((current, updatedAt) => deleteMobileTask(current, taskId, updatedAt))
    handleCloseTaskMenu()
  }

  const syncSummaryText =
    syncState.phase === 'error'
      ? syncState.lastError ?? TEXT_SYNC_FAILED
      : syncState.dirty
        ? TEXT_LOCAL_MODIFIED_WAIT
        : config.enabled
          ? `${TEXT_RECENT_SYNC} ${formatSyncTime(syncState.lastSyncAt)}`
          : TEXT_NOT_CONNECTED

  return (
    <>
      <main className="mobile-shell">
        <header className="mobile-window-titlebar">
          <div className="mobile-title-main">
            <span className="mobile-title-kicker">{APP_NAME}</span>
            <h1>{TEXT_MOBILE_BOARD}</h1>
            <p>
              {TEXT_CURRENT_VIEW}: {activeFilter.label}
            </p>
          </div>

          <button type="button" className="mobile-toolbar-button" onClick={handleOpenSettings}>
            {TEXT_SETTINGS}
          </button>
        </header>

        <section className="mobile-overview-strip" aria-label={TEXT_TASK_OVERVIEW}>
          <article className="mobile-overview-card">
            <span>{TEXT_FILTER}</span>
            <strong>{activeFilter.label}</strong>
          </article>

          <article className="mobile-overview-card">
            <span>{TEXT_ACTIVE}</span>
            <strong>{taskCounts.active}</strong>
          </article>

          <article className="mobile-overview-card mobile-overview-card-wide">
            <div className="mobile-sync-inline">
              <span className={`mobile-sync-badge phase-${syncState.phase}`}>{formatSyncLabel(syncState)}</span>
              <p className={syncState.phase === 'error' ? 'is-error' : undefined}>{syncSummaryText}</p>
            </div>
          </article>
        </section>

        <section className="mobile-task-list">
          {visibleTasks.length === 0 ? (
            <article className="mobile-empty-state">
              <h2>{TEXT_EMPTY_STATE_TITLE}</h2>
              <p>{config.enabled ? TEXT_EMPTY_STATE_REMOTE : TEXT_EMPTY_STATE_LOCAL}</p>
            </article>
          ) : null}

          {visibleTasks.map((task, index) => {
            const duration = formatDuration(calcTaskDuration(task, nowMs))
            const runtimeFlag = taskRuntimeFlag(task)

            return (
              <article key={task.id} className={`mobile-task-card status-${taskStatusClass(task)}`}>
                <div className="mobile-status-stack" aria-hidden="true">
                  {runtimeFlag ? <span className="mobile-status-flag leading">{runtimeFlag}</span> : null}
                  <span className={`mobile-status-flag ${task.archived ? 'archived' : task.status === 'finished' ? 'finished' : 'unfinished'}`}>
                    {taskCompletionFlag(task)}
                  </span>
                </div>

                <div className="mobile-task-core-row">
                  <div className="mobile-seq-handle">#{index + 1}</div>

                  <div className="mobile-live-editor">
                    <div className="mobile-task-meta">
                      <span className={`mobile-inline-status state-${taskStatusClass(task)}`}>{taskStatusText(task)}</span>
                      <strong className="mobile-task-duration">{duration}</strong>
                    </div>

                    <textarea
                      className="mobile-live-input"
                      rows={Math.max(4, Math.min(10, task.contentRaw.split('\n').length + 1))}
                      placeholder={TEXT_EMPTY_TASK}
                      value={task.contentRaw}
                      disabled={task.archived}
                      onChange={(event) =>
                        applyLocalState((current, updatedAt) =>
                          updateMobileTaskContent(current, task.id, event.target.value, updatedAt),
                        )
                      }
                    />

                    {config.enabled && task.attachments.length > 0 ? (
                      <div className="mobile-attachment-row">
                        {task.attachments.map((attachment) => (
                          <img
                            key={attachment.id}
                            className="mobile-attachment-thumb"
                            src={buildMobileAssetUrl(config, attachment.storagePath)}
                            alt="task attachment"
                            loading="lazy"
                          />
                        ))}
                      </div>
                    ) : task.attachments.length > 0 ? (
                      <p className="mobile-task-updated">
                        {`\u8be5\u4efb\u52a1\u5305\u542b ${task.attachments.length} \u5f20\u56fe\u7247\uff0c\u8fde\u63a5\u670d\u52a1\u5668\u540e\u53ef\u9884\u89c8`}
                      </p>
                    ) : null}

                    <p className="mobile-task-updated">
                      {TEXT_UPDATED_AT} {localDateTimeText(task.updatedAt)}
                    </p>
                  </div>

                  <div className="mobile-action-stack">
                    {!task.archived ? (
                      <button
                        type="button"
                        className={`mobile-btn-mini ${task.status === 'doing' ? 'is-doing' : ''}`}
                        onClick={() =>
                          applyLocalState((current, updatedAt) => toggleMobileTaskTimer(current, task.id, updatedAt))
                        }
                      >
                        {task.status === 'doing' ? TEXT_PAUSE : TEXT_START}
                      </button>
                    ) : null}

                    {!task.archived ? (
                      <button
                        type="button"
                        className="mobile-btn-mini"
                        onClick={() =>
                          applyLocalState((current, updatedAt) => toggleMobileTaskFinished(current, task.id, updatedAt))
                        }
                      >
                        {task.status === 'finished' ? TEXT_RESTORE : TEXT_FINISH}
                      </button>
                    ) : null}

                    <button type="button" className="mobile-btn-mini" onClick={() => setTaskMenuId(task.id)}>
                      {TEXT_MORE}
                    </button>
                  </div>
                </div>
              </article>
            )
          })}

          <button type="button" className="mobile-new-task-tile" onClick={handleAddTask} aria-label={TEXT_ADD_TASK}>
            <span className="mobile-new-task-plus">+</span>
          </button>
        </section>
      </main>

      {settingsOpen ? (
        <div className="mobile-sheet-overlay" role="presentation" onClick={handleCloseSettings}>
          <section
            className="mobile-sheet mobile-settings-sheet"
            role="dialog"
            aria-modal="true"
            aria-labelledby="mobile-settings-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mobile-sheet-handle" />

            <div className="mobile-sheet-head">
              <div>
                <span className="mobile-sheet-kicker">{TEXT_SETTINGS}</span>
                <h2 id="mobile-settings-title">{TEXT_TASK_OVERVIEW}</h2>
                <p>{TEXT_MOBILE_TIP}</p>
              </div>

              <button type="button" className="mobile-toolbar-button" onClick={handleCloseSettings}>
                {TEXT_DONE}
              </button>
            </div>

            <section className="mobile-sheet-card">
              <div className="mobile-sheet-card-head">
                <h3>{TEXT_SYNC_SERVICE}</h3>
                <span>{TEXT_RECENT_SYNC}</span>
              </div>

              <div className="mobile-sync-summary">
                <span className={`mobile-sync-badge phase-${syncState.phase}`}>{formatSyncLabel(syncState)}</span>
                <p className={syncState.phase === 'error' ? 'is-error' : undefined}>{syncState.lastError ?? syncState.message}</p>
              </div>

              <button
                type="button"
                className="mobile-primary-button"
                disabled={busy || !config.enabled}
                onClick={() => void runSync('manual')}
              >
                {busy ? TEXT_SYNCING : TEXT_SYNC_NOW}
              </button>
            </section>

            <section className="mobile-sheet-card">
              <div className="mobile-sheet-card-head">
                <h3>{TEXT_VIEW_FILTER}</h3>
                <span>{TEXT_CURRENT_VIEW}</span>
              </div>

              <div className="mobile-filter-grid">
                {filterOptions.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    className={option.id === filter ? 'is-active' : ''}
                    onClick={() => setFilter(option.id)}
                  >
                    <span>{option.label}</span>
                    <strong>{option.count}</strong>
                  </button>
                ))}
              </div>
            </section>

            <section className="mobile-summary-grid" aria-label={TEXT_TASK_OVERVIEW}>
              <article className="mobile-summary-card">
                <span>{TEXT_ACTIVE}</span>
                <strong>{taskCounts.active}</strong>
              </article>
              <article className="mobile-summary-card">
                <span>{TEXT_FINISHED}</span>
                <strong>{taskCounts.finished}</strong>
              </article>
              <article className="mobile-summary-card">
                <span>{TEXT_ARCHIVED}</span>
                <strong>{taskCounts.archived}</strong>
              </article>
              <article className="mobile-summary-card">
                <span>{TEXT_ALL}</span>
                <strong>{taskCounts.all}</strong>
              </article>
            </section>

            <section className="mobile-sheet-card">
              <div className="mobile-sheet-card-head">
                <h3>{TEXT_SYNC_SERVICE}</h3>
                <span>{TEXT_TOKEN_LOCAL_ONLY}</span>
              </div>

              <label className="mobile-field mobile-toggle-field">
                <span>{TEXT_ENABLE_SYNC}</span>
                <input
                  type="checkbox"
                  checked={draftConfig.enabled}
                  onChange={(event) => setDraftConfig((current) => ({ ...current, enabled: event.target.checked }))}
                />
              </label>

              <label className="mobile-field">
                <span>{TEXT_SERVER_URL}</span>
                <input
                  type="url"
                  placeholder="https://example.com:8787"
                  value={draftConfig.serverUrl}
                  onChange={(event) => setDraftConfig((current) => ({ ...current, serverUrl: event.target.value }))}
                />
              </label>

              <label className="mobile-field">
                <span>Token</span>
                <input
                  type="password"
                  placeholder={TEXT_FILL_TOKEN}
                  value={draftConfig.token}
                  onChange={(event) => setDraftConfig((current) => ({ ...current, token: event.target.value }))}
                />
              </label>

              {draftConfig.enabled && !canEnableSync ? (
                <p className="mobile-inline-note is-error">{TEXT_SYNC_REQUIREMENTS}</p>
              ) : null}

              <div className="mobile-form-actions">
                <button type="button" className="mobile-primary-button" onClick={() => void handleSaveConfig()}>
                  {TEXT_SAVE_SETTINGS}
                </button>
                <button type="button" className="mobile-toolbar-button" onClick={handleCloseSettings}>
                  {TEXT_CANCEL}
                </button>
              </div>
            </section>
          </section>
        </div>
      ) : null}

      {selectedTask ? (
        <div className="mobile-sheet-overlay" role="presentation" onClick={handleCloseTaskMenu}>
          <section
            className="mobile-sheet mobile-action-sheet"
            role="dialog"
            aria-modal="true"
            aria-labelledby="mobile-action-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mobile-sheet-handle" />

            <div className="mobile-sheet-head">
              <div>
                <span className="mobile-sheet-kicker">#{selectedTask.order}</span>
                <h2 id="mobile-action-title">{TEXT_ACTIONS_TITLE}</h2>
                <p>{summarizeTask(selectedTask)}</p>
              </div>

              <button type="button" className="mobile-toolbar-button" onClick={handleCloseTaskMenu}>
                {TEXT_CLOSE}
              </button>
            </div>

            <div className="mobile-task-menu">
              <button
                type="button"
                className="mobile-sheet-action"
                onClick={() => {
                  applyLocalState((current, updatedAt) =>
                    selectedTask.archived
                      ? unarchiveMobileTask(current, selectedTask.id, updatedAt)
                      : archiveMobileTask(current, selectedTask.id, updatedAt),
                  )
                  handleCloseTaskMenu()
                }}
              >
                {selectedTask.archived ? TEXT_UNARCHIVE : TEXT_ARCHIVE}
              </button>

              <button
                type="button"
                className="mobile-sheet-action danger"
                onClick={() => handleDeleteTask(selectedTask.id)}
              >
                {TEXT_DELETE}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </>
  )
}
