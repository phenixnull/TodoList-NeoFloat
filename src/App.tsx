import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent as ReactMouseEvent } from 'react'
import { closestCenter, DndContext, PointerSensor, type DragEndEvent, useSensor, useSensors } from '@dnd-kit/core'
import { arrayMove, SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { SettingsPanel } from './components/SettingsPanel'
import { SortableContextMenuItem } from './components/SortableContextMenuItem'
import { TaskCard } from './components/TaskCard'
import { normalizeContextMenuOrder, reorderContextMenuOrder, type ContextMenuItemId } from './lib/contextMenuOrder'
import {
  CONTEXT_MENU_FINISH_TEXT,
  CONTEXT_MENU_INSERT_AFTER_TEXT,
  CONTEXT_MENU_UNFINISH_TEXT,
} from './lib/contextMenuLabels'
import { DEFAULT_TASK_TAG, DEFAULT_TASK_TEXT_COLOR, TASK_TAG_PRESETS, normalizeTaskMeta } from './lib/taskMeta'
import { DEFAULT_TASK_TAG_BACKGROUND_COLOR } from './lib/taskMeta'
import { resolveHiddenArchiveRangeDefaults, shouldShowTaskInList, type HiddenTaskDateBasis } from './lib/taskVisibility'
import { useTaskStore } from './store/useTaskStore'
import { calcTaskDuration, calcCountdownRemaining, formatDuration, localDateTimeText } from './lib/time'
import type { SyncConfig, SyncStatus } from './types/sync'

function toDateInputText(date: Date): string {
  const yyyy = String(date.getFullYear())
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

type ContextMenuState = {
  taskId: string
  x: number
  y: number
}

type CustomColorMode = 'gradient' | 'solid'
type EdgeSide = 'left' | 'right' | 'top' | null
type EdgeMode = 'none' | 'auto' | 'manual'
type EdgeState = {
  hidden: boolean
  side: EdgeSide
  mode: EdgeMode
  manual: boolean
}

const DEFAULT_EDGE_STATE: EdgeState = {
  hidden: false,
  side: null,
  mode: 'none',
  manual: false,
}

const DEFAULT_SYNC_CONFIG: SyncConfig = {
  enabled: false,
  serverUrl: '',
  token: '',
}

const DEFAULT_SYNC_STATUS: SyncStatus = {
  enabled: false,
  phase: 'idle',
  lastSyncAt: null,
  lastPullAt: null,
  lastPushAt: null,
  lastError: null,
}

const TASK_COLOR_PRESETS: Array<{ id: string; label: string; value: string }> = [
  { id: 'aurora', label: '极光', value: 'linear-gradient(135deg, #22d3ee, #3b82f6, #8b5cf6)' },
  { id: 'sunset', label: '落日', value: 'linear-gradient(135deg, #f97316, #fb7185, #f43f5e)' },
  { id: 'mint', label: '薄荷', value: 'linear-gradient(135deg, #34d399, #14b8a6, #0ea5e9)' },
  { id: 'volcano', label: '火山', value: 'linear-gradient(135deg, #ef4444, #f97316, #f59e0b)' },
  { id: 'ocean', label: '深海', value: 'linear-gradient(135deg, #0ea5e9, #2563eb, #1d4ed8)' },
  { id: 'dusk', label: '暮色', value: 'linear-gradient(135deg, #6366f1, #8b5cf6, #ec4899)' },
  { id: 'forest', label: '森林', value: 'linear-gradient(135deg, #22c55e, #16a34a, #15803d)' },
]

const CONTEXT_MENU_ORDER_LABELS: Record<ContextMenuItemId, string> = {
  stats: '时间统计查看',
  'toggle-duration': '当前任务用时显示/隐藏',
  'toggle-all-durations': '全部任务用时显示/隐藏',
  'toggle-duration-layout': '当前任务用时布局切换',
  'set-inline-layout': '所有显示任务设为单行布局',
  'set-stacked-layout': '所有显示任务设为 2+1 布局',
  'insert-after': '在下方插入任务',
  'toggle-finish': '完成状态切换',
  'set-countdown': '倒计时设置',
  'toggle-archive': '归档操作',
  meta: '标签/进度/文字色',
  color: '任务配色',
  'show-archived': '显示隐藏任务',
  'hide-archived': '隐藏归档任务',
  delete: '永久删除',
}

function normalizeHexForPicker(value: string | undefined): string | null {
  if (!value) {
    return null
  }
  const hex = value.trim()
  if (!/^#[\da-f]{3,8}$/i.test(hex)) {
    return null
  }
  if (hex.length === 4) {
    const r = hex[1]
    const g = hex[2]
    const b = hex[3]
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase()
  }
  return hex.slice(0, 7).toLowerCase()
}

function buildTaskColorValue(mode: CustomColorMode, colorA: string, colorB: string, angle: number): string {
  if (mode === 'solid') {
    return colorA
  }
  const safeAngle = Math.max(0, Math.min(360, Math.round(angle)))
  return `linear-gradient(${safeAngle}deg, ${colorA}, ${colorB})`
}

function parseTaskColorValue(value: string | null): { mode: CustomColorMode; colorA: string; colorB: string; angle: number } | null {
  if (!value) {
    return null
  }

  const gradientAngleMatch = value.match(/linear-gradient\(\s*([0-9.]+)deg/i)
  if (gradientAngleMatch) {
    const angle = Number(gradientAngleMatch[1])
    const hexes = value.match(/#[\da-f]{3,8}/gi) ?? []
    const colorA = normalizeHexForPicker(hexes[0])
    const colorB = normalizeHexForPicker(hexes[1] ?? hexes[0])
    if (!colorA || !colorB) {
      return null
    }
    return {
      mode: 'gradient',
      colorA,
      colorB,
      angle: Number.isFinite(angle) ? angle : 132,
    }
  }

  const solidHex = normalizeHexForPicker(value)
  if (!solidHex) {
    return null
  }
  return {
    mode: 'solid',
    colorA: solidHex,
    colorB: '#8b5cf6',
    angle: 132,
  }
}

function App() {
  const tasks = useTaskStore((state) => state.tasks)
  const settings = useTaskStore((state) => state.settings)
  const hydrated = useTaskStore((state) => state.hydrated)
  const persistError = useTaskStore((state) => state.persistError)

  const hydrate = useTaskStore((state) => state.hydrate)
  const clearPersistError = useTaskStore((state) => state.clearPersistError)
  const addTask = useTaskStore((state) => state.addTask)
  const insertTaskAfter = useTaskStore((state) => state.insertTaskAfter)
  const insertTaskImage = useTaskStore((state) => state.insertTaskImage)
  const updateTaskContent = useTaskStore((state) => state.updateTaskContent)
  const updateTaskMeta = useTaskStore((state) => state.updateTaskMeta)
  const setTaskPresetColor = useTaskStore((state) => state.setTaskPresetColor)
  const setTaskCustomColor = useTaskStore((state) => state.setTaskCustomColor)
  const clearTaskColor = useTaskStore((state) => state.clearTaskColor)
  const toggleTaskDurationVisibility = useTaskStore((state) => state.toggleTaskDurationVisibility)
  const setAllTaskDurationVisibility = useTaskStore((state) => state.setAllTaskDurationVisibility)
  const setTaskDurationLayoutMode = useTaskStore((state) => state.setTaskDurationLayoutMode)
  const setTasksDurationLayoutMode = useTaskStore((state) => state.setTasksDurationLayoutMode)
  const archiveAndHideTask = useTaskStore((state) => state.archiveAndHideTask)
  const showHiddenTasks = useTaskStore((state) => state.showHiddenTasks)
  const hideArchivedTasks = useTaskStore((state) => state.hideArchivedTasks)
  const toggleStartPause = useTaskStore((state) => state.toggleStartPause)
  const finishTask = useTaskStore((state) => state.finishTask)
  const unfinishTask = useTaskStore((state) => state.unfinishTask)
  const setTaskCountdown = useTaskStore((state) => state.setTaskCountdown)
  const clearTaskCountdown = useTaskStore((state) => state.clearTaskCountdown)
  const endTaskCountdown = useTaskStore((state) => state.endTaskCountdown)
  const archiveTask = useTaskStore((state) => state.archiveTask)
  const unarchiveTask = useTaskStore((state) => state.unarchiveTask)
  const deleteTask = useTaskStore((state) => state.deleteTask)
  const reorderTasks = useTaskStore((state) => state.reorderTasks)
  const flushPendingContent = useTaskStore((state) => state.flushPendingContent)
  const updateSettings = useTaskStore((state) => state.updateSettings)

  const [showSettings, setShowSettings] = useState(false)
  const [nowMs, setNowMs] = useState(() => Date.now())
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null)
  const [statsTaskId, setStatsTaskId] = useState<string | null>(null)
  const [archiveSubmenuOpen, setArchiveSubmenuOpen] = useState(false)
  const [hideArchiveSubmenuOpen, setHideArchiveSubmenuOpen] = useState(false)
  const [metaSubmenuOpen, setMetaSubmenuOpen] = useState(false)
  const [colorSubmenuOpen, setColorSubmenuOpen] = useState(false)
  const [countdownSubmenuOpen, setCountdownSubmenuOpen] = useState(false)
  const [countdownHoursInput, setCountdownHoursInput] = useState('0')
  const [countdownMinutesInput, setCountdownMinutesInput] = useState('30')
  const [countdownSecondsInput, setCountdownSecondsInput] = useState('0')
  const [archiveStartInput, setArchiveStartInput] = useState('')
  const [archiveEndInput, setArchiveEndInput] = useState('')
  const [archiveDateBasis, setArchiveDateBasis] = useState<HiddenTaskDateBasis>('archived')
  const [hideArchiveStartInput, setHideArchiveStartInput] = useState('')
  const [hideArchiveEndInput, setHideArchiveEndInput] = useState('')
  const [metaTagInput, setMetaTagInput] = useState(DEFAULT_TASK_TAG)
  const [metaCustomTagEditing, setMetaCustomTagEditing] = useState(false)
  const [metaCustomTagDraft, setMetaCustomTagDraft] = useState('')
  const [metaProgressCurrentInput, setMetaProgressCurrentInput] = useState('')
  const [metaProgressTotalInput, setMetaProgressTotalInput] = useState('')
  const [metaTagBackgroundColorInput, setMetaTagBackgroundColorInput] = useState(DEFAULT_TASK_TAG_BACKGROUND_COLOR)
  const [metaTextColorInput, setMetaTextColorInput] = useState(DEFAULT_TASK_TEXT_COLOR)
  const [customColorMode, setCustomColorMode] = useState<CustomColorMode>('gradient')
  const [customColorA, setCustomColorA] = useState('#22d3ee')
  const [customColorB, setCustomColorB] = useState('#8b5cf6')
  const [customColorAngle, setCustomColorAngle] = useState(132)
  const [contextMenuPosition, setContextMenuPosition] = useState({ left: 8, top: 8 })
  const [edgeState, setEdgeState] = useState<EdgeState>(DEFAULT_EDGE_STATE)
  const [syncConfig, setSyncConfig] = useState<SyncConfig>(DEFAULT_SYNC_CONFIG)
  const [syncStatus, setSyncStatus] = useState<SyncStatus>(DEFAULT_SYNC_STATUS)
  const [syncActionBusy, setSyncActionBusy] = useState(false)
  const [layoutPulse, setLayoutPulse] = useState(0)
  const contextMenuRef = useRef<HTMLDivElement | null>(null)
  const metaCustomTagInputRef = useRef<HTMLInputElement | null>(null)
  const manualBadgeDragRef = useRef({
    active: false,
    moved: false,
    startMouseX: 0,
    startMouseY: 0,
    startWindowX: 0,
    startWindowY: 0,
  })
  const suppressManualBadgeClickRef = useRef(false)

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))
  const contextMenuSensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 10 } }))

  const orderedTasks = useMemo(() => [...tasks].sort((a, b) => a.order - b.order), [tasks])
  const todayDate = useMemo(() => toDateInputText(new Date(nowMs)), [nowMs])
  const visibleTasks = useMemo(() => {
    return orderedTasks.filter((task) => shouldShowTaskInList(task))
  }, [orderedTasks])
  const visibleTaskIds = useMemo(() => visibleTasks.map((task) => task.id), [visibleTasks])
  const contextMenuOrder = useMemo(() => normalizeContextMenuOrder(settings.contextMenuOrder), [settings.contextMenuOrder])
  const contextTask = useMemo(
    () => (contextMenu ? tasks.find((task) => task.id === contextMenu.taskId) ?? null : null),
    [contextMenu, tasks],
  )
  const allTaskDurationsHidden = useMemo(
    () => tasks.length > 0 && tasks.every((task) => task.showDuration === false),
    [tasks],
  )
  const statsTask = useMemo(() => tasks.find((task) => task.id === statsTaskId) ?? null, [tasks, statsTaskId])
  const titleNow = useMemo(() => {
    const now = new Date(nowMs)
    const yyyy = String(now.getFullYear())
    const mm = String(now.getMonth() + 1).padStart(2, '0')
    const dd = String(now.getDate()).padStart(2, '0')
    const hh = String(now.getHours()).padStart(2, '0')
    const min = String(now.getMinutes()).padStart(2, '0')
    const ss = String(now.getSeconds()).padStart(2, '0')
    return {
      date: `${yyyy}-${mm}-${dd}`,
      time: `${hh}:${min}:${ss}`,
    }
  }, [nowMs])

  const resolveArchiveRangeDefaults = () => {
    return resolveHiddenArchiveRangeDefaults({
      todayDate,
      currentStart: archiveStartInput,
      currentEnd: archiveEndInput,
    })
  }

  useEffect(() => {
    void hydrate()
  }, [hydrate])

  useEffect(() => {
    let cancelled = false
    const api = window.todoAPI

    if (!api) {
      return
    }

    void Promise.all([api.getSyncConfig(), api.getSyncStatus()])
      .then(([config, status]) => {
        if (cancelled) {
          return
        }

        setSyncConfig({
          enabled: Boolean(config.enabled),
          serverUrl: config.serverUrl ?? '',
          token: config.token ?? '',
        })
        setSyncStatus(status)
      })
      .catch(() => undefined)

    const unbindStatus = api.onSyncStatus((status) => {
      if (!cancelled) {
        setSyncStatus(status)
      }
    })

    const unbindRefresh = api.onStateRefreshed(() => {
      if (cancelled) {
        return
      }

      void hydrate().catch(() => undefined)
    })

    return () => {
      cancelled = true
      if (unbindStatus) {
        unbindStatus()
      }
      if (unbindRefresh) {
        unbindRefresh()
      }
    }
  }, [hydrate])

  useEffect(() => {
    const timer = setInterval(() => {
      const now = Date.now()
      setNowMs(now)

      // Check for countdown expiration on active tasks
      const currentTasks = useTaskStore.getState().tasks
      for (const task of currentTasks) {
        if (task.status === 'doing' && task.countdownTargetMs !== null && task.countdownTargetMs > 0) {
          const remaining = calcCountdownRemaining(task, now)
          if (remaining !== null && remaining <= 0) {
            endTaskCountdown(task.id)
          }
        }
      }
    }, 1000)

    return () => clearInterval(timer)
  }, [endTaskCountdown])

  useEffect(() => {
    const blurActiveElement = () => {
      const activeElement = document.activeElement
      if (activeElement instanceof HTMLElement) {
        activeElement.blur()
      }
    }

    window.addEventListener('blur', blurActiveElement)
    return () => window.removeEventListener('blur', blurActiveElement)
  }, [])

  useEffect(() => {
    const unbind = window.todoAPI?.onPersistError((message) => {
      console.error(message)
    })

    return () => {
      if (unbind) {
        unbind()
      }
    }
  }, [])

  useEffect(() => {
    const unbind = window.todoAPI?.onBeforeCloseFlush(async () => {
      await flushPendingContent()
    })

    return () => {
      if (unbind) {
        unbind()
      }
    }
  }, [flushPendingContent])

  useEffect(() => {
    let cancelled = false

    void window.todoAPI?.getEdgeState().then((state) => {
      if (!cancelled && state) {
        setEdgeState(state)
      }
    })

    const unbind = window.todoAPI?.onEdgeState((state) => {
      if (!cancelled && state) {
        setEdgeState(state)
      }
    })

    return () => {
      cancelled = true
      if (unbind) {
        unbind()
      }
    }
  }, [])

  useEffect(() => {
    if (!contextMenu) {
      return
    }

    const onPointerDown = (event: PointerEvent) => {
      const menuEl = contextMenuRef.current
      const target = event.target
      if (menuEl && target instanceof Node && menuEl.contains(target)) {
        return
      }
      closeContextMenu()
    }
    const onScroll = (event: Event) => {
      const menuEl = contextMenuRef.current
      const target = event.target
      if (menuEl && target instanceof Node && menuEl.contains(target)) {
        return
      }
      closeContextMenu()
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeContextMenu()
      }
    }

    document.addEventListener('pointerdown', onPointerDown, true)
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('keydown', onKeyDown)

    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true)
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [contextMenu])

  useLayoutEffect(() => {
    if (!contextMenu) {
      return
    }

    const applyPosition = () => {
      const menuEl = contextMenuRef.current
      if (!menuEl) {
        return
      }
      const rect = menuEl.getBoundingClientRect()
      const left = Math.max(8, Math.min(contextMenu.x, window.innerWidth - rect.width - 8))
      const top = Math.max(8, Math.min(contextMenu.y, window.innerHeight - rect.height - 8))
      setContextMenuPosition((prev) => (prev.left === left && prev.top === top ? prev : { left, top }))
    }

    const raf = requestAnimationFrame(applyPosition)
    window.addEventListener('resize', applyPosition)

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', applyPosition)
    }
  }, [contextMenu, archiveSubmenuOpen, hideArchiveSubmenuOpen, metaSubmenuOpen, colorSubmenuOpen, countdownSubmenuOpen, customColorMode])

  // 持续调整直到稳定
  useEffect(() => {
    if (layoutPulse <= 0) {
      return
    }

    let stabilityCheckTimer: ReturnType<typeof setTimeout> | null = null
    const MAX_PULSE_ATTEMPTS = 8
    const STABILITY_CHECK_INTERVAL = 150 // ms

    if (layoutPulse < MAX_PULSE_ATTEMPTS) {
      stabilityCheckTimer = setTimeout(() => {
        setLayoutPulse((value) => value + 1)
      }, STABILITY_CHECK_INTERVAL)
    }

    return () => {
      if (stabilityCheckTimer !== null) {
        clearTimeout(stabilityCheckTimer)
      }
    }
  }, [layoutPulse])

  useEffect(() => {
    const minWidth = 360
    const minHeight = 110
    const RESIZING_CLASS = 'is-window-resizing'

    let resizing = false
    let expandedDuringResize = false
    let direction = ''
    let startMouseX = 0
    let startMouseY = 0
    let startBounds = { x: 0, y: 0, width: 0, height: 0 }
    let rafPending = false
    let nextBounds = startBounds
    const triggerAllCardsReflow = () => {
      setLayoutPulse((value) => value + 1)
    }

    const clearSelection = () => {
      const selection = window.getSelection()
      if (selection && selection.rangeCount > 0) {
        selection.removeAllRanges()
      }
    }
    const setResizeInteractionLock = (active: boolean) => {
      document.documentElement.classList.toggle(RESIZING_CLASS, active)
      document.body.classList.toggle(RESIZING_CLASS, active)
      if (!active) {
        clearSelection()
      }
    }

    const applyBounds = () => {
      rafPending = false
      if (!resizing) {
        return
      }
      void window.todoAPI?.setWindowBounds(nextBounds)
    }

    const onMouseDown = async (event: MouseEvent) => {
      if (event.button !== 0) {
        return
      }

      const handle = (event.target as HTMLElement | null)?.closest<HTMLElement>('.resize-handle')
      if (!handle) {
        return
      }

      // Must run before async work; otherwise browser default text selection can start.
      event.preventDefault()
      event.stopPropagation()
      clearSelection()

      const dir = handle.dataset.resizeDir
      const bounds = await window.todoAPI?.getWindowBounds()
      if (!dir || !bounds) {
        return
      }

      resizing = true
      expandedDuringResize = false
      setResizeInteractionLock(true)
      direction = dir
      startMouseX = event.screenX
      startMouseY = event.screenY
      startBounds = bounds
      nextBounds = bounds
    }

    const onMouseMove = (event: MouseEvent) => {
      if (!resizing) {
        return
      }
      event.preventDefault()
      clearSelection()

      const dx = event.screenX - startMouseX
      const dy = event.screenY - startMouseY

      let x = startBounds.x
      let y = startBounds.y
      let width = startBounds.width
      let height = startBounds.height

      if (direction.includes('e')) {
        width = startBounds.width + dx
      }
      if (direction.includes('s')) {
        height = startBounds.height + dy
      }
      if (direction.includes('w')) {
        width = startBounds.width - dx
        x = startBounds.x + dx
      }
      if (direction.includes('n')) {
        height = startBounds.height - dy
        y = startBounds.y + dy
      }

      if (width < minWidth) {
        if (direction.includes('w')) {
          x = startBounds.x + (startBounds.width - minWidth)
        }
        width = minWidth
      }

      if (height < minHeight) {
        if (direction.includes('n')) {
          y = startBounds.y + (startBounds.height - minHeight)
        }
        height = minHeight
      }

      nextBounds = { x, y, width, height }
      if (width > startBounds.width + 0.5) {
        expandedDuringResize = true
      }

      if (!rafPending) {
        rafPending = true
        requestAnimationFrame(applyBounds)
      }
    }

    const onMouseUp = () => {
      if (!resizing) {
        return
      }
      const widthChanged = Math.abs(nextBounds.width - startBounds.width) > 0.5
      const shouldPulse = expandedDuringResize || widthChanged
      void window.todoAPI?.setWindowBounds(nextBounds)
      resizing = false
      rafPending = false
      direction = ''
      expandedDuringResize = false
      setResizeInteractionLock(false)
      if (shouldPulse) {
        requestAnimationFrame(triggerAllCardsReflow)
      }
    }

    window.addEventListener('mousedown', onMouseDown)
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
    window.addEventListener('blur', onMouseUp)

    return () => {
      window.removeEventListener('mousedown', onMouseDown)
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
      window.removeEventListener('blur', onMouseUp)
      setResizeInteractionLock(false)
    }
  }, [])

  useEffect(() => {
    const onMouseMove = (event: MouseEvent) => {
      const drag = manualBadgeDragRef.current
      if (!drag.active) {
        return
      }

      const dx = event.screenX - drag.startMouseX
      const dy = event.screenY - drag.startMouseY

      if (!drag.moved && (Math.abs(dx) > 1 || Math.abs(dy) > 1)) {
        drag.moved = true
        suppressManualBadgeClickRef.current = true
      }

      void window.todoAPI?.setWindowPosition({
        x: Math.round(drag.startWindowX + dx),
        y: Math.round(drag.startWindowY + dy),
      })
    }

    const stopDrag = () => {
      const drag = manualBadgeDragRef.current
      if (!drag.active) {
        return
      }
      drag.active = false
      if (drag.moved) {
        suppressManualBadgeClickRef.current = true
      }
    }

    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', stopDrag)
    window.addEventListener('blur', stopDrag)

    return () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', stopDrag)
      window.removeEventListener('blur', stopDrag)
    }
  }, [])

  const onDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) {
      return
    }

    const from = visibleTasks.findIndex((task) => task.id === active.id)
    const to = visibleTasks.findIndex((task) => task.id === over.id)
    if (from < 0 || to < 0) {
      return
    }

    const moved = arrayMove(visibleTasks.map((task) => task.id), from, to)
    reorderTasks(moved)
  }

  const onContextMenuDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) {
      return
    }

    const nextOrder = reorderContextMenuOrder({
      order: contextMenuOrder,
      activeId: String(active.id),
      overId: String(over.id),
    })

    if (nextOrder.every((entry, index) => entry === contextMenuOrder[index])) {
      return
    }

    updateSettings({ contextMenuOrder: nextOrder })
  }

  const customColorPreview = useMemo(
    () => buildTaskColorValue(customColorMode, customColorA, customColorB, customColorAngle),
    [customColorMode, customColorA, customColorB, customColorAngle],
  )
  const metaHasPresetTag = useMemo(() => TASK_TAG_PRESETS.some((preset) => preset === metaTagInput), [metaTagInput])
  const metaCustomTagPreset = useMemo(() => (metaTagInput.trim() && !metaHasPresetTag ? metaTagInput : null), [metaHasPresetTag, metaTagInput])

  useEffect(() => {
    if (!contextTask) {
      setMetaTagInput(DEFAULT_TASK_TAG)
      setMetaCustomTagEditing(false)
      setMetaCustomTagDraft('')
      setMetaProgressCurrentInput('')
      setMetaProgressTotalInput('')
      setMetaTagBackgroundColorInput(DEFAULT_TASK_TAG_BACKGROUND_COLOR)
      setMetaTextColorInput(DEFAULT_TASK_TEXT_COLOR)
      return
    }

    const normalizedMeta = normalizeTaskMeta(contextTask.meta)
    setMetaTagInput(normalizedMeta.tagText)
    setMetaCustomTagEditing(false)
    setMetaCustomTagDraft('')
    setMetaProgressCurrentInput(normalizedMeta.progressCurrent === null ? '' : String(normalizedMeta.progressCurrent))
    setMetaProgressTotalInput(normalizedMeta.progressTotal === null ? '' : String(normalizedMeta.progressTotal))
    setMetaTagBackgroundColorInput(normalizedMeta.tagBackgroundColor ?? DEFAULT_TASK_TAG_BACKGROUND_COLOR)
    setMetaTextColorInput(normalizedMeta.textColor ?? DEFAULT_TASK_TEXT_COLOR)
  }, [contextTask])

  useEffect(() => {
    if (!metaCustomTagEditing) {
      return
    }

    const raf = requestAnimationFrame(() => {
      metaCustomTagInputRef.current?.focus()
      metaCustomTagInputRef.current?.select()
    })

    return () => cancelAnimationFrame(raf)
  }, [metaCustomTagEditing])

  const toggleArchiveSubmenu = () => {
    const nextOpen = !archiveSubmenuOpen
    setHideArchiveSubmenuOpen(false)
    setMetaSubmenuOpen(false)
    setColorSubmenuOpen(false)
    setCountdownSubmenuOpen(false)
    if (nextOpen) {
      const defaults = resolveArchiveRangeDefaults()
      setArchiveStartInput(defaults.start)
      setArchiveEndInput(defaults.end)
      setArchiveDateBasis('archived')
    }
    setArchiveSubmenuOpen(nextOpen)
  }

  const toggleHideArchiveSubmenu = () => {
    const nextOpen = !hideArchiveSubmenuOpen
    setArchiveSubmenuOpen(false)
    setMetaSubmenuOpen(false)
    setColorSubmenuOpen(false)
    setCountdownSubmenuOpen(false)
    if (nextOpen) {
      const defaults = resolveHiddenArchiveRangeDefaults({
        todayDate,
        currentStart: hideArchiveStartInput,
        currentEnd: hideArchiveEndInput,
      })
      setHideArchiveStartInput(defaults.start)
      setHideArchiveEndInput(defaults.end)
    }
    setHideArchiveSubmenuOpen(nextOpen)
  }

  const toggleMetaSubmenu = () => {
    const nextOpen = !metaSubmenuOpen
    setArchiveSubmenuOpen(false)
    setHideArchiveSubmenuOpen(false)
    setColorSubmenuOpen(false)
    setCountdownSubmenuOpen(false)
    if (!nextOpen) {
      setMetaCustomTagEditing(false)
      setMetaCustomTagDraft('')
    }
    setMetaSubmenuOpen(nextOpen)
  }

  const toggleColorSubmenu = () => {
    const nextOpen = !colorSubmenuOpen
    setArchiveSubmenuOpen(false)
    setHideArchiveSubmenuOpen(false)
    setMetaSubmenuOpen(false)
    setMetaCustomTagEditing(false)
    setMetaCustomTagDraft('')
    setCountdownSubmenuOpen(false)
    if (nextOpen && contextTask) {
      const parsed = parseTaskColorValue(contextTask.colorValue)
      if (parsed) {
        setCustomColorMode(parsed.mode)
        setCustomColorA(parsed.colorA)
        setCustomColorB(parsed.colorB)
        setCustomColorAngle(parsed.angle)
      }
    }
    setColorSubmenuOpen(nextOpen)
  }

  const toggleCountdownSubmenu = () => {
    const nextOpen = !countdownSubmenuOpen
    setArchiveSubmenuOpen(false)
    setHideArchiveSubmenuOpen(false)
    setMetaSubmenuOpen(false)
    setColorSubmenuOpen(false)
    setMetaCustomTagEditing(false)
    setMetaCustomTagDraft('')
    if (nextOpen) {
      setCountdownHoursInput('0')
      setCountdownMinutesInput('30')
      setCountdownSecondsInput('0')
    }
    setCountdownSubmenuOpen(nextOpen)
  }

  const commitCustomTagDraft = () => {
    const normalizedTag = Array.from(metaCustomTagDraft.trim()).slice(0, 2).join('')
    setMetaCustomTagEditing(false)

    if (!normalizedTag) {
      setMetaCustomTagDraft('')
      return
    }

    setMetaTagInput(normalizedTag)
    setMetaCustomTagDraft('')
  }

  const applyTaskMeta = () => {
    if (!contextTask) {
      return
    }

    updateTaskMeta(contextTask.id, {
      tagText: metaTagInput,
      progressCurrent: metaProgressCurrentInput === '' ? null : Number(metaProgressCurrentInput),
      progressTotal: metaProgressTotalInput === '' ? null : Number(metaProgressTotalInput),
      tagBackgroundColor: metaTagBackgroundColorInput,
      textColor: metaTextColorInput,
    })
    closeContextMenu()
  }

  const applyPresetColor = (colorValue: string) => {
    if (!contextTask) {
      return
    }
    setTaskPresetColor(contextTask.id, colorValue)
    closeContextMenu()
  }

  const applyCustomColor = () => {
    if (!contextTask) {
      return
    }
    setTaskCustomColor(contextTask.id, customColorPreview)
    closeContextMenu()
  }

  const resetTaskColor = () => {
    if (!contextTask) {
      return
    }
    clearTaskColor(contextTask.id)
    closeContextMenu()
  }

  function closeContextMenu() {
    setContextMenu(null)
    setArchiveSubmenuOpen(false)
    setHideArchiveSubmenuOpen(false)
    setMetaSubmenuOpen(false)
    setColorSubmenuOpen(false)
    setCountdownSubmenuOpen(false)
    setArchiveStartInput('')
    setArchiveEndInput('')
    setArchiveDateBasis('archived')
    setHideArchiveStartInput('')
    setHideArchiveEndInput('')
    setMetaTagInput(DEFAULT_TASK_TAG)
    setMetaCustomTagEditing(false)
    setMetaCustomTagDraft('')
    setMetaProgressCurrentInput('')
    setMetaProgressTotalInput('')
    setMetaTagBackgroundColorInput(DEFAULT_TASK_TAG_BACKGROUND_COLOR)
    setMetaTextColorInput(DEFAULT_TASK_TEXT_COLOR)
  }

  const applyArchivedAll = () => {
    showHiddenTasks({ mode: 'all' })
    closeContextMenu()
  }

  const applyArchivedRange = () => {
    const { start, end } = resolveArchiveRangeDefaults()
    showHiddenTasks({ mode: 'range', start, end, basis: archiveDateBasis })
    closeContextMenu()
  }

  const applyHideArchivedAll = () => {
    hideArchivedTasks({ mode: 'all' })
    closeContextMenu()
  }

  const applyHideArchivedRange = () => {
    const { start, end } = resolveHiddenArchiveRangeDefaults({
      todayDate,
      currentStart: hideArchiveStartInput,
      currentEnd: hideArchiveEndInput,
    })

    hideArchivedTasks({ mode: 'range', start, end })
    closeContextMenu()
  }

  const renderContextMenuItemContent = (itemId: ContextMenuItemId) => {
    if (!contextTask) {
      return null
    }

    switch (itemId) {
      case 'stats':
        return (
          <button
            key={itemId}
            type="button"
            onClick={() => {
              setStatsTaskId(contextTask.id)
              closeContextMenu()
            }}
          >
            📊 时间统计查看
          </button>
        )
      case 'toggle-duration':
        return (
          <button
            key={itemId}
            type="button"
            onClick={() => {
              toggleTaskDurationVisibility(contextTask.id)
              setLayoutPulse((value) => value + 1)
              closeContextMenu()
            }}
          >
            {contextTask.showDuration === false ? '🕒 显示用时（当前隐藏）' : '🙈 隐藏用时（当前显示）'}
          </button>
        )
      case 'toggle-all-durations':
        return (
          <button
            key={itemId}
            type="button"
            onClick={() => {
              setAllTaskDurationVisibility(allTaskDurationsHidden)
              setLayoutPulse((value) => value + 1)
              closeContextMenu()
            }}
          >
            {allTaskDurationsHidden ? '🕒 显示（全部）用时' : '🙈 隐藏（全部）用时'}
          </button>
        )
      case 'toggle-duration-layout':
        return (
          <button
            key={itemId}
            type="button"
            onClick={() => {
              setTaskDurationLayoutMode(contextTask.id, contextTask.durationLayoutMode === 'inline' ? 'stacked' : 'inline')
              setLayoutPulse((value) => value + 1)
              closeContextMenu()
            }}
          >
            {contextTask.durationLayoutMode === 'inline' ? '↕️ 切换为 2+1 用时布局' : '↔️ 切换为单行用时布局'}
          </button>
        )
      case 'set-inline-layout':
        return (
          <button
            key={itemId}
            type="button"
            onClick={() => {
              setTasksDurationLayoutMode(visibleTaskIds, 'inline')
              setLayoutPulse((value) => value + 1)
              closeContextMenu()
            }}
          >
            ↔️ 所有显示任务设为单行布局
          </button>
        )
      case 'set-stacked-layout':
        return (
          <button
            key={itemId}
            type="button"
            onClick={() => {
              setTasksDurationLayoutMode(visibleTaskIds, 'stacked')
              setLayoutPulse((value) => value + 1)
              closeContextMenu()
            }}
          >
            ↕️ 所有显示任务设为 2+1 布局
          </button>
        )
      case 'insert-after':
        return (
          <button
            key={itemId}
            type="button"
            onClick={() => {
              insertTaskAfter(contextTask.id)
              closeContextMenu()
            }}
          >
            {CONTEXT_MENU_INSERT_AFTER_TEXT}
          </button>
        )
      case 'toggle-finish':
        return contextTask.status === 'finished' ? (
          <button
            key={itemId}
            type="button"
            onClick={() => {
              unfinishTask(contextTask.id)
              closeContextMenu()
            }}
          >
            {CONTEXT_MENU_UNFINISH_TEXT}
          </button>
        ) : (
          <button
            key={itemId}
            type="button"
            onClick={() => {
              finishTask(contextTask.id)
              closeContextMenu()
            }}
          >
            {CONTEXT_MENU_FINISH_TEXT}
          </button>
        )
      case 'set-countdown': {
        const hasCountdown = contextTask.countdownTargetMs !== null
        const isCountdownEnded = contextTask.status === 'countdown-ended'
        const remaining = calcCountdownRemaining(contextTask, nowMs)
        const remainingText = remaining !== null ? formatDuration(remaining) : null

        return (
          <section key={itemId} className="menu-layer">
            <button type="button" className="submenu-trigger" onClick={toggleCountdownSubmenu}>
              ⏳ 倒计时 {hasCountdown ? `(${isCountdownEnded ? '已结束' : remainingText})` : ''} {countdownSubmenuOpen ? '▾' : '▸'}
            </button>

            {countdownSubmenuOpen ? (
              <div className="submenu-panel countdown-submenu-panel">
                {hasCountdown ? (
                  <>
                    <div className="submenu-note">
                      {isCountdownEnded
                        ? '倒计时已结束'
                        : `剩余: ${remainingText}`}
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        clearTaskCountdown(contextTask.id)
                        closeContextMenu()
                      }}
                    >
                      ❌ 取消倒计时
                    </button>
                  </>
                ) : (
                  <>
                    <div className="submenu-note">设置倒计时时长（从当前累计时间开始）</div>
                    <div className="countdown-input-grid">
                      <label className="countdown-field">
                        时
                        <input
                          type="number"
                          min={0}
                          step={1}
                          value={countdownHoursInput}
                          onChange={(event) => setCountdownHoursInput(event.target.value)}
                        />
                      </label>
                      <label className="countdown-field">
                        分
                        <input
                          type="number"
                          min={0}
                          max={59}
                          step={1}
                          value={countdownMinutesInput}
                          onChange={(event) => setCountdownMinutesInput(event.target.value)}
                        />
                      </label>
                      <label className="countdown-field">
                        秒
                        <input
                          type="number"
                          min={0}
                          max={59}
                          step={1}
                          value={countdownSecondsInput}
                          onChange={(event) => setCountdownSecondsInput(event.target.value)}
                        />
                      </label>
                    </div>
                    <div className="color-action-row">
                      <button
                        type="button"
                        onClick={() => {
                          const hours = Math.max(0, parseInt(countdownHoursInput, 10) || 0)
                          const minutes = Math.max(0, parseInt(countdownMinutesInput, 10) || 0)
                          const seconds = Math.max(0, parseInt(countdownSecondsInput, 10) || 0)
                          const totalMs = (hours * 3600 + minutes * 60 + seconds) * 1000
                          if (totalMs <= 0) {
                            return
                          }
                          setTaskCountdown(contextTask.id, totalMs)
                          closeContextMenu()
                        }}
                      >
                        ⏳ 开始倒计时
                      </button>
                    </div>
                  </>
                )}
              </div>
            ) : null}
          </section>
        )
      }
      case 'toggle-archive':
        return (
          <section key={itemId} className="menu-layer">
            <button
              type="button"
              onClick={() => {
                if (contextTask.archived) {
                  unarchiveTask(contextTask.id)
                } else {
                  archiveTask(contextTask.id)
                }
                closeContextMenu()
              }}
            >
              {contextTask.archived ? '📤 取消归档' : '🗂️ 归档'}
            </button>

            <button
              type="button"
              onClick={() => {
                archiveAndHideTask(contextTask.id)
                closeContextMenu()
              }}
            >
              {contextTask.archived ? '🙈 隐藏（已归档）' : '📥 归档 + 隐藏'}
            </button>
          </section>
        )
      case 'meta':
        return (
          <section key={itemId} className="menu-layer">
            <button type="button" className="submenu-trigger" onClick={toggleMetaSubmenu}>
              🧩 标签/进度/文字色 {metaSubmenuOpen ? '▾' : '▸'}
            </button>

            {metaSubmenuOpen ? (
              <div className="submenu-panel meta-submenu-panel">
                <div className="submenu-note">左侧标签默认两字，可直接选默认项或手填。</div>

                <div className="meta-preset-grid">
                  {TASK_TAG_PRESETS.map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      className={metaTagInput === preset ? 'is-active' : ''}
                      onClick={() => setMetaTagInput(preset)}
                    >
                      {preset}
                    </button>
                  ))}

                  {metaCustomTagPreset ? (
                    <button
                      type="button"
                      className={`meta-preset-custom${metaTagInput === metaCustomTagPreset ? ' is-active' : ''}`}
                      onClick={() => setMetaTagInput(metaCustomTagPreset)}
                    >
                      {metaCustomTagPreset}
                    </button>
                  ) : null}

                  {metaCustomTagEditing ? (
                    <input
                      ref={metaCustomTagInputRef}
                      type="text"
                      className="meta-preset-input"
                      value={metaCustomTagDraft}
                      maxLength={4}
                      onChange={(event) => setMetaCustomTagDraft(Array.from(event.target.value.trimStart()).slice(0, 2).join(''))}
                      onBlur={commitCustomTagDraft}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          event.preventDefault()
                          commitCustomTagDraft()
                          return
                        }

                        if (event.key === 'Escape') {
                          setMetaCustomTagEditing(false)
                          setMetaCustomTagDraft('')
                        }
                      }}
                      placeholder="新标签"
                    />
                  ) : (
                    <button
                      type="button"
                      className="meta-preset-add-btn"
                      aria-label="新增标签"
                      onClick={() => {
                        setMetaCustomTagDraft('')
                        setMetaCustomTagEditing(true)
                      }}
                    >
                      +
                    </button>
                  )}
                </div>

                <label className="meta-field">
                  标签
                  <input
                    type="text"
                    value={metaTagInput}
                    maxLength={4}
                    onChange={(event) => setMetaTagInput(Array.from(event.target.value.trimStart()).slice(0, 2).join(''))}
                    placeholder="两字标签"
                  />
                </label>

                <div className="meta-field-grid">
                  <label className="meta-field">
                    进度分子
                    <input
                      type="number"
                      min={0}
                      step={1}
                      value={metaProgressCurrentInput}
                      onChange={(event) => setMetaProgressCurrentInput(event.target.value)}
                      placeholder="例如 16"
                    />
                  </label>

                  <label className="meta-field">
                    进度分母
                    <input
                      type="number"
                      min={0}
                      step={1}
                      value={metaProgressTotalInput}
                      onChange={(event) => setMetaProgressTotalInput(event.target.value)}
                      placeholder="例如 130"
                    />
                  </label>
                </div>

                <div className="meta-color-grid">
                  <div className="meta-color-field">
                    <span className="meta-color-title">标签底色</span>
                    <div className="meta-color-control">
                      <label className="meta-color-swatch-trigger" title="选择标签底色">
                        <span className="meta-color-swatch" style={{ backgroundColor: metaTagBackgroundColorInput }} aria-hidden />
                        <input
                          type="color"
                          value={metaTagBackgroundColorInput}
                          onChange={(event) => setMetaTagBackgroundColorInput(event.target.value)}
                          aria-label="标签底色"
                        />
                      </label>
                      <span className="meta-color-code">{metaTagBackgroundColorInput.toUpperCase()}</span>
                    </div>
                  </div>

                  <div className="meta-color-field">
                    <span className="meta-color-title">文字颜色</span>
                    <div className="meta-color-control">
                      <label className="meta-color-swatch-trigger" title="选择文字颜色">
                        <span className="meta-color-swatch" style={{ backgroundColor: metaTextColorInput }} aria-hidden />
                        <input
                          type="color"
                          value={metaTextColorInput}
                          onChange={(event) => setMetaTextColorInput(event.target.value)}
                          aria-label="文字颜色"
                        />
                      </label>
                      <span className="meta-color-code">{metaTextColorInput.toUpperCase()}</span>
                    </div>
                  </div>
                </div>

                <div className="submenu-note">标签底色只作用于左侧小标签，任务配色仍控制整张任务条。</div>

                <div className="color-action-row">
                  <button type="button" onClick={applyTaskMeta}>
                    💾 应用任务条设置
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setMetaTagInput(DEFAULT_TASK_TAG)
                      setMetaCustomTagEditing(false)
                      setMetaCustomTagDraft('')
                      setMetaProgressCurrentInput('')
                      setMetaProgressTotalInput('')
                      setMetaTagBackgroundColorInput(DEFAULT_TASK_TAG_BACKGROUND_COLOR)
                      setMetaTextColorInput(DEFAULT_TASK_TEXT_COLOR)
                    }}
                  >
                    ↺ 重置编辑项
                  </button>
                </div>
              </div>
            ) : null}
          </section>
        )
      case 'color':
        return (
          <section key={itemId} className="menu-layer">
            <button type="button" className="submenu-trigger" onClick={toggleColorSubmenu}>
              🎨 任务配色 {colorSubmenuOpen ? '▾' : '▸'}
            </button>

            {colorSubmenuOpen ? (
              <div className="submenu-panel color-submenu-panel">
                <div className="color-preset-grid">
                  {TASK_COLOR_PRESETS.map((preset) => (
                    <button
                      key={preset.id}
                      type="button"
                      className="color-preset-btn"
                      onClick={() => applyPresetColor(preset.value)}
                      title={preset.label}
                    >
                      <span className="color-chip" style={{ backgroundImage: preset.value }} />
                      <span>{preset.label}</span>
                    </button>
                  ))}
                </div>

                <div className="color-custom-panel">
                  <div className="color-mode-row" role="group" aria-label="自定义配色模式">
                    <button
                      type="button"
                      className={customColorMode === 'gradient' ? 'is-active' : ''}
                      onClick={() => setCustomColorMode('gradient')}
                    >
                      渐变
                    </button>
                    <button
                      type="button"
                      className={customColorMode === 'solid' ? 'is-active' : ''}
                      onClick={() => setCustomColorMode('solid')}
                    >
                      纯色
                    </button>
                  </div>

                  <div className="color-input-grid">
                    <label className="color-field">
                      主色
                      <input
                        type="color"
                        value={customColorA}
                        onChange={(event) => setCustomColorA(event.target.value)}
                      />
                    </label>
                    {customColorMode === 'gradient' ? (
                      <label className="color-field">
                        副色
                        <input
                          type="color"
                          value={customColorB}
                          onChange={(event) => setCustomColorB(event.target.value)}
                        />
                      </label>
                    ) : null}
                  </div>

                  {customColorMode === 'gradient' ? (
                    <label className="angle-slider-field">
                      角度
                      <div className="angle-slider-row">
                        <input
                          type="range"
                          min={0}
                          max={360}
                          step={1}
                          value={customColorAngle}
                          onChange={(event) => setCustomColorAngle(Number(event.target.value))}
                        />
                        <span>{Math.round(customColorAngle)}°</span>
                      </div>
                    </label>
                  ) : null}

                  <div className="color-preview" style={{ background: customColorPreview }} />

                  <div className="color-action-row">
                    <button type="button" onClick={applyCustomColor}>
                      🪄 应用自定义
                    </button>
                    <button type="button" onClick={resetTaskColor}>
                      ♻️ 恢复自动配色
                    </button>
                  </div>
                </div>
              </div>
            ) : null}
          </section>
        )
      case 'show-archived':
        return (
          <section key={itemId} className="menu-layer">
            <button
              type="button"
              className="submenu-trigger"
              onClick={toggleArchiveSubmenu}
            >
              🫥 显示隐藏任务 {archiveSubmenuOpen ? '▾' : '▸'}
            </button>

            {archiveSubmenuOpen ? (
              <div className="submenu-panel">
                <button type="button" onClick={applyArchivedAll}>
                  👁️ 全部显示
                </button>

                <div className="submenu-note">按时间</div>

                <label className="submenu-date-field">
                  时间基准
                  <select
                    value={archiveDateBasis}
                    onChange={(event) =>
                      setArchiveDateBasis(
                        event.target.value === 'created' ||
                          event.target.value === 'finished' ||
                          event.target.value === 'hidden' ||
                          event.target.value === 'archived'
                          ? event.target.value
                          : 'archived',
                      )
                    }
                  >
                    <option value="created">创建时间</option>
                    <option value="finished">完成时间</option>
                    <option value="hidden">隐藏时间</option>
                    <option value="archived">归档时间</option>
                  </select>
                </label>

                <label className="submenu-date-field">
                  Start
                  <input
                    type="date"
                    value={archiveStartInput}
                    onChange={(event) => setArchiveStartInput(event.target.value)}
                  />
                </label>

                <label className="submenu-date-field">
                  End
                  <input
                    type="date"
                    value={archiveEndInput}
                    onChange={(event) => setArchiveEndInput(event.target.value)}
                  />
                </label>

                <button type="button" onClick={applyArchivedRange}>
                  🗓️ 按时间显示
                </button>
              </div>
            ) : null}
          </section>
        )
      case 'hide-archived':
        return (
          <section key={itemId} className="menu-layer">
            <button
              type="button"
              className="submenu-trigger"
              onClick={toggleHideArchiveSubmenu}
            >
              🙈 隐藏归档任务 {hideArchiveSubmenuOpen ? '▾' : '▸'}
            </button>

            {hideArchiveSubmenuOpen ? (
              <div className="submenu-panel">
                <button type="button" onClick={applyHideArchivedAll}>
                  🙈 隐藏全部归档任务
                </button>

                <div className="submenu-note">按时间</div>

                <label className="submenu-date-field">
                  Start
                  <input
                    type="date"
                    value={hideArchiveStartInput}
                    onChange={(event) => setHideArchiveStartInput(event.target.value)}
                  />
                </label>

                <label className="submenu-date-field">
                  End
                  <input
                    type="date"
                    value={hideArchiveEndInput}
                    onChange={(event) => setHideArchiveEndInput(event.target.value)}
                  />
                </label>

                <button type="button" onClick={applyHideArchivedRange}>
                  🗓️ 按时间隐藏
                </button>
              </div>
            ) : null}
          </section>
        )
      case 'delete':
        return (
          <button
            key={itemId}
            type="button"
            className="danger"
            onClick={() => {
              deleteTask(contextTask.id)
              closeContextMenu()
            }}
          >
            🗑️ Delete（永久删除本地存储）
          </button>
        )
      default:
        return null
    }
  }

  const orderedContextMenuItems = contextTask
    ? contextMenuOrder.map((itemId) => (
        <SortableContextMenuItem key={itemId} id={itemId} label={CONTEXT_MENU_ORDER_LABELS[itemId]}>
          {renderContextMenuItemContent(itemId)}
        </SortableContextMenuItem>
      ))
    : null

  const toggleEdgeCollapseClick = async () => {
    const result = await window.todoAPI?.toggleEdgeCollapse()
    if (result?.state) {
      setEdgeState(result.state)
    }
  }

  const edgeBadgeSideClass = edgeState.side ?? 'right'
  const edgeBadgeGlyph = edgeState.hidden
    ? edgeState.side === 'left'
      ? '>'
      : edgeState.side === 'right'
        ? '<'
        : 'v'
    : '><'

  const edgeBadgeTitle = edgeState.hidden ? 'Expand from manual collapse' : 'Manual collapse'
  const isManualHidden = edgeState.hidden && edgeState.mode === 'manual'

  const onManualBadgeMouseDown = async (event: ReactMouseEvent<HTMLButtonElement>) => {
    if (event.button !== 0 || !isManualHidden) {
      return
    }

    const currentPosition = await window.todoAPI?.getWindowPosition()
    if (!currentPosition) {
      return
    }

    manualBadgeDragRef.current = {
      active: true,
      moved: false,
      startMouseX: event.screenX,
      startMouseY: event.screenY,
      startWindowX: currentPosition.x,
      startWindowY: currentPosition.y,
    }
    suppressManualBadgeClickRef.current = false

    event.preventDefault()
    event.stopPropagation()
  }

  const onManualBadgeClick = () => {
    if (suppressManualBadgeClickRef.current) {
      suppressManualBadgeClickRef.current = false
      return
    }
    void toggleEdgeCollapseClick()
  }

  const handleSaveSyncConfig = async (nextConfig: SyncConfig) => {
    const api = window.todoAPI
    if (!api) {
      return
    }

    setSyncActionBusy(true)
    try {
      const saved = await api.setSyncConfig(nextConfig)
      setSyncConfig({
        enabled: Boolean(saved.enabled),
        serverUrl: saved.serverUrl ?? '',
        token: saved.token ?? '',
      })

      const status = await api.getSyncStatus()
      setSyncStatus(
        saved.error
          ? {
              ...status,
              phase: 'error',
              lastError: saved.error,
            }
          : status,
      )
    } finally {
      setSyncActionBusy(false)
    }
  }

  const handleSyncNow = async () => {
    const api = window.todoAPI
    if (!api) {
      return
    }

    setSyncActionBusy(true)
    try {
      const result = await api.syncNow()
      const status = await api.getSyncStatus()
      setSyncStatus(
        result.ok
          ? status
          : {
              ...status,
              phase: 'error',
              lastError: result.error ?? status.lastError,
            },
      )
    } finally {
      setSyncActionBusy(false)
    }
  }

  if (!hydrated) {
    return <main className="app-shell loading">Loading...</main>
  }

  if (isManualHidden) {
    return (
      <main className={`app-shell edge-manual-hidden side-${edgeBadgeSideClass}`}>
        <button
          type="button"
          className={`edge-badge-toggle edge-badge-hidden no-drag side-${edgeBadgeSideClass}`}
          onMouseDown={(event) => void onManualBadgeMouseDown(event)}
          onClick={onManualBadgeClick}
          title={edgeBadgeTitle}
          aria-label={edgeBadgeTitle}
        >
          {edgeBadgeGlyph}
        </button>
      </main>
    )
  }

  const shellStyle = {
    '--shell-darkness': `${(0.26 + settings.opacity * 0.74).toFixed(3)}`,
  } as CSSProperties

  return (
    <main
      className={`app-shell mode-${settings.taskCardMode}${showSettings ? ' settings-open' : ''}`}
      style={shellStyle}
      onContextMenu={(event) => {
        if ((event.target as HTMLElement).closest('.task-card')) {
          return
        }
        event.preventDefault()
        setArchiveSubmenuOpen(false)
        setHideArchiveSubmenuOpen(false)
        setColorSubmenuOpen(false)
        setContextMenu(null)
      }}
    >
      <div className="window-top-drag-strip drag-region" aria-hidden="true" />

      <header className="window-titlebar drag-region">
        <div className="title-main">
          <h1>Neo Float Todo</h1>
                    <span className="title-now">
            <span className="title-now-date">{titleNow.date}</span>
            <span className="title-now-time">{titleNow.time}</span>
          </span>
        </div>

        <div className="title-actions no-drag">
          <button
            type="button"
            className="edge-badge-toggle edge-badge-expanded"
            onClick={() => void toggleEdgeCollapseClick()}
            title={edgeBadgeTitle}
            aria-label={edgeBadgeTitle}
          >
            {edgeBadgeGlyph}
          </button>
          <button type="button" onClick={() => setShowSettings((value) => !value)}>
            {showSettings ? 'Hide Settings' : 'Settings'}
          </button>
          <button type="button" onClick={() => void window.todoAPI?.windowControl('minimize')}>
            ─
          </button>
          <button type="button" onClick={() => void window.todoAPI?.windowControl('close')}>
            ✕
          </button>
        </div>
      </header>

      {persistError ? (
        <section className="persist-error no-drag">
          <span>写入失败: {persistError}</span>
          <button type="button" onClick={clearPersistError}>
            关闭
          </button>
        </section>
      ) : null}

      {showSettings ? (
        <SettingsPanel
          settings={settings}
          onChange={updateSettings}
          syncConfig={syncConfig}
          syncStatus={syncStatus}
          syncBusy={syncActionBusy}
          onSaveSyncConfig={handleSaveSyncConfig}
          onSyncNow={handleSyncNow}
        />
      ) : null}

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={visibleTasks.map((task) => task.id)} strategy={verticalListSortingStrategy}>
          <section className="task-list">
            {visibleTasks.map((task, index) => (
              <TaskCard
                key={task.id}
                task={task}
                nowMs={nowMs}
                displayOrder={index + 1}
                cardMode={settings.taskCardMode}
                contentDisplayMode={settings.taskContentDisplayMode}
                paletteMode={settings.taskPaletteMode}
                layoutPulse={layoutPulse}
                onContentChange={updateTaskContent}
                onUpdateMeta={updateTaskMeta}
                onPasteImage={insertTaskImage}
                onToggleStartPause={toggleStartPause}
                onFinish={finishTask}
                onOpenContextMenu={(taskId, position) => {
                  setArchiveSubmenuOpen(false)
                  setHideArchiveSubmenuOpen(false)
                  setColorSubmenuOpen(false)
                  setContextMenuPosition({ left: position.x, top: position.y })
                  setContextMenu({ taskId, ...position })
                }}
              />
            ))}

            <button type="button" className="new-task-tile no-drag" onClick={addTask}>
              <span className="new-task-plus">+</span>
            </button>
          </section>
        </SortableContext>
      </DndContext>

      {contextMenu && contextTask ? (
        <div
          ref={contextMenuRef}
          className="task-context-menu no-drag"
          style={{
            left: `${contextMenuPosition.left}px`,
            top: `${contextMenuPosition.top}px`,
          }}
        >
          <DndContext
            sensors={contextMenuSensors}
            collisionDetection={closestCenter}
            onDragEnd={onContextMenuDragEnd}
          >
            <SortableContext items={contextMenuOrder} strategy={verticalListSortingStrategy}>
              {orderedContextMenuItems}
            </SortableContext>
          </DndContext>
        </div>
      ) : null}

      {statsTask ? (
        <div className="stats-overlay no-drag" onClick={() => setStatsTaskId(null)}>
          <section className="stats-panel" onClick={(event) => event.stopPropagation()}>
            <header>
              <h3>任务时间统计</h3>
              <button type="button" onClick={() => setStatsTaskId(null)}>
                关闭
              </button>
            </header>

            <div className="stats-summary">
              <p>
                总时长: <strong>{formatDuration(calcTaskDuration(statsTask, nowMs))}</strong>
              </p>
              <p>状态: {statsTask.status.toUpperCase()}</p>
              <p>时间段数量: {statsTask.segments.length}</p>
            </div>

            <ul>
              {statsTask.segments.length === 0 ? (
                <li>空</li>
              ) : (
                statsTask.segments.map((segment, index) => (
                  <li key={`${segment.startAt}-${index}`}>
                    段{index + 1}: {localDateTimeText(segment.startAt)} ~{' '}
                    {segment.pauseAt ? localDateTimeText(segment.pauseAt) : '进行中'}
                  </li>
                ))
              )}
            </ul>
          </section>
        </div>
      ) : null}

      <div className="resize-handle n-left no-drag" data-resize-dir="n" />
      <div className="resize-handle n-right no-drag" data-resize-dir="n" />
      <div className="resize-handle s no-drag" data-resize-dir="s" />
      <div className="resize-handle e no-drag" data-resize-dir="e" />
      <div className="resize-handle w no-drag" data-resize-dir="w" />
      <div className="resize-handle ne no-drag" data-resize-dir="ne" />
      <div className="resize-handle nw no-drag" data-resize-dir="nw" />
      <div className="resize-handle se no-drag" data-resize-dir="se" />
      <div className="resize-handle sw no-drag" data-resize-dir="sw" />
    </main>
  )
}

export default App




