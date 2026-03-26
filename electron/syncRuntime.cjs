const fs = require('node:fs/promises')
const path = require('node:path')

const DEFAULT_APP_SETTINGS = {
  opacity: 0.82,
  alwaysOnTop: true,
  edgeAutoHide: true,
  autoLaunch: false,
  defaultFontFamily: 'Segoe UI',
  defaultFontSize: 16,
  showArchived: false,
  archivedDisplayMode: 'all',
  archivedRangeStart: '',
  archivedRangeEnd: '',
  uiScale: 1,
  taskCardMode: 'expanded',
  taskContentDisplayMode: 'inner-scroll',
  taskPaletteMode: 'auto-vivid',
}

const DEFAULT_SYNC_CONFIG = {
  enabled: false,
  serverUrl: '',
  token: '',
}

const DEFAULT_SYNC_STATUS = {
  enabled: false,
  phase: 'idle',
  lastSyncAt: null,
  lastPullAt: null,
  lastPushAt: null,
  lastError: null,
}

function normalizeServerUrl(value) {
  return String(value || '')
    .trim()
    .replace(/\/+$/, '')
}

function normalizeSyncConfig(value) {
  const serverUrl = normalizeServerUrl(value?.serverUrl)
  const token = String(value?.token || '').trim()
  const enabled = Boolean(value?.enabled) && Boolean(serverUrl) && Boolean(token)

  return {
    ...DEFAULT_SYNC_CONFIG,
    enabled,
    serverUrl,
    token,
  }
}

function toComparableTime(value) {
  if (!value) {
    return 0
  }
  const ms = Date.parse(value)
  return Number.isFinite(ms) ? ms : 0
}

function taskActivityTime(task) {
  const times = [
    task?.updatedAt,
    task?.createdAt,
    task?.finishedAt,
    task?.archivedAt,
    ...((Array.isArray(task?.segments) ? task.segments : []).flatMap((segment) => [segment?.startAt, segment?.pauseAt])),
  ]
  return Math.max(...times.map((value) => toComparableTime(value)))
}

function latestTaskActivityTime(state) {
  if (!state || !Array.isArray(state.tasks) || state.tasks.length === 0) {
    return 0
  }

  return Math.max(...state.tasks.map((task) => taskActivityTime(task)))
}

function compareTaskActivity(localState, remoteState) {
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

function mergeRemoteTasksIntoLocalState(localState, remoteState) {
  if (!remoteState) {
    return localState || {
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

function mergeLocalTasksIntoRemoteState(localState, remoteState) {
  if (!localState) {
    return remoteState || {
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

function resolveLocalStoragePath(dataDir, storagePath) {
  const normalized = String(storagePath || '')
    .split('/')
    .map((segment) => decodeURIComponent(segment))
    .join('/')
    .replace(/\\/g, '/')

  const absolutePath = path.resolve(dataDir, normalized)
  const relativePath = path.relative(dataDir, absolutePath)
  if (!normalized || relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
    throw new Error(`Invalid asset path: ${storagePath}`)
  }
  return absolutePath
}

function createJsonHeaders(token) {
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  }
}

async function parseJsonResponse(response) {
  const contentType = response.headers.get('Content-Type') || ''
  const payload =
    contentType.includes('application/json') || contentType.includes('+json')
      ? await response.json()
      : { ok: response.ok, error: await response.text() }

  if (!response.ok || payload?.ok === false) {
    throw new Error(payload?.error || `Request failed with status ${response.status}`)
  }

  return payload
}

function buildRemoteAssetUrl(serverUrl, storagePath, token) {
  const base = normalizeServerUrl(serverUrl)
  const encodedPath = String(storagePath || '')
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/')
  const url = new URL(`${base}/api/assets/${encodedPath}`)
  if (token) {
    url.searchParams.set('token', token)
  }
  return url.toString()
}

async function fetchRemoteState(config, fetchImpl) {
  const response = await fetchImpl(`${config.serverUrl}/api/state`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${config.token}`,
    },
  })
  const payload = await parseJsonResponse(response)
  if (!payload?.state) {
    throw new Error('Remote state missing from response')
  }
  return payload.state
}

async function saveRemoteState(config, state, fetchImpl) {
  const response = await fetchImpl(`${config.serverUrl}/api/state`, {
    method: 'PUT',
    headers: createJsonHeaders(config.token),
    body: JSON.stringify({ state }),
  })
  const payload = await parseJsonResponse(response)
  if (!payload?.state) {
    throw new Error('Saved state missing from response')
  }
  return payload.state
}

function collectUniqueAttachments(tasks) {
  const entries = []
  const seenPaths = new Set()

  for (const task of Array.isArray(tasks) ? tasks : []) {
    for (const attachment of Array.isArray(task?.attachments) ? task.attachments : []) {
      if (!attachment || typeof attachment.storagePath !== 'string' || !attachment.storagePath) {
        continue
      }
      if (seenPaths.has(attachment.storagePath)) {
        continue
      }
      seenPaths.add(attachment.storagePath)
      entries.push({
        taskId: task.id,
        attachment,
      })
    }
  }

  return entries
}

async function uploadLocalAssets(config, dataDir, state, fetchImpl) {
  const uploads = collectUniqueAttachments(state?.tasks)

  for (const entry of uploads) {
    const absolutePath = resolveLocalStoragePath(dataDir, entry.attachment.storagePath)
    const bytes = await fs.readFile(absolutePath)
    await parseJsonResponse(
      await fetchImpl(`${config.serverUrl}/api/assets`, {
        method: 'POST',
        headers: createJsonHeaders(config.token),
        body: JSON.stringify({
          taskId: entry.taskId,
          mimeType: entry.attachment.mimeType,
          dataBase64: Buffer.from(bytes).toString('base64'),
          requestedStoragePath: entry.attachment.storagePath,
        }),
      }),
    )
  }
}

async function downloadRemoteAssets(config, dataDir, state, fetchImpl) {
  const downloads = collectUniqueAttachments(state?.tasks)

  for (const entry of downloads) {
    const absolutePath = resolveLocalStoragePath(dataDir, entry.attachment.storagePath)
    const response = await fetchImpl(buildRemoteAssetUrl(config.serverUrl, entry.attachment.storagePath, config.token))
    if (!response.ok) {
      throw new Error(`Failed to download remote asset: ${entry.attachment.storagePath}`)
    }

    const bytes = Buffer.from(await response.arrayBuffer())
    await fs.mkdir(path.dirname(absolutePath), { recursive: true })
    await fs.writeFile(absolutePath, bytes)
  }
}

async function readSyncConfig(configFile) {
  try {
    const raw = await fs.readFile(configFile, 'utf8')
    return normalizeSyncConfig(JSON.parse(raw))
  } catch {
    return { ...DEFAULT_SYNC_CONFIG }
  }
}

async function writeSyncConfig(configFile, config) {
  await fs.mkdir(path.dirname(configFile), { recursive: true })
  await fs.writeFile(configFile, `${JSON.stringify(config, null, 2)}\n`, 'utf8')
}

function createSyncRuntime({
  configFile,
  dataDir,
  readLocalState,
  writeLocalState,
  requestRendererFlush = async () => {},
  notifyStatus = () => {},
  notifyStateRefreshed = () => {},
  fetchImpl = global.fetch,
  syncIntervalMs = 45000,
  debounceMs = 1200,
  now = () => new Date().toISOString(),
} = {}) {
  if (typeof configFile !== 'string' || !configFile) {
    throw new Error('configFile is required')
  }
  if (typeof dataDir !== 'string' || !dataDir) {
    throw new Error('dataDir is required')
  }
  if (typeof readLocalState !== 'function') {
    throw new Error('readLocalState is required')
  }
  if (typeof writeLocalState !== 'function') {
    throw new Error('writeLocalState is required')
  }
  if (typeof fetchImpl !== 'function') {
    throw new Error('fetchImpl is required')
  }

  let config = { ...DEFAULT_SYNC_CONFIG }
  let status = { ...DEFAULT_SYNC_STATUS }
  let syncTimer = null
  let pollTimer = null
  let activeRun = null
  let rerunRequested = false

  function snapshotConfig() {
    return { ...config }
  }

  function snapshotStatus() {
    return { ...status, enabled: config.enabled }
  }

  function emitStatus(patch = {}) {
    status = {
      ...status,
      ...patch,
      enabled: config.enabled,
    }
    notifyStatus(snapshotStatus())
  }

  function clearScheduledSync() {
    if (syncTimer) {
      clearTimeout(syncTimer)
      syncTimer = null
    }
  }

  function refreshPolling() {
    if (pollTimer) {
      clearInterval(pollTimer)
      pollTimer = null
    }

    if (!config.enabled) {
      return
    }

    pollTimer = setInterval(() => {
      void syncNow('poll')
    }, syncIntervalMs)

    if (typeof pollTimer.unref === 'function') {
      pollTimer.unref()
    }
  }

  async function loadConfig() {
    config = await readSyncConfig(configFile)
    emitStatus({
      phase: status.phase === 'syncing' ? 'syncing' : 'idle',
      lastError: null,
    })
    refreshPolling()
    return snapshotConfig()
  }

  async function setConfig(nextConfig) {
    config = normalizeSyncConfig(nextConfig)
    await writeSyncConfig(configFile, config)
    emitStatus({
      phase: 'idle',
      lastError: null,
    })
    refreshPolling()
    return snapshotConfig()
  }

  function getConfig() {
    return snapshotConfig()
  }

  function getStatus() {
    return snapshotStatus()
  }

  function scheduleSync(reason = 'scheduled') {
    if (!config.enabled) {
      return
    }

    clearScheduledSync()
    syncTimer = setTimeout(() => {
      syncTimer = null
      void syncNow(reason)
    }, debounceMs)

    if (typeof syncTimer.unref === 'function') {
      syncTimer.unref()
    }
  }

  async function runSync() {
    emitStatus({
      phase: 'syncing',
      lastError: null,
    })

    await requestRendererFlush()

    const localState = await readLocalState()
    const remoteState = await fetchRemoteState(config, fetchImpl)
    const comparison = compareTaskActivity(localState, remoteState)
    const syncedAt = now()

    if (comparison < 0) {
      const merged = mergeRemoteTasksIntoLocalState(localState, remoteState)
      await writeLocalState(merged)
      await downloadRemoteAssets(config, dataDir, merged, fetchImpl)
      notifyStateRefreshed(merged)
      emitStatus({
        phase: 'idle',
        lastSyncAt: syncedAt,
        lastPullAt: syncedAt,
        lastError: null,
      })
      return { direction: 'pull', state: merged }
    }

    if (comparison > 0) {
      await uploadLocalAssets(config, dataDir, localState, fetchImpl)
      const merged = mergeLocalTasksIntoRemoteState(localState, remoteState)
      const saved = await saveRemoteState(config, merged, fetchImpl)
      emitStatus({
        phase: 'idle',
        lastSyncAt: syncedAt,
        lastPushAt: syncedAt,
        lastError: null,
      })
      return { direction: 'push', state: saved }
    }

    emitStatus({
      phase: 'idle',
      lastSyncAt: syncedAt,
      lastError: null,
    })
    return { direction: 'noop', state: localState || remoteState || null }
  }

  async function syncNow(reason = 'manual') {
    if (!config.enabled) {
      emitStatus({
        phase: 'idle',
      })
      return { direction: 'disabled', reason }
    }

    if (activeRun) {
      rerunRequested = true
      return activeRun
    }

    activeRun = (async () => {
      try {
        return await runSync()
      } catch (error) {
        emitStatus({
          phase: 'error',
          lastError: error instanceof Error ? error.message : String(error),
        })
        throw error
      } finally {
        activeRun = null
        if (rerunRequested) {
          rerunRequested = false
          void syncNow('rerun')
        }
      }
    })()

    return activeRun
  }

  function dispose() {
    clearScheduledSync()
    if (pollTimer) {
      clearInterval(pollTimer)
      pollTimer = null
    }
  }

  return {
    loadConfig,
    setConfig,
    getConfig,
    getStatus,
    scheduleSync,
    syncNow,
    dispose,
  }
}

module.exports = {
  createSyncRuntime,
}
