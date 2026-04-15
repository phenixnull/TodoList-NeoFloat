import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  addMobileTask,
  archiveAndHideMobileTask,
  archiveMobileTask,
  clearMobileTaskColor,
  createEmptyMobileState,
  deleteMobileTask,
  hideArchivedMobileTasks,
  insertMobileTaskAfter,
  reorderMobileTasks,
  setAllMobileTaskDurationVisibility,
  setMobileTaskCustomColor,
  setMobileTaskDurationLayoutMode,
  setMobileTaskPresetColor,
  setMobileTasksDurationLayoutMode,
  toggleMobileTaskDurationVisibility,
  toggleMobileTaskFinished,
  toggleMobileTaskTimer,
  unarchiveMobileTask,
  updateMobileSettings,
  updateMobileTaskContent,
} from '../../../src/mobile/mobileState'
import { buildMobileAssetUrl, fetchRemoteState, saveRemoteState } from '../../../src/mobile/api'
import { compareTaskActivity, mergeLocalTasksIntoRemoteState, mergeRemoteTasksIntoLocalState } from '../../../src/lib/sync'
import { calcTaskDuration, formatDuration, localDateTimeText, toLocalIso } from '../../../src/lib/time'
import { shouldShowTaskInList } from '../../../src/lib/taskVisibility'
import type { PersistedState, Task } from '../../../src/types/domain'
import type { SyncConfig } from '../../../src/types/sync'
import { loadNativeState, loadNativeSyncConfig, saveNativeState, saveNativeSyncConfig } from './nativeStorage'

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

const EMPTY_SYNC_CONFIG: SyncConfig = { enabled: false, serverUrl: '', token: '' }
const EMPTY_SYNC_STATE: MobileSyncState = {
  phase: 'idle',
  lastError: null,
  lastSyncAt: null,
  direction: null,
  dirty: false,
  message: '本地模式',
}

const AUTO_SYNC_DELAY_MS = 1400
const POLL_INTERVAL_MS = 45000

export function taskStatusText(task: Task): string {
  if (task.archived) return '已归档'
  if (task.status === 'doing') return '进行中'
  if (task.status === 'paused') return '已暂停'
  if (task.status === 'finished') return '已完成'
  return '待开始'
}

export function taskRuntimeFlag(task: Task): string | null {
  if (task.archived || task.status === 'finished') return null
  if (task.status === 'doing') return '进行中'
  if (task.status === 'paused') return '已暂停'
  return '待开始'
}

export function summarizeTask(task: Task): string {
  const firstLine = task.contentRaw.trim().split(/\r?\n/, 1)[0]?.trim()
  return firstLine || '空任务'
}

export function useNativeTodoBoard() {
  const [hydrated, setHydrated] = useState(false)
  const [config, setConfig] = useState<SyncConfig>(EMPTY_SYNC_CONFIG)
  const [draftConfig, setDraftConfig] = useState<SyncConfig>(EMPTY_SYNC_CONFIG)
  const [snapshot, setSnapshot] = useState<PersistedState>(() => createEmptyMobileState(toLocalIso()))
  const [syncState, setSyncState] = useState<MobileSyncState>(EMPTY_SYNC_STATE)
  const [filter, setFilter] = useState<MobileFilter>('active')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [taskMenuId, setTaskMenuId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [nowMs, setNowMs] = useState(() => Date.now())
  const snapshotRef = useRef(snapshot)
  const configRef = useRef(config)
  const syncLockRef = useRef(false)

  useEffect(() => {
    void (async () => {
      const [loadedConfig, loadedState] = await Promise.all([loadNativeSyncConfig(), loadNativeState()])
      setConfig(loadedConfig)
      setDraftConfig(loadedConfig)
      setSnapshot(loadedState)
      snapshotRef.current = loadedState
      configRef.current = loadedConfig
      setSyncState((current) => ({ ...current, message: loadedConfig.enabled ? '等待连接服务器' : '本地模式' }))
      setHydrated(true)
    })()
  }, [])

  useEffect(() => {
    snapshotRef.current = snapshot
    if (hydrated) {
      void saveNativeState(snapshot)
    }
  }, [hydrated, snapshot])

  useEffect(() => {
    configRef.current = config
  }, [config])

  useEffect(() => {
    const timer = setInterval(() => setNowMs(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [])

  const runSync = useCallback(async (reason: 'manual' | 'auto' | 'poll' | 'connect') => {
    const currentConfig = configRef.current
    if (!currentConfig.enabled || syncLockRef.current) {
      return
    }

    syncLockRef.current = true
    setBusy(true)
    setSyncState((current) => ({
      ...current,
      phase: 'syncing',
      lastError: null,
      message: reason === 'poll' ? '检查服务器更新...' : '同步中...',
    }))

    try {
      const localState = snapshotRef.current
      const remoteState = await fetchRemoteState(currentConfig)
      const direction = compareTaskActivity(localState, remoteState)
      const syncedAt = toLocalIso()

      if (direction > 0) {
        const saved = await saveRemoteState(currentConfig, mergeLocalTasksIntoRemoteState(localState, remoteState))
        setSnapshot(saved)
        setSyncState({ phase: 'idle', lastError: null, lastSyncAt: syncedAt, direction: 'push', dirty: false, message: '本地修改已推送到服务器' })
      } else if (direction < 0) {
        setSnapshot(mergeRemoteTasksIntoLocalState(localState, remoteState))
        setSyncState({ phase: 'idle', lastError: null, lastSyncAt: syncedAt, direction: 'pull', dirty: false, message: '已拉取服务器最新记录' })
      } else {
        setSyncState((current) => ({ ...current, phase: 'idle', lastSyncAt: syncedAt, direction: 'noop', dirty: false, message: '桌面与手机已经一致' }))
      }
    } catch (error) {
      setSyncState((current) => ({
        ...current,
        phase: 'error',
        lastError: error instanceof Error ? error.message : String(error),
        message: '同步失败，请检查服务器地址和 Token',
      }))
    } finally {
      syncLockRef.current = false
      setBusy(false)
    }
  }, [])

  useEffect(() => {
    if (!hydrated || !config.enabled || !syncState.dirty) return
    const timer = setTimeout(() => void runSync('auto'), AUTO_SYNC_DELAY_MS)
    return () => clearTimeout(timer)
  }, [config.enabled, hydrated, runSync, snapshot.updatedAt, syncState.dirty])

  useEffect(() => {
    if (!hydrated || !config.enabled) return
    const timer = setInterval(() => void runSync('poll'), POLL_INTERVAL_MS)
    return () => clearInterval(timer)
  }, [config.enabled, hydrated, runSync])

  useEffect(() => {
    if (hydrated && config.enabled) {
      void runSync('connect')
    }
  }, [config.enabled, config.serverUrl, config.token, hydrated, runSync])

  const orderedTasks = useMemo(() => [...snapshot.tasks].sort((a, b) => a.order - b.order), [snapshot.tasks])
  const todayDate = useMemo(() => toLocalIso(new Date(nowMs)).slice(0, 10), [nowMs])
  const visibleBySettings = useMemo(
    () => orderedTasks.filter((task) => shouldShowTaskInList(task, snapshot.settings, todayDate)),
    [orderedTasks, snapshot.settings, todayDate],
  )
  const visibleTasks = useMemo(() => {
    if (filter === 'active') return visibleBySettings.filter((task) => !task.archived && task.status !== 'finished')
    if (filter === 'finished') return visibleBySettings.filter((task) => !task.archived && task.status === 'finished')
    if (filter === 'archived') return visibleBySettings.filter((task) => task.archived)
    return visibleBySettings
  }, [filter, visibleBySettings])

  const taskCounts = useMemo(() => ({
    active: visibleBySettings.filter((task) => !task.archived && task.status !== 'finished').length,
    finished: visibleBySettings.filter((task) => !task.archived && task.status === 'finished').length,
    archived: visibleBySettings.filter((task) => task.archived).length,
    all: visibleBySettings.length,
  }), [visibleBySettings])

  const filterOptions = useMemo(
    () => [
      { id: 'active' as const, label: '进行中', count: taskCounts.active },
      { id: 'finished' as const, label: '已完成', count: taskCounts.finished },
      { id: 'archived' as const, label: '已归档', count: taskCounts.archived },
      { id: 'all' as const, label: '全部', count: taskCounts.all },
    ],
    [taskCounts],
  )

  const selectedTask = useMemo(() => orderedTasks.find((task) => task.id === taskMenuId) ?? null, [orderedTasks, taskMenuId])

  const applyLocalState = useCallback((updater: (current: PersistedState, updatedAt: string) => PersistedState) => {
    setSnapshot((current) => updater(current, toLocalIso()))
    setSyncState((current) => ({ ...current, phase: current.phase === 'error' ? 'idle' : current.phase, dirty: true, lastError: null, message: '本地已修改，等待同步' }))
  }, [])

  const moveTask = useCallback((taskId: string, direction: -1 | 1) => {
    const index = visibleTasks.findIndex((task) => task.id === taskId)
    const nextIndex = index + direction
    if (index < 0 || nextIndex < 0 || nextIndex >= visibleTasks.length) return
    const orderedIds = visibleTasks.map((task) => task.id)
    const [moved] = orderedIds.splice(index, 1)
    orderedIds.splice(nextIndex, 0, moved)
    applyLocalState((current, updatedAt) => reorderMobileTasks(current, orderedIds, updatedAt))
  }, [applyLocalState, visibleTasks])

  const reorderVisibleTasks = useCallback((orderedIds: string[]) => {
    if (orderedIds.length <= 1) return
    applyLocalState((current, updatedAt) => reorderMobileTasks(current, orderedIds, updatedAt))
  }, [applyLocalState])

  return {
    hydrated,
    config,
    draftConfig,
    setDraftConfig,
    snapshot,
    syncState,
    filter,
    setFilter,
    filterOptions,
    visibleTasks,
    taskCounts,
    selectedTask,
    taskMenuId,
    setTaskMenuId,
    settingsOpen,
    setSettingsOpen,
    busy,
    nowMs,
    syncSummaryText: syncState.phase === 'error' ? syncState.lastError ?? '同步失败' : syncState.dirty ? '本地有修改，等待自动同步' : config.enabled ? `最近同步 ${syncState.lastSyncAt ? localDateTimeText(syncState.lastSyncAt) : '未同步'}` : '未连接服务器，仅保留本地记录',
    addTask: () => { setFilter('active'); applyLocalState((current, updatedAt) => addMobileTask(current, updatedAt)) },
    updateTaskContent: (taskId: string, contentRaw: string) => applyLocalState((current, updatedAt) => updateMobileTaskContent(current, taskId, contentRaw, updatedAt)),
    toggleTaskTimer: (taskId: string) => applyLocalState((current, updatedAt) => toggleMobileTaskTimer(current, taskId, updatedAt)),
    toggleTaskFinished: (taskId: string) => applyLocalState((current, updatedAt) => toggleMobileTaskFinished(current, taskId, updatedAt)),
    archiveTask: (taskId: string) => applyLocalState((current, updatedAt) => archiveMobileTask(current, taskId, updatedAt)),
    unarchiveTask: (taskId: string) => applyLocalState((current, updatedAt) => unarchiveMobileTask(current, taskId, updatedAt)),
    archiveAndHideTask: (taskId: string) => applyLocalState((current, updatedAt) => archiveAndHideMobileTask(current, taskId, updatedAt)),
    deleteTask: (taskId: string) => applyLocalState((current, updatedAt) => deleteMobileTask(current, taskId, updatedAt)),
    insertTaskAfter: (taskId: string) => applyLocalState((current, updatedAt) => insertMobileTaskAfter(current, taskId, updatedAt)),
    toggleTaskDurationVisibility: (taskId: string) => applyLocalState((current, updatedAt) => toggleMobileTaskDurationVisibility(current, taskId, updatedAt)),
    setAllTaskDurationVisibility: (visible: boolean) => applyLocalState((current, updatedAt) => setAllMobileTaskDurationVisibility(current, visible, updatedAt)),
    setTaskDurationLayoutMode: (taskId: string, layoutMode: Task['durationLayoutMode']) => applyLocalState((current, updatedAt) => setMobileTaskDurationLayoutMode(current, taskId, layoutMode, updatedAt)),
    setTasksDurationLayoutMode: (taskIds: string[], layoutMode: Task['durationLayoutMode']) => applyLocalState((current, updatedAt) => setMobileTasksDurationLayoutMode(current, taskIds, layoutMode, updatedAt)),
    setTaskPresetColor: (taskId: string, colorValue: string) => applyLocalState((current, updatedAt) => setMobileTaskPresetColor(current, taskId, colorValue, updatedAt)),
    setTaskCustomColor: (taskId: string, colorValue: string) => applyLocalState((current, updatedAt) => setMobileTaskCustomColor(current, taskId, colorValue, updatedAt)),
    clearTaskColor: (taskId: string) => applyLocalState((current, updatedAt) => clearMobileTaskColor(current, taskId, updatedAt)),
    hideArchivedTasks: (filterInput: { mode: 'all' | 'range'; start?: string; end?: string }) => applyLocalState((current, updatedAt) => hideArchivedMobileTasks(current, filterInput, updatedAt)),
    updateSettings: (patch: Partial<PersistedState['settings']>) => applyLocalState((current, updatedAt) => updateMobileSettings(current, patch, updatedAt)),
    moveTask,
    reorderVisibleTasks,
    runSync: () => runSync('manual'),
    saveConfig: async () => {
      const nextConfig: SyncConfig = {
        enabled: draftConfig.enabled && Boolean(draftConfig.serverUrl.trim()) && Boolean(draftConfig.token.trim()),
        serverUrl: draftConfig.serverUrl.trim(),
        token: draftConfig.token.trim(),
      }
      const saved = await saveNativeSyncConfig(nextConfig)
      configRef.current = saved
      setConfig(saved)
      setDraftConfig(saved)
      setSettingsOpen(false)
    },
    buildAssetUrl: (storagePath: string) => buildMobileAssetUrl(configRef.current, storagePath),
    formatDuration,
    calcTaskDuration,
    localDateTimeText,
  }
}
