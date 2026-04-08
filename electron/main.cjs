const { app, BrowserWindow, ipcMain, screen, shell } = require('electron')
const path = require('node:path')
const fs = require('node:fs/promises')
const fsSync = require('node:fs')
const { resolveUndetectedDockState } = require('./edgeDockRecovery.cjs')
const { shouldAbortBlurCollapseState } = require('./edgeVisibilityGuards.cjs')
const { resolveRuntimePaths } = require('./runtimePaths.cjs')
const { cleanupTaskAssetFiles } = require('./taskAssetCleanup.cjs')
const { createSyncRuntime } = require('./syncRuntime.cjs')

const APP_STATE_VERSION = 1
const CLOSE_FLUSH_WAIT_MS = 220
const WINDOW_MIN_WIDTH = 360
const WINDOW_MIN_HEIGHT = 110
const EDGE_DOCK_THRESHOLD_PX = 24
const EDGE_HIDE_VISIBLE_PX = 4
const EDGE_HIDE_DELAY_MS = 90
const EDGE_HIDE_DELAY_ON_MOUSE_LEAVE_MS = 1000
const EDGE_HIDE_DELAY_ON_MOUSE_LEAVE_TOP_MS = 240
const EDGE_HIDE_DELAY_ON_BLUR_MS = 40
const EDGE_ACTIVATE_BAND_PX = 14
const EDGE_HOVER_POLL_MS = 34
const EDGE_INTERACTION_GRACE_MS = 1800
const EDGE_INTERNAL_POINTER_GRACE_MS = 2600
const EDGE_COLLAPSE_EDGE_COOLDOWN_MS = 520
const EDGE_BLUR_GUARD_PADDING_PX = 28
const EDGE_MANUAL_BADGE_THICKNESS_PX = 12
const EDGE_MANUAL_BADGE_LENGTH_PX = 28
const EDGE_MANUAL_BADGE_VERTICAL_OFFSET_PX = 12
const EDGE_MANUAL_BADGE_TOP_RIGHT_OFFSET_PX = 14
const EDGE_VISIBILITY_RECOVERY_MS = 1800
const EDGE_RECOVERY_REFRESH_DELAY_MS = 220
const EDGE_DOCK_CLEAR_DEBOUNCE_MS = 240
const EDGE_DOCK_CLEAR_MIN_MISS_COUNT = 3
const WINDOWS_NATIVE_SNAP_MODE = process.platform === 'win32'
const WINDOWS_APP_USER_MODEL_ID = 'com.neofloat.todo'

const DEFAULT_SETTINGS = {
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

const defaultState = () => ({
  version: APP_STATE_VERSION,
  tasks: [],
  settings: { ...DEFAULT_SETTINGS },
  updatedAt: toLocalIso(),
})

const defaultUserDataDir = app.getPath('userData')
const runtimePaths = resolveRuntimePaths({
  appIsPackaged: app.isPackaged,
  cwd: process.cwd(),
  defaultUserDataDir,
  portableExecutableDir: process.env.PORTABLE_EXECUTABLE_DIR,
})
if (runtimePaths.userDataDir !== defaultUserDataDir) {
  app.setPath('userData', runtimePaths.userDataDir)
}
const userDataDir = runtimePaths.userDataDir
const dataDir = runtimePaths.dataDir
const snapshotFile = path.join(dataDir, 'state.snapshot.json')
const syncConfigFile = path.join(dataDir, 'sync.config.json')
const taskAssetsDir = path.join(dataDir, 'task-assets')
const edgeDebugLogFile = path.join(dataDir, 'edge-events.log')
const cacheDir = runtimePaths.cacheDir
const legacyPackagedDataDir =
  app.isPackaged && runtimePaths.isPortable ? path.join(defaultUserDataDir, 'data') : null
const windowIconPath = (() => {
  if (process.platform !== 'win32') {
    return undefined
  }

  const candidates = [
    path.join(process.cwd(), 'build', 'icons', 'neo-float.ico'),
    path.join(__dirname, '..', 'build', 'icons', 'neo-float.ico'),
  ]

  return candidates.find((candidate) => fsSync.existsSync(candidate))
})()

if (process.platform === 'win32') {
  app.setAppUserModelId(WINDOWS_APP_USER_MODEL_ID)
}

let mainWindow = null
let manualBadgeWindow = null
let syncRuntime = null
let stateCache = defaultState()
let persistQueue = Promise.resolve()
let closingInProgress = false
let edgeAutoHideEnabled = true
let edgeDockSide = null
let edgeHiddenSide = null
let edgeHiddenMode = 'none'
let edgeExpandedBounds = null
let edgeCollapseTimer = null
let edgeHoverPollTimer = null
let suppressEdgeTracking = false
let edgeInteractionGraceUntil = 0
let edgeLastInteractionAt = 0
let edgeLastInteractionSource = 'startup'
let edgeLastPointerEventAt = 0
let edgeLastPointerEventType = 'none'
let allowProgrammaticMinimizeOnce = false
let allowProgrammaticHideOnce = false
let allowProgrammaticManualBadgeCloseOnce = false
let edgeStartupProtectUntil = 0
let edgeRecoveryUntil = 0
let edgeRecoveryReason = 'none'
let edgeLastStableDockSide = null
let edgeLastStableExpandedBounds = null
let edgeDockUndetectedSince = 0
let edgeDockUndetectedCount = 0
let closeFlushRequestSequence = 0

app.commandLine.appendSwitch('disk-cache-dir', cacheDir)

function pad(v) {
  return String(v).padStart(2, '0')
}

function padMs(v) {
  return String(v).padStart(3, '0')
}

function toLocalIso(date = new Date()) {
  const year = date.getFullYear()
  const month = pad(date.getMonth() + 1)
  const day = pad(date.getDate())
  const hours = pad(date.getHours())
  const minutes = pad(date.getMinutes())
  const seconds = pad(date.getSeconds())
  const ms = padMs(date.getMilliseconds())

  const offsetMinutes = -date.getTimezoneOffset()
  const sign = offsetMinutes >= 0 ? '+' : '-'
  const abs = Math.abs(offsetMinutes)
  const offsetHour = pad(Math.floor(abs / 60))
  const offsetMinute = pad(abs % 60)

  return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}.${ms}${sign}${offsetHour}:${offsetMinute}`
}

function localDateKey(date = new Date()) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

function isDateText(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
}

async function ensureDataDir() {
  await maybeMigratePortableDataDir()
  await fs.mkdir(dataDir, { recursive: true })
  await fs.mkdir(taskAssetsDir, { recursive: true })
  await fs.mkdir(cacheDir, { recursive: true })
}

async function pathExists(targetPath) {
  try {
    await fs.access(targetPath)
    return true
  } catch {
    return false
  }
}

async function maybeMigratePortableDataDir() {
  if (!legacyPackagedDataDir) {
    return
  }

  const hasPortableSnapshot = await pathExists(snapshotFile)
  if (hasPortableSnapshot) {
    return
  }

  const legacySnapshotFile = path.join(legacyPackagedDataDir, 'state.snapshot.json')
  const hasLegacySnapshot = await pathExists(legacySnapshotFile)
  if (!hasLegacySnapshot) {
    return
  }

  await fs.mkdir(dataDir, { recursive: true })
  await fs.cp(legacyPackagedDataDir, dataDir, { recursive: true, force: true })
}

function normalizeTaskSegments(segments) {
  if (!Array.isArray(segments)) {
    return []
  }

  return segments
    .filter((segment) => Boolean(segment && typeof segment.startAt === 'string'))
    .map((segment) => ({
      startAt: segment.startAt,
      pauseAt: typeof segment.pauseAt === 'string' ? segment.pauseAt : null,
      durationMs: typeof segment.durationMs === 'number' && Number.isFinite(segment.durationMs) ? Math.max(0, segment.durationMs) : 0,
    }))
}

function sumClosedTaskDurations(segments) {
  return normalizeTaskSegments(segments).reduce((sum, segment) => {
    if (!segment.pauseAt) {
      return sum
    }
    return sum + Math.max(0, segment.durationMs)
  }, 0)
}


function sanitizeTaskDirectoryName(taskId) {
  return String(taskId || 'task').replace(/[^\w-]/g, '_')
}

function createTaskImageId() {
  return `${Date.now()}-${Math.random().toString(16).slice(2, 10)}`
}

function extensionFromMimeType(mimeType) {
  switch (mimeType) {
    case 'image/jpeg':
      return 'jpg'
    case 'image/webp':
      return 'webp'
    case 'image/gif':
      return 'gif'
    case 'image/bmp':
      return 'bmp'
    default:
      return 'png'
  }
}

function mimeTypeFromAssetPath(storagePath) {
  const ext = path.extname(storagePath).toLowerCase()
  switch (ext) {
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg'
    case '.webp':
      return 'image/webp'
    case '.gif':
      return 'image/gif'
    case '.bmp':
      return 'image/bmp'
    default:
      return 'image/png'
  }
}

function resolveTaskAssetPath(storagePath) {
  if (typeof storagePath !== 'string' || !storagePath) {
    throw new Error('Invalid image path')
  }

  const normalizedPath = path.normalize(storagePath)
  if (path.isAbsolute(normalizedPath) || normalizedPath.startsWith('..')) {
    throw new Error('Unsafe image path')
  }

  const absolutePath = path.resolve(dataDir, normalizedPath)
  const relativeToAssetRoot = path.relative(taskAssetsDir, absolutePath)
  if (relativeToAssetRoot.startsWith('..') || path.isAbsolute(relativeToAssetRoot)) {
    throw new Error('Image path is outside task asset root')
  }

  return absolutePath
}

function writeEdgeDebug(message) {
  try {
    const now = new Date()
    const ts = toLocalIso(now)
    const line = `${ts} ${message}\n`
    fsSync.appendFileSync(edgeDebugLogFile, line, 'utf8')
    const stat = fsSync.statSync(edgeDebugLogFile)
    if (stat.size > 500_000) {
      fsSync.truncateSync(edgeDebugLogFile, 0)
    }
  } catch {
    // Best-effort diagnostics only.
  }
}

function mergeState(raw) {
  if (!raw || typeof raw !== 'object') {
    return defaultState()
  }

  const merged = {
    version: APP_STATE_VERSION,
    tasks: Array.isArray(raw.tasks) ? raw.tasks : [],
    settings: {
      ...DEFAULT_SETTINGS,
      ...(raw.settings || {}),
    },
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : toLocalIso(),
  }

  merged.settings.uiScale = Math.max(0.75, Math.min(1.6, Number(merged.settings.uiScale) || 1))
  merged.settings.taskCardMode = merged.settings.taskCardMode === 'collapsed' ? 'collapsed' : 'expanded'
  merged.settings.taskContentDisplayMode =
    merged.settings.taskContentDisplayMode === 'auto-height' ? 'auto-height' : 'inner-scroll'
  merged.settings.taskPaletteMode =
    merged.settings.taskPaletteMode === 'gray-gradient' || merged.settings.taskPaletteMode === 'default-gray'
      ? merged.settings.taskPaletteMode
      : 'auto-vivid'
  merged.settings.edgeAutoHide = merged.settings.edgeAutoHide !== false
  merged.settings.archivedDisplayMode = merged.settings.archivedDisplayMode === 'range' ? 'range' : 'all'
  merged.settings.archivedRangeStart = isDateText(merged.settings.archivedRangeStart)
    ? merged.settings.archivedRangeStart
    : ''
  merged.settings.archivedRangeEnd = isDateText(merged.settings.archivedRangeEnd) ? merged.settings.archivedRangeEnd : ''

  merged.tasks = merged.tasks
    .map((task, index) => {
      const segments = normalizeTaskSegments(task.segments)
        return {
          ...task,
          order: typeof task.order === 'number' ? task.order : index + 1,
          archived: Boolean(task.archived),
          archivedAt: typeof task.archivedAt === 'string' ? task.archivedAt : null,
          hidden: Boolean(task.hidden),
          hiddenAt:
            typeof task.hiddenAt === 'string'
              ? task.hiddenAt
              : Boolean(task.hidden)
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
        totalDurationMs:
          typeof task.totalDurationMs === 'number' && Number.isFinite(task.totalDurationMs)
            ? Math.max(0, task.totalDurationMs)
            : sumClosedTaskDurations(segments),
      }
    })
    .sort((a, b) => a.order - b.order)

  return merged
}

async function readSnapshot() {
  try {
    const raw = await fs.readFile(snapshotFile, 'utf8')
    return mergeState(JSON.parse(raw))
  } catch {
    return defaultState()
  }
}

async function writeSnapshot(nextState) {
  const stateToSave = {
    ...mergeState(nextState),
    updatedAt: toLocalIso(),
  }

  await fs.writeFile(snapshotFile, `${JSON.stringify(stateToSave, null, 2)}\n`, 'utf8')
  stateCache = stateToSave
  try {
    await cleanupTaskAssetFiles({ dataDir, taskAssetsDir, state: stateToSave })
  } catch {
    // Snapshot writes are authoritative; asset cleanup stays best-effort.
  }
  return stateToSave
}

async function appendEvent(eventDraft) {
  const now = new Date()
  const dateKey = localDateKey(now)
  const eventFile = path.join(dataDir, `events.${dateKey}.jsonl`)

  const record = {
    id: `${Date.now()}-${Math.random().toString(16).slice(2, 10)}`,
    taskId: eventDraft?.taskId ?? null,
    type: eventDraft?.type ?? 'TASK_UPDATE',
    payload: eventDraft?.payload ?? {},
    at: toLocalIso(now),
    dateKey,
  }

  await fs.appendFile(eventFile, `${JSON.stringify(record)}\n`, 'utf8')
}

async function getEventDateRange() {
  const entries = await fs.readdir(dataDir, { withFileTypes: true })
  const dates = entries
    .filter((entry) => entry.isFile())
    .map((entry) => {
      const match = entry.name.match(/^events\.(\d{4}-\d{2}-\d{2})\.jsonl$/)
      return match ? match[1] : null
    })
    .filter(Boolean)
    .sort()

  if (dates.length === 0) {
    return { earliestDate: null, latestDate: null }
  }

  return {
    earliestDate: dates[0],
    latestDate: dates[dates.length - 1],
  }
}

function clearEdgeCollapseTimer() {
  if (!edgeCollapseTimer) {
    return
  }
  clearTimeout(edgeCollapseTimer)
  edgeCollapseTimer = null
}

function clearEdgeHoverPollTimer() {
  if (!edgeHoverPollTimer) {
    return
  }
  clearInterval(edgeHoverPollTimer)
  edgeHoverPollTimer = null
}

function getEdgeStatePayload() {
  return {
    hidden: Boolean(edgeHiddenSide),
    side: edgeHiddenSide,
    mode: edgeHiddenMode,
    manual: edgeHiddenMode === 'manual',
  }
}

function emitEdgeState() {
  const payload = getEdgeStatePayload()
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('todo:edge-state', payload)
  }
  if (manualBadgeWindow && !manualBadgeWindow.isDestroyed()) {
    manualBadgeWindow.webContents.send('todo:edge-state', payload)
  }
}

function applyWindowMinSizeForEdgeMode() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return
  }
  if (WINDOWS_NATIVE_SNAP_MODE && typeof mainWindow.setResizable === 'function') {
    mainWindow.setResizable(edgeHiddenMode !== 'manual')
  }
  if (edgeHiddenMode === 'manual') {
    mainWindow.setMinimumSize(1, 1)
    return
  }
  mainWindow.setMinimumSize(WINDOW_MIN_WIDTH, WINDOW_MIN_HEIGHT)
}

function withEdgeTrackingSuppressed(action) {
  suppressEdgeTracking = true
  try {
    action()
  } finally {
    suppressEdgeTracking = false
  }
}

function clampValue(value, min, max) {
  if (max < min) {
    return min
  }
  return Math.min(max, Math.max(min, value))
}

function getWorkArea(bounds) {
  return screen.getDisplayMatching(bounds).workArea
}

function getActiveEdgeWindow() {
  if (edgeHiddenMode === 'manual' && manualBadgeWindow && !manualBadgeWindow.isDestroyed() && manualBadgeWindow.isVisible()) {
    return manualBadgeWindow
  }
  return mainWindow && !mainWindow.isDestroyed() ? mainWindow : null
}

function destroyManualBadgeWindow() {
  if (!manualBadgeWindow || manualBadgeWindow.isDestroyed()) {
    manualBadgeWindow = null
    return
  }
  const windowToDestroy = manualBadgeWindow
  manualBadgeWindow = null
  allowProgrammaticManualBadgeCloseOnce = true
  windowToDestroy.destroy()
}

function ensureManualBadgeWindow() {
  if (manualBadgeWindow && !manualBadgeWindow.isDestroyed()) {
    return manualBadgeWindow
  }

  manualBadgeWindow = new BrowserWindow({
    width: EDGE_MANUAL_BADGE_LENGTH_PX,
    height: EDGE_MANUAL_BADGE_THICKNESS_PX,
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    resizable: false,
    movable: true,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    hasShadow: false,
    skipTaskbar: true,
    alwaysOnTop: stateCache.settings.alwaysOnTop !== false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  manualBadgeWindow.setMenuBarVisibility(false)
  manualBadgeWindow.on('close', (event) => {
    if (closingInProgress || allowProgrammaticManualBadgeCloseOnce) {
      allowProgrammaticManualBadgeCloseOnce = false
      return
    }
    event.preventDefault()
    expandFromEdgeHidden()
  })
  manualBadgeWindow.on('closed', () => {
    manualBadgeWindow = null
    allowProgrammaticManualBadgeCloseOnce = false
  })
  manualBadgeWindow.loadFile(path.join(__dirname, 'manual-badge.html')).catch((error) => {
    writeEdgeDebug(`manual-badge-load-error error=${error instanceof Error ? error.message : String(error)}`)
  })

  return manualBadgeWindow
}

function showManualBadgeWindow(bounds) {
  const badgeWindow = ensureManualBadgeWindow()
  badgeWindow.setBounds(
    {
      x: Math.round(bounds.x),
      y: Math.round(bounds.y),
      width: Math.round(bounds.width),
      height: Math.round(bounds.height),
    },
    true,
  )
  if (typeof badgeWindow.showInactive === 'function') {
    badgeWindow.showInactive()
  } else {
    badgeWindow.show()
  }
  if (stateCache.settings.alwaysOnTop !== false) {
    badgeWindow.setAlwaysOnTop(true)
    if (typeof badgeWindow.moveTop === 'function') {
      badgeWindow.moveTop()
    }
  }
}

function isCursorNearHiddenEdge() {
  if (!mainWindow || mainWindow.isDestroyed() || !edgeHiddenSide) {
    return false
  }
  if (edgeHiddenMode === 'manual') {
    return false
  }

  const expanded = edgeExpandedBounds || mainWindow.getBounds()
  const workArea = getWorkArea(expanded)
  const cursor = screen.getCursorScreenPoint()
  const inYRange = cursor.y >= expanded.y - 2 && cursor.y <= expanded.y + expanded.height + 2
  const inXRange = cursor.x >= expanded.x - 2 && cursor.x <= expanded.x + expanded.width + 2

  if (edgeHiddenSide === 'left') {
    return inYRange && cursor.x <= workArea.x + EDGE_ACTIVATE_BAND_PX
  }
  if (edgeHiddenSide === 'right') {
    return inYRange && cursor.x >= workArea.x + workArea.width - EDGE_ACTIVATE_BAND_PX
  }
  if (edgeHiddenSide === 'top') {
    return inXRange && cursor.y <= workArea.y + EDGE_ACTIVATE_BAND_PX
  }
  return false
}

function isCursorInsideBounds(bounds, padding = 0) {
  const cursor = screen.getCursorScreenPoint()
  const left = bounds.x - padding
  const right = bounds.x + bounds.width + padding
  const top = bounds.y - padding
  const bottom = bounds.y + bounds.height + padding
  return cursor.x >= left && cursor.x <= right && cursor.y >= top && cursor.y <= bottom
}

function isCursorAtCollapseEdge(side, bounds, workArea) {
  const cursor = screen.getCursorScreenPoint()
  const inYRange = cursor.y >= bounds.y - 6 && cursor.y <= bounds.y + bounds.height + 6
  const inXRange = cursor.x >= bounds.x - 6 && cursor.x <= bounds.x + bounds.width + 6

  if (side === 'left') {
    return inYRange && cursor.x <= workArea.x + EDGE_ACTIVATE_BAND_PX
  }
  if (side === 'right') {
    return inYRange && cursor.x >= workArea.x + workArea.width - EDGE_ACTIVATE_BAND_PX
  }
  if (side === 'top') {
    return inXRange && cursor.y <= workArea.y + EDGE_ACTIVATE_BAND_PX
  }
  return false
}

function getMouseLeaveCollapseDelay() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return EDGE_HIDE_DELAY_ON_MOUSE_LEAVE_MS
  }
  const bounds = mainWindow.getBounds()
  const workArea = getWorkArea(bounds)
  const side = edgeDockSide || detectDockSide(bounds, workArea)
  if (side === 'top') {
    return EDGE_HIDE_DELAY_ON_MOUSE_LEAVE_TOP_MS
  }
  return EDGE_HIDE_DELAY_ON_MOUSE_LEAVE_MS
}

function markEdgeInteraction(durationMs = EDGE_INTERACTION_GRACE_MS, source = 'unknown') {
  const now = Date.now()
  edgeInteractionGraceUntil = now + Math.max(0, durationMs)
  edgeLastInteractionAt = now
  edgeLastInteractionSource = source || 'unknown'
  writeEdgeDebug(`interaction source=${edgeLastInteractionSource} graceMs=${durationMs}`)
}

function hasRecentEdgeInteraction() {
  return Date.now() <= edgeInteractionGraceUntil
}

function markEdgePointerInteraction(type, durationMs = EDGE_INTERNAL_POINTER_GRACE_MS) {
  edgeLastPointerEventAt = Date.now()
  edgeLastPointerEventType = type || 'unknown'
  markEdgeInteraction(durationMs, `pointer:${edgeLastPointerEventType}`)
}

function hasRecentPointerInteraction(maxAgeMs = EDGE_INTERNAL_POINTER_GRACE_MS) {
  if (!edgeLastPointerEventAt) {
    return false
  }
  return Date.now() - edgeLastPointerEventAt <= Math.max(0, maxAgeMs)
}

function cloneBounds(bounds) {
  if (!bounds) {
    return null
  }
  return {
    x: Math.round(bounds.x),
    y: Math.round(bounds.y),
    width: Math.round(bounds.width),
    height: Math.round(bounds.height),
  }
}

function areBoundsEqual(a, b) {
  if (!a || !b) {
    return false
  }
  return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height
}

function formatBounds(bounds) {
  if (!bounds) {
    return 'none'
  }
  return `${bounds.x},${bounds.y},${bounds.width}x${bounds.height}`
}

function getElapsedMs(since) {
  if (!since) {
    return -1
  }
  return Math.max(0, Date.now() - since)
}

function isEdgeRecoveryActive() {
  return Date.now() <= edgeRecoveryUntil
}

function startEdgeRecovery(reason = 'unknown', durationMs = EDGE_VISIBILITY_RECOVERY_MS) {
  edgeRecoveryUntil = Date.now() + Math.max(0, durationMs)
  edgeRecoveryReason = reason || 'unknown'
  writeEdgeDebug(`recovery-start reason=${edgeRecoveryReason} ms=${durationMs} state=${getEdgeWindowStateSummary()}`)
}

function rememberStableDock(side, expandedBounds) {
  if (!side || !expandedBounds) {
    return
  }
  edgeLastStableDockSide = side
  edgeLastStableExpandedBounds = cloneBounds(expandedBounds)
}

function resetDockClearDebounce() {
  edgeDockUndetectedSince = 0
  edgeDockUndetectedCount = 0
}

function getEdgeWindowStateSummary() {
  const activeWindow = getActiveEdgeWindow()
  if (!activeWindow) {
    return 'window=missing'
  }
  const bounds = activeWindow.getBounds()
  const cursor = screen.getCursorScreenPoint()
  return [
    `visible=${activeWindow.isVisible()}`,
    `minimized=${activeWindow.isMinimized()}`,
    `focused=${activeWindow.isFocused()}`,
    `dock=${edgeDockSide || 'none'}`,
    `hidden=${edgeHiddenSide || 'none'}`,
    `mode=${edgeHiddenMode}`,
    `bounds=${formatBounds(bounds)}`,
    `expanded=${formatBounds(edgeExpandedBounds)}`,
    `stableDock=${edgeLastStableDockSide || 'none'}`,
    `stableExpanded=${formatBounds(edgeLastStableExpandedBounds)}`,
    `cursor=${cursor.x},${cursor.y}`,
    `interactionAge=${getElapsedMs(edgeLastInteractionAt)}`,
    `interactionSource=${edgeLastInteractionSource}`,
    `pointerAge=${getElapsedMs(edgeLastPointerEventAt)}`,
    `pointerType=${edgeLastPointerEventType}`,
    `recovery=${isEdgeRecoveryActive()}`,
    `recoveryReason=${edgeRecoveryReason}`,
  ].join(' ')
}

function isCursorInsideExpandedBounds(padding = 0) {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return false
  }
  const bounds = edgeExpandedBounds || mainWindow.getBounds()
  return isCursorInsideBounds(bounds, padding)
}

function shouldAbortBlurCollapse() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return true
  }
  return shouldAbortBlurCollapseState({
    visible: mainWindow.isVisible(),
    minimized: mainWindow.isMinimized(),
    startupProtected: Date.now() <= edgeStartupProtectUntil,
    recoveryActive: isEdgeRecoveryActive(),
    focused: mainWindow.isFocused(),
    recentPointer: hasRecentPointerInteraction(),
    recentEdge: hasRecentEdgeInteraction(),
    cursorInside: isCursorInsideExpandedBounds(EDGE_BLUR_GUARD_PADDING_PX),
  })
}

function shouldAbortAutoCollapse() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return true
  }
  if (!mainWindow.isVisible() || mainWindow.isMinimized()) {
    return true
  }
  if (Date.now() <= edgeStartupProtectUntil) {
    return true
  }
  if (isEdgeRecoveryActive()) {
    return true
  }
  if (hasRecentPointerInteraction()) {
    return true
  }
  if (hasRecentEdgeInteraction()) {
    return true
  }
  if (mainWindow.isFocused()) {
    return true
  }
  if (isCursorInsideExpandedBounds(24)) {
    return true
  }
  const bounds = mainWindow.getBounds()
  const workArea = getWorkArea(bounds)
  const side = edgeDockSide || detectDockSide(bounds, workArea)
  const collapseEdgeBounds = edgeExpandedBounds || bounds
  const cursorAtCollapseEdge = side ? isCursorAtCollapseEdge(side, collapseEdgeBounds, workArea) : false
  if (cursorAtCollapseEdge && getElapsedMs(edgeLastInteractionAt) <= EDGE_COLLAPSE_EDGE_COOLDOWN_MS) {
    return true
  }
  return false
}

function shouldGuardUnexpectedVisibilityLoss() {
  if (!mainWindow || mainWindow.isDestroyed() || closingInProgress) {
    return false
  }
  if (allowProgrammaticHideOnce) {
    return false
  }
  if (Date.now() <= edgeStartupProtectUntil) {
    return true
  }
  if (hasRecentEdgeInteraction()) {
    return true
  }
  if (isCursorInsideExpandedBounds(140)) {
    return true
  }
  return Boolean(edgeHiddenSide)
}

function restoreStableDock(reason = 'unknown') {
  if (
    !mainWindow ||
    mainWindow.isDestroyed() ||
    edgeHiddenSide ||
    !edgeLastStableDockSide ||
    !edgeLastStableExpandedBounds
  ) {
    return false
  }
  const workArea = getWorkArea(edgeLastStableExpandedBounds)
  const expanded = getExpandedBoundsForSide(edgeLastStableExpandedBounds, edgeLastStableDockSide, workArea)
  setMainWindowBoundsSilently(expanded)
  edgeDockSide = edgeLastStableDockSide
  edgeExpandedBounds = cloneBounds(expanded)
  rememberStableDock(edgeDockSide, edgeExpandedBounds)
  emitEdgeState()
  writeEdgeDebug(
    `restore-stable reason=${reason} side=${edgeDockSide} expanded=${JSON.stringify(edgeExpandedBounds)} state=${getEdgeWindowStateSummary()}`,
  )
  return true
}

function recoverUnexpectedVisibilityLoss(reason = 'unknown') {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return
  }

  startEdgeRecovery(reason)

  if (mainWindow.isMinimized()) {
    mainWindow.restore()
  }
  if (!mainWindow.isVisible()) {
    mainWindow.show()
  }
  if (stateCache.settings.alwaysOnTop !== false) {
    mainWindow.setAlwaysOnTop(true)
    if (typeof mainWindow.moveTop === 'function') {
      mainWindow.moveTop()
    }
  }
  if (edgeHiddenSide && edgeHiddenMode !== 'manual') {
    expandFromEdgeHidden()
  } else if (!edgeDockSide && edgeLastStableDockSide) {
    restoreStableDock(`${reason}:immediate`)
  }

  writeEdgeDebug(`recovery-visible reason=${reason} state=${getEdgeWindowStateSummary()}`)

  setTimeout(() => {
    if (!mainWindow || mainWindow.isDestroyed()) {
      return
    }
    writeEdgeDebug(`recovery-refresh reason=${reason} stage=before state=${getEdgeWindowStateSummary()}`)
    if (!edgeHiddenSide && !edgeDockSide && edgeLastStableDockSide) {
      restoreStableDock(`${reason}:delayed`)
    }
    refreshEdgeDockState(`recovery:${reason}`)
    writeEdgeDebug(`recovery-refresh reason=${reason} stage=after state=${getEdgeWindowStateSummary()}`)
  }, EDGE_RECOVERY_REFRESH_DELAY_MS)

  markEdgeInteraction(EDGE_VISIBILITY_RECOVERY_MS, `recover:${reason}`)
}

function startEdgeHoverPoll() {
  if (edgeHoverPollTimer || !edgeAutoHideEnabled) {
    return
  }

  edgeHoverPollTimer = setInterval(() => {
    if (!edgeAutoHideEnabled || !mainWindow || mainWindow.isDestroyed()) {
      return
    }

    if (edgeHiddenSide) {
      if (isCursorNearHiddenEdge()) {
        clearEdgeCollapseTimer()
        expandFromEdgeHidden()
        markEdgeInteraction(EDGE_INTERACTION_GRACE_MS, 'hover-expand')
      }
      return
    }

    const bounds = mainWindow.getBounds()
    if (isCursorInsideBounds(bounds, 1)) {
      clearEdgeCollapseTimer()
      return
    }

    if (!edgeCollapseTimer) {
      scheduleEdgeCollapse({
        delayMs: getMouseLeaveCollapseDelay(),
        allowUndocked: false,
        shouldAbort: shouldAbortAutoCollapse,
        reason: 'hover-poll',
      })
    }
  }, EDGE_HOVER_POLL_MS)
}

function detectDockSide(bounds, workArea) {
  const leftDistance = Math.abs(bounds.x - workArea.x)
  const rightDistance = Math.abs(bounds.x + bounds.width - (workArea.x + workArea.width))
  const topDistance = Math.abs(bounds.y - workArea.y)

  if (leftDistance <= EDGE_DOCK_THRESHOLD_PX) {
    return 'left'
  }
  if (rightDistance <= EDGE_DOCK_THRESHOLD_PX) {
    return 'right'
  }
  if (topDistance <= EDGE_DOCK_THRESHOLD_PX) {
    return 'top'
  }
  return null
}

function detectNearestHideSide(bounds, workArea, { allowTop = false } = {}) {
  const candidates = [
    { side: 'left', distance: Math.abs(bounds.x - workArea.x) },
    { side: 'right', distance: Math.abs(bounds.x + bounds.width - (workArea.x + workArea.width)) },
  ]
  if (allowTop) {
    candidates.push({ side: 'top', distance: Math.abs(bounds.y - workArea.y) })
  }
  candidates.sort((a, b) => a.distance - b.distance)
  return candidates[0]?.side || null
}

function getExpandedBoundsForSide(bounds, side, workArea) {
  const next = {
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
  }

  if (side === 'left') {
    next.x = workArea.x
  } else if (side === 'right') {
    next.x = workArea.x + workArea.width - bounds.width
  } else if (side === 'top') {
    next.y = workArea.y
  }

  const maxX = workArea.x + workArea.width - bounds.width
  const maxY = workArea.y + workArea.height - bounds.height
  next.x = clampValue(next.x, workArea.x, maxX)
  next.y = clampValue(next.y, workArea.y, maxY)
  return next
}

function getHiddenBoundsForSide(expandedBounds, side, workArea) {
  const next = {
    x: expandedBounds.x,
    y: expandedBounds.y,
    width: expandedBounds.width,
    height: expandedBounds.height,
  }

  if (side === 'left') {
    next.x = workArea.x - expandedBounds.width + EDGE_HIDE_VISIBLE_PX
  } else if (side === 'right') {
    next.x = workArea.x + workArea.width - EDGE_HIDE_VISIBLE_PX
  } else if (side === 'top') {
    next.y = workArea.y - expandedBounds.height + EDGE_HIDE_VISIBLE_PX
  }

  return next
}

function getManualBadgeBoundsForSide(expandedBounds, side, workArea) {
  const verticalHeight = EDGE_MANUAL_BADGE_LENGTH_PX
  const horizontalWidth = EDGE_MANUAL_BADGE_LENGTH_PX
  const thickness = EDGE_MANUAL_BADGE_THICKNESS_PX

  if (side === 'left') {
    return {
      x: workArea.x,
      y: clampValue(
        expandedBounds.y + EDGE_MANUAL_BADGE_VERTICAL_OFFSET_PX,
        workArea.y,
        workArea.y + workArea.height - verticalHeight,
      ),
      width: thickness,
      height: verticalHeight,
    }
  }

  if (side === 'right') {
    return {
      x: workArea.x + workArea.width - thickness,
      y: clampValue(
        expandedBounds.y + EDGE_MANUAL_BADGE_VERTICAL_OFFSET_PX,
        workArea.y,
        workArea.y + workArea.height - verticalHeight,
      ),
      width: thickness,
      height: verticalHeight,
    }
  }

  return {
    x: clampValue(
      expandedBounds.x + expandedBounds.width - horizontalWidth - EDGE_MANUAL_BADGE_TOP_RIGHT_OFFSET_PX,
      workArea.x,
      workArea.x + workArea.width - horizontalWidth,
    ),
    y: workArea.y,
    width: horizontalWidth,
    height: thickness,
  }
}

function getExpandedBoundsFromManualBadge(badgeBounds, side, workArea, baseExpandedBounds) {
  const next = {
    x: baseExpandedBounds.x,
    y: baseExpandedBounds.y,
    width: baseExpandedBounds.width,
    height: baseExpandedBounds.height,
  }

  if (side === 'left' || side === 'right') {
    next.y = clampValue(
      badgeBounds.y - EDGE_MANUAL_BADGE_VERTICAL_OFFSET_PX,
      workArea.y,
      workArea.y + workArea.height - next.height,
    )
  } else if (side === 'top') {
    next.x = clampValue(
      badgeBounds.x - next.width + EDGE_MANUAL_BADGE_LENGTH_PX + EDGE_MANUAL_BADGE_TOP_RIGHT_OFFSET_PX,
      workArea.x,
      workArea.x + workArea.width - next.width,
    )
  }

  return getExpandedBoundsForSide(next, side, workArea)
}

function setMainWindowBoundsSilently(bounds) {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return
  }

  const next = {
    x: Math.round(bounds.x),
    y: Math.round(bounds.y),
    width: Math.round(bounds.width),
    height: Math.round(bounds.height),
  }

  withEdgeTrackingSuppressed(() => {
    mainWindow.setBounds(next, true)
  })
}

function refreshEdgeDockState(reason = 'unknown') {
  if (!mainWindow || mainWindow.isDestroyed() || suppressEdgeTracking || edgeHiddenSide || !edgeAutoHideEnabled) {
    return
  }

  const previousSide = edgeDockSide
  const previousExpanded = cloneBounds(edgeExpandedBounds)
  const bounds = mainWindow.getBounds()
  const workArea = getWorkArea(bounds)
  const side = detectDockSide(bounds, workArea)
  if (!side) {
    const now = Date.now()
    const recoveryActive = isEdgeRecoveryActive()
    const immediateResolution = resolveUndetectedDockState({
      previousSide,
      previousExpanded,
      currentExpanded: edgeExpandedBounds,
      stableSide: edgeLastStableDockSide,
      stableExpanded: edgeLastStableExpandedBounds,
      recoveryActive,
      missCount: edgeDockUndetectedCount,
      undockedMs: edgeDockUndetectedSince ? now - edgeDockUndetectedSince : 0,
      minMissCount: EDGE_DOCK_CLEAR_MIN_MISS_COUNT,
      debounceMs: EDGE_DOCK_CLEAR_DEBOUNCE_MS,
    })

    writeEdgeDebug(
      `dock-detect-miss reason=${reason} detected=none previous=${previousSide || 'none'} stable=${edgeLastStableDockSide || 'none'} bounds=${formatBounds(bounds)} workArea=${formatBounds(workArea)} action=${immediateResolution.action} recovery=${recoveryActive} state=${getEdgeWindowStateSummary()}`,
    )

    if (immediateResolution.action === 'preserve-recovery' || immediateResolution.action === 'clear-idle') {
      edgeDockSide = immediateResolution.nextSide
      edgeExpandedBounds = cloneBounds(immediateResolution.nextExpanded)
      if (immediateResolution.resetDebounce) {
        resetDockClearDebounce()
      }
      if (immediateResolution.action === 'preserve-recovery') {
        writeEdgeDebug(
          `dock-clear-preserved reason=${reason} detected=none preserved=${edgeDockSide || 'none'} expanded=${formatBounds(edgeExpandedBounds)} state=${getEdgeWindowStateSummary()}`,
        )
      }
      return
    }

    if (!edgeDockUndetectedSince) {
      edgeDockUndetectedSince = now
      edgeDockUndetectedCount = 0
      writeEdgeDebug(`dock-clear-pending reason=${reason} detected=none state=${getEdgeWindowStateSummary()}`)
    }

    edgeDockUndetectedCount += 1
    const undockedMs = now - edgeDockUndetectedSince
    const resolution = resolveUndetectedDockState({
      previousSide,
      previousExpanded,
      currentExpanded: edgeExpandedBounds,
      stableSide: edgeLastStableDockSide,
      stableExpanded: edgeLastStableExpandedBounds,
      recoveryActive,
      missCount: edgeDockUndetectedCount,
      undockedMs,
      minMissCount: EDGE_DOCK_CLEAR_MIN_MISS_COUNT,
      debounceMs: EDGE_DOCK_CLEAR_DEBOUNCE_MS,
    })

    edgeDockSide = resolution.nextSide
    edgeExpandedBounds = cloneBounds(resolution.nextExpanded)
    if (resolution.action === 'preserve-pending') {
      return
    }

    writeEdgeDebug(
      `dock-clear-commit reason=${reason} detected=none undockedMs=${undockedMs} misses=${edgeDockUndetectedCount} state=${getEdgeWindowStateSummary()}`,
    )
    if (resolution.resetDebounce) {
      resetDockClearDebounce()
    }
    return
  }

  resetDockClearDebounce()
  edgeDockSide = side

  const expanded = getExpandedBoundsForSide(bounds, side, workArea)
  edgeExpandedBounds = cloneBounds(expanded)
  rememberStableDock(side, edgeExpandedBounds)

  if (previousSide !== side || !areBoundsEqual(previousExpanded, edgeExpandedBounds)) {
    writeEdgeDebug(
      `dock-refresh reason=${reason} side=${side} bounds=${JSON.stringify(bounds)} expanded=${JSON.stringify(edgeExpandedBounds)} state=${getEdgeWindowStateSummary()}`,
    )
  }

  if (expanded.x !== bounds.x || expanded.y !== bounds.y) {
    setMainWindowBoundsSilently(expanded)
  }
}

function expandFromEdgeHidden() {
  if (!mainWindow || mainWindow.isDestroyed() || !edgeHiddenSide) {
    return
  }

  const side = edgeHiddenSide
  const baseBounds = edgeExpandedBounds || mainWindow.getBounds()
  const workArea = getWorkArea(baseBounds)
  const expanded = getExpandedBoundsForSide(baseBounds, side, workArea)

  destroyManualBadgeWindow()
  setMainWindowBoundsSilently(expanded)
  if (!mainWindow.isVisible()) {
    if (typeof mainWindow.showInactive === 'function') {
      mainWindow.showInactive()
    } else {
      mainWindow.show()
    }
  }
  edgeHiddenSide = null
  edgeHiddenMode = 'none'
  edgeDockSide = side
  edgeExpandedBounds = cloneBounds(expanded)
  rememberStableDock(side, edgeExpandedBounds)
  applyWindowMinSizeForEdgeMode()
  emitEdgeState()
  writeEdgeDebug(`expand side=${side} expanded=${JSON.stringify(expanded)} state=${getEdgeWindowStateSummary()}`)
}

function collapseToEdgeHidden({ allowUndocked = false, reason = 'unknown' } = {}) {
  if (!mainWindow || mainWindow.isDestroyed() || !edgeAutoHideEnabled || edgeHiddenSide) {
    return
  }

  const bounds = mainWindow.getBounds()
  const workArea = getWorkArea(bounds)
  const side =
    edgeDockSide ||
    detectDockSide(bounds, workArea) ||
    (allowUndocked ? detectNearestHideSide(bounds, workArea, { allowTop: true }) : null)
  if (!side) {
    writeEdgeDebug(`collapse-skip reason=${reason} allowUndocked=${allowUndocked} state=${getEdgeWindowStateSummary()}`)
    return
  }

  const expanded = getExpandedBoundsForSide(edgeExpandedBounds || bounds, side, workArea)
  const hidden = getHiddenBoundsForSide(expanded, side, workArea)

  setMainWindowBoundsSilently(hidden)
  edgeExpandedBounds = cloneBounds(expanded)
  rememberStableDock(side, edgeExpandedBounds)
  edgeDockSide = side
  edgeHiddenSide = side
  edgeHiddenMode = 'auto'
  applyWindowMinSizeForEdgeMode()
  emitEdgeState()
  writeEdgeDebug(
    `collapse side=${side} allowUndocked=${allowUndocked} reason=${reason} bounds=${JSON.stringify(bounds)} hidden=${JSON.stringify(hidden)} state=${getEdgeWindowStateSummary()}`,
  )
}

function collapseToManualEdgeBadge() {
  if (!mainWindow || mainWindow.isDestroyed() || edgeHiddenSide) {
    return false
  }

  clearEdgeCollapseTimer()

  const bounds = mainWindow.getBounds()
  const workArea = getWorkArea(bounds)
  const side =
    edgeDockSide ||
    detectDockSide(bounds, workArea) ||
    edgeLastStableDockSide ||
    detectNearestHideSide(bounds, workArea, { allowTop: true })
  if (!side) {
    return false
  }

  const expanded = getExpandedBoundsForSide(edgeExpandedBounds || edgeLastStableExpandedBounds || bounds, side, workArea)
  const badgeBounds = getManualBadgeBoundsForSide(expanded, side, workArea)

  edgeExpandedBounds = cloneBounds(expanded)
  rememberStableDock(side, edgeExpandedBounds)
  edgeDockSide = side
  edgeHiddenSide = side
  edgeHiddenMode = 'manual'
  applyWindowMinSizeForEdgeMode()
  if (WINDOWS_NATIVE_SNAP_MODE) {
    setMainWindowBoundsSilently(expanded)
    showManualBadgeWindow(badgeBounds)
    allowProgrammaticHideOnce = true
    mainWindow.hide()
  } else {
    setMainWindowBoundsSilently(badgeBounds)
  }
  emitEdgeState()
  writeEdgeDebug(
    `manual-collapse side=${side} expanded=${JSON.stringify(expanded)} badge=${JSON.stringify(badgeBounds)} state=${getEdgeWindowStateSummary()}`,
  )
  return true
}

function toggleManualEdgeCollapse() {
  if (edgeHiddenSide) {
    expandFromEdgeHidden()
    markEdgeInteraction(EDGE_INTERACTION_GRACE_MS, 'toggle-manual-expand')
    return true
  }
  const collapsed = collapseToManualEdgeBadge()
  if (collapsed) {
    markEdgeInteraction(900, 'toggle-manual-collapse')
  }
  return collapsed
}

function scheduleEdgeCollapse({ delayMs = EDGE_HIDE_DELAY_MS, allowUndocked = false, shouldAbort = null, reason = 'unknown' } = {}) {
  clearEdgeCollapseTimer()
  if (!edgeAutoHideEnabled || edgeHiddenSide) {
    return
  }
  if (!edgeDockSide && !allowUndocked) {
    return
  }
  writeEdgeDebug(`collapse-schedule reason=${reason} delay=${delayMs} allowUndocked=${allowUndocked} state=${getEdgeWindowStateSummary()}`)
  edgeCollapseTimer = setTimeout(() => {
    edgeCollapseTimer = null
    if (typeof shouldAbort === 'function' && shouldAbort()) {
      writeEdgeDebug(`collapse-abort reason=${reason} delay=${delayMs} allowUndocked=${allowUndocked} state=${getEdgeWindowStateSummary()}`)
      return
    }
    writeEdgeDebug(`collapse-run reason=${reason} delay=${delayMs} allowUndocked=${allowUndocked} state=${getEdgeWindowStateSummary()}`)
    collapseToEdgeHidden({ allowUndocked, reason })
  }, delayMs)
}

function setEdgeAutoHideEnabled(enabled) {
  edgeAutoHideEnabled = Boolean(enabled)
  clearEdgeCollapseTimer()
  clearEdgeHoverPollTimer()

  if (!mainWindow || mainWindow.isDestroyed()) {
    return
  }

  if (!edgeAutoHideEnabled) {
    if (edgeHiddenSide) {
      expandFromEdgeHidden()
    }
    edgeDockSide = null
    edgeHiddenSide = null
    edgeHiddenMode = 'none'
    edgeExpandedBounds = null
    applyWindowMinSizeForEdgeMode()
    emitEdgeState()
    return
  }

  startEdgeHoverPoll()
  refreshEdgeDockState('set-edge-auto-hide')
  emitEdgeState()
}

function installEdgeAutoHideHandlers() {
  if (!mainWindow) {
    return
  }

  mainWindow.on('move', () => {
    refreshEdgeDockState('move')
  })

  mainWindow.on('resize', () => {
    refreshEdgeDockState('resize')
  })

  mainWindow.on('mouse-enter', () => {
    writeEdgeDebug(`event mouse-enter state=${getEdgeWindowStateSummary()}`)
    markEdgeInteraction(EDGE_INTERACTION_GRACE_MS, 'mouse-enter')
    clearEdgeCollapseTimer()
    if (edgeHiddenSide && edgeHiddenMode !== 'manual') {
      expandFromEdgeHidden()
    }
  })

  mainWindow.on('mouse-leave', () => {
    writeEdgeDebug(`event mouse-leave state=${getEdgeWindowStateSummary()}`)
    scheduleEdgeCollapse({
      delayMs: getMouseLeaveCollapseDelay(),
      allowUndocked: false,
      shouldAbort: shouldAbortAutoCollapse,
      reason: 'mouse-leave',
    })
  })

  mainWindow.on('blur', () => {
    writeEdgeDebug(
      `event blur focused=${mainWindow?.isFocused?.()} hiddenSide=${edgeHiddenSide || 'none'} dock=${edgeDockSide || 'none'} state=${getEdgeWindowStateSummary()}`,
    )
    clearEdgeCollapseTimer()
    if (shouldAbortBlurCollapse()) {
      writeEdgeDebug(`event blur abort state=${getEdgeWindowStateSummary()}`)
      return
    }
    scheduleEdgeCollapse({
      delayMs: EDGE_HIDE_DELAY_ON_BLUR_MS,
      allowUndocked: false,
      shouldAbort: shouldAbortBlurCollapse,
      reason: 'blur',
    })
  })

  mainWindow.on('focus', () => {
    writeEdgeDebug(`event focus state=${getEdgeWindowStateSummary()}`)
    markEdgeInteraction(EDGE_INTERACTION_GRACE_MS, 'focus')
    clearEdgeCollapseTimer()
    if (!edgeDockSide && edgeLastStableDockSide && isEdgeRecoveryActive()) {
      restoreStableDock('focus-recovery')
    }
    if (edgeHiddenSide && edgeHiddenMode !== 'manual') {
      expandFromEdgeHidden()
    }
  })

  mainWindow.on('minimize', (event) => {
    const shouldBlockUnexpected = edgeAutoHideEnabled && !allowProgrammaticMinimizeOnce
    const shouldGuard = shouldGuardUnexpectedVisibilityLoss()
    writeEdgeDebug(
      `event minimize block=${shouldBlockUnexpected} guard=${shouldGuard} allowOnce=${allowProgrammaticMinimizeOnce} state=${getEdgeWindowStateSummary()}`,
    )
    if (allowProgrammaticMinimizeOnce) {
      allowProgrammaticMinimizeOnce = false
      return
    }
    if (!shouldBlockUnexpected && !shouldGuard) {
      return
    }
    event.preventDefault()
    recoverUnexpectedVisibilityLoss('minimize')
  })

  mainWindow.on('hide', () => {
    if (allowProgrammaticHideOnce) {
      allowProgrammaticHideOnce = false
      writeEdgeDebug(`event hide allowOnce state=${getEdgeWindowStateSummary()}`)
      return
    }
    const shouldReshow = !closingInProgress && (edgeAutoHideEnabled || shouldGuardUnexpectedVisibilityLoss())
    writeEdgeDebug(`event hide reshow=${shouldReshow} closing=${closingInProgress} state=${getEdgeWindowStateSummary()}`)
    if (!shouldReshow) {
      return
    }
    recoverUnexpectedVisibilityLoss('hide')
  })

  mainWindow.webContents.on('before-mouse-event', (_event, input) => {
    if (!input?.type) {
      return
    }
    if (input.type === 'mouseDown' || input.type === 'mouseUp' || input.type === 'mouseWheel') {
      writeEdgeDebug(`event before-mouse type=${input.type} button=${input.button || 'none'} state=${getEdgeWindowStateSummary()}`)
      markEdgePointerInteraction(input.type)
    }
  })

  mainWindow.webContents.on('before-input-event', (_event, input) => {
    if (!input?.type) {
      return
    }
    markEdgeInteraction(EDGE_INTERACTION_GRACE_MS, `input:${input.type}`)
  })
}

function enqueuePersist(work) {
  const run = persistQueue.then(work)
  persistQueue = run.catch(() => undefined)
  return run
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function requestRendererCloseFlush(timeoutMs = CLOSE_FLUSH_WAIT_MS) {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return Promise.resolve()
  }

  const webContents = mainWindow.webContents
  if (!webContents || webContents.isDestroyed()) {
    return Promise.resolve()
  }

  const requestId = `close-flush-${Date.now()}-${closeFlushRequestSequence++}`

  return new Promise((resolve) => {
    let settled = false
    const finish = () => {
      if (settled) {
        return
      }

      settled = true
      clearTimeout(timer)
      ipcMain.removeListener('todo:before-close-flush-result', onResult)
      resolve()
    }

    const onResult = (_event, payload) => {
      if (!payload || payload.requestId !== requestId) {
        return
      }

      finish()
    }

    const timer = setTimeout(finish, timeoutMs)
    ipcMain.on('todo:before-close-flush-result', onResult)

    try {
      webContents.send('todo:before-close-flush', requestId)
    } catch {
      finish()
    }
  })
}

function emitSyncStatus(status) {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return
  }

  try {
    mainWindow.webContents.send('todo:sync-status', status)
  } catch {
    // Renderer sync status updates are best-effort.
  }
}

function emitStateRefreshed() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return
  }

  try {
    mainWindow.webContents.send('todo:state-refreshed')
  } catch {
    // Renderer refresh notifications are best-effort.
  }
}

async function closeAppFast() {
  if (closingInProgress) {
    return
  }
  closingInProgress = true
  clearEdgeCollapseTimer()
  clearEdgeHoverPollTimer()

  try {
    await requestRendererCloseFlush(CLOSE_FLUSH_WAIT_MS)
  } catch {
    // Ignore close-time renderer flush errors to avoid blocking shutdown.
  }

  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.hide()
    mainWindow.setSkipTaskbar(true)
  }
  destroyManualBadgeWindow()

  try {
    await Promise.race([persistQueue.catch(() => undefined), wait(CLOSE_FLUSH_WAIT_MS)])
  } catch {
    // Ignore close-time flush errors to avoid blocking shutdown.
  }

  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.destroy()
  }

  app.quit()
}

function applyWindowSettings(settings) {
  if (!mainWindow) {
    return
  }

  if (typeof settings.opacity === 'number') {
    const value = Math.max(0.25, Math.min(1, settings.opacity))
    mainWindow.setOpacity(value)
  }

  if (typeof settings.alwaysOnTop === 'boolean') {
    mainWindow.setAlwaysOnTop(settings.alwaysOnTop)
    if (manualBadgeWindow && !manualBadgeWindow.isDestroyed()) {
      manualBadgeWindow.setAlwaysOnTop(settings.alwaysOnTop)
    }
  }

  if (typeof settings.edgeAutoHide === 'boolean') {
    setEdgeAutoHideEnabled(settings.edgeAutoHide)
  }
}

function applyAutoLaunch(enabled) {
  const openAtLogin = Boolean(enabled)
  const options = {
    openAtLogin,
    path: process.execPath,
    args: app.isPackaged ? [] : [path.resolve(process.argv[1] || '')],
  }

  app.setLoginItemSettings(options)
}

async function createMainWindow() {
  const { opacity, alwaysOnTop, edgeAutoHide } = stateCache.settings

  mainWindow = new BrowserWindow({
    width: 500,
    height: 760,
    minWidth: WINDOW_MIN_WIDTH,
    minHeight: WINDOW_MIN_HEIGHT,
    x: 20,
    y: 20,
    transparent: !WINDOWS_NATIVE_SNAP_MODE,
    frame: false,
    show: false,
    hasShadow: true,
    alwaysOnTop,
    title: 'Floating Todo',
    icon: windowIconPath,
    backgroundColor: WINDOWS_NATIVE_SNAP_MODE ? '#101521' : '#00000000',
    thickFrame: true,
    roundedCorners: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  mainWindow.setMenuBarVisibility(false)
  mainWindow.setOpacity(Math.max(0.25, Math.min(1, opacity)))
  ensureManualBadgeWindow()
  if (WINDOWS_NATIVE_SNAP_MODE && typeof mainWindow.setBackgroundMaterial === 'function') {
    try {
      mainWindow.setBackgroundMaterial('acrylic')
    } catch {}
  }
  mainWindow.on('close', (event) => {
    if (closingInProgress) {
      return
    }

    event.preventDefault()
    void closeAppFast()
  })
  edgeDockSide = null
  edgeHiddenSide = null
  edgeHiddenMode = 'none'
  edgeExpandedBounds = null
  applyWindowMinSizeForEdgeMode()
  installEdgeAutoHideHandlers()
  setEdgeAutoHideEnabled(edgeAutoHide !== false)

  let shown = false
  const safeShow = (trigger = 'unknown') => {
    if (!mainWindow || mainWindow.isDestroyed() || shown) {
      return
    }
    shown = true
    edgeStartupProtectUntil = Date.now() + 12_000
    if (typeof mainWindow.showInactive === 'function') {
      mainWindow.showInactive()
    } else {
      mainWindow.show()
    }
    if (stateCache.settings.alwaysOnTop !== false && typeof mainWindow.moveTop === 'function') {
      mainWindow.moveTop()
    }
    markEdgeInteraction(EDGE_INTERACTION_GRACE_MS, 'window-safe-show')
    emitEdgeState()
    writeEdgeDebug(`window safeShow trigger=${trigger} state=${getEdgeWindowStateSummary()}`)
  }

  mainWindow.once('ready-to-show', () => safeShow('ready-to-show'))
  mainWindow.webContents.once('did-finish-load', () => safeShow('did-finish-load'))
  setTimeout(() => safeShow('timeout'), 1200)

  const devServerUrl = process.env.VITE_DEV_SERVER_URL
  if (devServerUrl) {
    await mainWindow.loadURL(devServerUrl)
  } else {
    const rendererEntry = app.isPackaged
      ? path.join(__dirname, '..', 'dist', 'index.html')
      : path.join(process.cwd(), 'dist', 'index.html')
    await mainWindow.loadFile(rendererEntry)
  }
}

ipcMain.handle('todo:get-state', async () => {
  return stateCache
})

ipcMain.handle('todo:get-event-date-range', async () => {
  try {
    return await getEventDateRange()
  } catch {
    return { earliestDate: null, latestDate: null }
  }
})

ipcMain.handle('todo:persist-state', async (_event, payload) => {
  try {
    await enqueuePersist(async () => {
      const nextState = mergeState(payload?.state)
      await appendEvent(payload?.event)
      await writeSnapshot(nextState)
    })

    syncRuntime?.scheduleSync('persist-state')

    return { ok: true }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    mainWindow?.webContents.send('todo:persist-error', message)
    return { ok: false, error: message }
  }
})


ipcMain.handle('todo:save-task-image', async (_event, payload) => {
  try {
    const taskId = typeof payload?.taskId === 'string' ? payload.taskId : ''
    const mimeType = typeof payload?.mimeType === 'string' ? payload.mimeType : ''
    const rawBytes = payload?.bytes

    if (!taskId || !mimeType.startsWith('image/')) {
      return { ok: false, error: 'Invalid image payload' }
    }

    const bytes = rawBytes instanceof Uint8Array ? rawBytes : Uint8Array.from(rawBytes || [])
    if (!bytes.length) {
      return { ok: false, error: 'Empty image payload' }
    }

    const imageId = createTaskImageId()
    const extension = extensionFromMimeType(mimeType)
    const taskDirectory = path.join(taskAssetsDir, sanitizeTaskDirectoryName(taskId))
    const fileName = `${imageId}.${extension}`
    const absolutePath = path.join(taskDirectory, fileName)

    await fs.mkdir(taskDirectory, { recursive: true })
    await fs.writeFile(absolutePath, Buffer.from(bytes))

    return {
      ok: true,
      image: {
        id: imageId,
        storagePath: path.relative(dataDir, absolutePath).replace(/\\/g, '/'),
        mimeType,
        createdAt: toLocalIso(),
      },
    }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
})

ipcMain.handle('todo:read-task-image-data-url', async (_event, storagePath) => {
  try {
    const absolutePath = resolveTaskAssetPath(storagePath)
    const buffer = await fs.readFile(absolutePath)
    const mimeType = mimeTypeFromAssetPath(storagePath)
    return `data:${mimeType};base64,${buffer.toString('base64')}`
  } catch {
    return null
  }
})

ipcMain.handle('todo:open-task-image', async (_event, storagePath) => {
  try {
    const absolutePath = resolveTaskAssetPath(storagePath)
    const result = await shell.openPath(absolutePath)
    return result ? { ok: false, error: result } : { ok: true }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
})
ipcMain.handle('todo:set-window-options', async (_event, options) => {
  try {
    applyWindowSettings(options || {})
    return { ok: true }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
})

ipcMain.handle('todo:get-edge-state', async () => {
  return getEdgeStatePayload()
})

ipcMain.handle('todo:toggle-edge-collapse', async () => {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return { ok: false, error: 'Window not ready', state: getEdgeStatePayload() }
  }
  const ok = toggleManualEdgeCollapse()
  return {
    ok,
    error: ok ? undefined : 'Unable to toggle edge collapse',
    state: getEdgeStatePayload(),
  }
})

ipcMain.handle('todo:set-auto-launch', async (_event, enabled) => {
  try {
    applyAutoLaunch(enabled)
    return { ok: true }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
})

ipcMain.handle('todo:window-control', async (_event, action) => {
  if (!mainWindow) {
    return { ok: false, error: 'Window not ready' }
  }

  if (action === 'minimize') {
    allowProgrammaticMinimizeOnce = true
    mainWindow.minimize()
    setTimeout(() => {
      allowProgrammaticMinimizeOnce = false
    }, 200)
    return { ok: true }
  }

  if (action === 'close') {
    void closeAppFast()
    return { ok: true }
  }

  return { ok: false, error: 'Unknown action' }
})

ipcMain.handle('todo:get-window-position', async () => {
  const targetWindow =
    edgeHiddenMode === 'manual' && manualBadgeWindow && !manualBadgeWindow.isDestroyed() ? manualBadgeWindow : mainWindow
  if (!targetWindow || targetWindow.isDestroyed()) {
    return null
  }

  const [x, y] = targetWindow.getPosition()
  return { x, y }
})

ipcMain.handle('todo:set-window-position', async (_event, position) => {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return { ok: false, error: 'Window not ready' }
  }

  if (!position || typeof position.x !== 'number' || typeof position.y !== 'number') {
    return { ok: false, error: 'Invalid position' }
  }

  if (edgeHiddenMode === 'manual' && edgeHiddenSide) {
    const badgeWindow =
      WINDOWS_NATIVE_SNAP_MODE && manualBadgeWindow && !manualBadgeWindow.isDestroyed() ? manualBadgeWindow : mainWindow
    const badgeBounds = badgeWindow.getBounds()
    const requestedBadge = {
      x: Math.round(position.x),
      y: Math.round(position.y),
      width: badgeBounds.width,
      height: badgeBounds.height,
    }
    const workArea = getWorkArea(requestedBadge)
    const nextSide = detectNearestHideSide(requestedBadge, workArea, { allowTop: true }) || edgeHiddenSide
    const baseExpanded =
      edgeExpandedBounds ||
      getExpandedBoundsForSide(
        {
          x: workArea.x,
          y: workArea.y,
          width: WINDOW_MIN_WIDTH,
          height: WINDOW_MIN_HEIGHT,
        },
        nextSide,
        workArea,
      )
    const expanded = getExpandedBoundsFromManualBadge(requestedBadge, nextSide, workArea, baseExpanded)
    const snappedBadge = getManualBadgeBoundsForSide(expanded, nextSide, workArea)

    edgeDockSide = nextSide
    edgeHiddenSide = nextSide
    edgeHiddenMode = 'manual'
    edgeExpandedBounds = cloneBounds(expanded)
    rememberStableDock(nextSide, edgeExpandedBounds)
    if (WINDOWS_NATIVE_SNAP_MODE && manualBadgeWindow && !manualBadgeWindow.isDestroyed()) {
      setMainWindowBoundsSilently(expanded)
      manualBadgeWindow.setBounds(snappedBadge, true)
    } else {
      setMainWindowBoundsSilently(snappedBadge)
    }
    emitEdgeState()
    return { ok: true }
  }

  withEdgeTrackingSuppressed(() => {
    mainWindow.setPosition(Math.round(position.x), Math.round(position.y))
  })
  refreshEdgeDockState('ipc:set-window-position')
  emitEdgeState()
  return { ok: true }
})

ipcMain.handle('todo:get-window-bounds', async () => {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return null
  }

  return mainWindow.getBounds()
})

ipcMain.handle('todo:set-window-bounds', async (_event, bounds) => {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return { ok: false, error: 'Window not ready' }
  }

  if (
    !bounds ||
    typeof bounds.x !== 'number' ||
    typeof bounds.y !== 'number' ||
    typeof bounds.width !== 'number' ||
    typeof bounds.height !== 'number'
  ) {
    return { ok: false, error: 'Invalid bounds' }
  }

  if (edgeHiddenSide) {
    expandFromEdgeHidden()
  }

  withEdgeTrackingSuppressed(() => {
    mainWindow.setBounds(
      {
        x: Math.round(bounds.x),
        y: Math.round(bounds.y),
        width: Math.round(bounds.width),
        height: Math.round(bounds.height),
      },
      true,
    )
  })
  refreshEdgeDockState('ipc:set-window-bounds')
  emitEdgeState()
  return { ok: true }
})

ipcMain.handle('todo:get-sync-config', async () => {
  return syncRuntime ? syncRuntime.getConfig() : { enabled: false, serverUrl: '', token: '' }
})

ipcMain.handle('todo:set-sync-config', async (_event, nextConfig) => {
  try {
    if (!syncRuntime) {
      return { enabled: false, serverUrl: '', token: '' }
    }

    const saved = await syncRuntime.setConfig(nextConfig)
    if (saved.enabled) {
      void syncRuntime.syncNow('config-save').catch(() => undefined)
    }
    return saved
  } catch (error) {
    return {
      enabled: false,
      serverUrl: '',
      token: '',
      error: error instanceof Error ? error.message : String(error),
    }
  }
})

ipcMain.handle('todo:get-sync-status', async () => {
  return syncRuntime
    ? syncRuntime.getStatus()
    : {
        enabled: false,
        phase: 'idle',
        lastSyncAt: null,
        lastPullAt: null,
        lastPushAt: null,
        lastError: null,
      }
})

ipcMain.handle('todo:sync-now', async () => {
  try {
    if (!syncRuntime) {
      return { ok: false, error: 'Sync runtime unavailable' }
    }

    const result = await syncRuntime.syncNow('manual')
    return { ok: true, result }
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    }
  }
})

app.whenReady().then(async () => {
  await ensureDataDir()
  stateCache = await readSnapshot()

  syncRuntime = createSyncRuntime({
    configFile: syncConfigFile,
    dataDir,
    readLocalState: async () => readSnapshot(),
    writeLocalState: async (nextState) => writeSnapshot(nextState),
    requestRendererFlush: () => requestRendererCloseFlush(CLOSE_FLUSH_WAIT_MS),
    notifyStatus: emitSyncStatus,
    notifyStateRefreshed: () => emitStateRefreshed(),
  })
  await syncRuntime.loadConfig()

  applyAutoLaunch(stateCache.settings.autoLaunch)

  await createMainWindow()
  emitSyncStatus(syncRuntime.getStatus())
  syncRuntime.scheduleSync('startup')

  app.on('activate', async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      await createMainWindow()
      emitSyncStatus(syncRuntime?.getStatus())
    }
  })
})

app.on('window-all-closed', () => {
  syncRuntime?.dispose()
  clearEdgeCollapseTimer()
  clearEdgeHoverPollTimer()
  if (process.platform !== 'darwin') {
    app.quit()
  }
})




