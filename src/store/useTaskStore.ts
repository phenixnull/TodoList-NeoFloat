import { create } from 'zustand'
import type { AppSettings, EventDraft, PersistedState, Task, TaskImageAttachment } from '../types/domain'
import { createContentPersistScheduler } from '../lib/contentPersistScheduler'
import { DEFAULT_APP_SETTINGS } from '../lib/defaultSettings.ts'
import { normalizeContextMenuOrder } from '../lib/contextMenuOrder.ts'
import { applyTaskOrder } from '../lib/taskOrder'
import { applyTaskDurationLayoutMode } from '../lib/taskDurationLayout'
import { shouldHideArchivedTask } from '../lib/taskVisibility'
import { closeOpenSegment, sumClosedDurations, toLocalIso } from '../lib/time'
import { buildTaskImageMarkdown, insertTextAtSelection, pruneTaskImageAttachments } from '../lib/taskImages'

const CONTENT_DEBOUNCE_MS = 200

export const FONT_OPTIONS = ['Segoe UI', 'Microsoft YaHei', 'Consolas', 'Cascadia Mono', 'Georgia', 'Trebuchet MS']

export const DEFAULT_SETTINGS: AppSettings = DEFAULT_APP_SETTINGS

type TaskStore = {
  hydrated: boolean
  tasks: Task[]
  settings: AppSettings
  persistError: string | null
  hydrate: () => Promise<void>
  clearPersistError: () => void
  addTask: () => void
  insertTaskAfter: (taskId: string) => void
  insertTaskImage: (taskId: string, file: File, selectionStart: number, selectionEnd: number) => Promise<void>
  updateTaskContent: (taskId: string, contentRaw: string) => void
  flushPendingContent: () => Promise<void>
  setTaskPresetColor: (taskId: string, colorValue: string) => void
  setTaskCustomColor: (taskId: string, colorValue: string) => void
  clearTaskColor: (taskId: string) => void
  toggleTaskDurationVisibility: (taskId: string) => void
  setAllTaskDurationVisibility: (visible: boolean) => void
  setTaskDurationLayoutMode: (taskId: string, layoutMode: Task['durationLayoutMode']) => void
  setTasksDurationLayoutMode: (taskIds: string[], layoutMode: Task['durationLayoutMode']) => void
  archiveAndHideTask: (taskId: string) => void
  hideArchivedTasks: (filter: { mode: 'all' | 'range'; start?: string; end?: string }) => void
  toggleStartPause: (taskId: string) => void
  finishTask: (taskId: string) => void
  unfinishTask: (taskId: string) => void
  archiveTask: (taskId: string) => void
  unarchiveTask: (taskId: string) => void
  deleteTask: (taskId: string) => void
  reorderTasks: (orderedIds: string[]) => void
  updateSettings: (patch: Partial<AppSettings>) => void
}

let persistQueue = Promise.resolve()

function createTask(order: number, settings: AppSettings): Task {
  const now = toLocalIso()
  return {
    id: typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2, 10)}`,
    order,
    contentRaw: '',
    attachments: [],
    colorMode: 'auto',
    colorValue: null,
    fontFamily: settings.defaultFontFamily,
    fontSize: settings.defaultFontSize,
    status: 'idle',
    archived: false,
    archivedAt: null,
    hidden: false,
    showDuration: true,
    durationLayoutMode: 'stacked',
    segments: [],
    totalDurationMs: 0,
    createdAt: now,
    updatedAt: now,
    finishedAt: null,
  }
}

function sortAndReorder(tasks: Task[]): Task[] {
  return [...tasks]
    .sort((a, b) => a.order - b.order)
    .map((task, index) => {
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
        attachments: Array.isArray(task.attachments)
          ? task.attachments.filter((attachment): attachment is TaskImageAttachment => Boolean(attachment && typeof attachment.id === 'string' && typeof attachment.storagePath === 'string' && typeof attachment.mimeType === 'string' && typeof attachment.createdAt === 'string'))
          : [],
        colorMode: task.colorMode === 'preset' || task.colorMode === 'custom' ? task.colorMode : 'auto',
        colorValue: typeof task.colorValue === 'string' ? task.colorValue : null,
        hidden: Boolean(task.hidden),
        showDuration: task.showDuration !== false,
        durationLayoutMode: task.durationLayoutMode === 'inline' ? 'inline' : 'stacked',
        segments,
        totalDurationMs,
        order: index + 1,
      }
    })
}

function toSnapshot(tasks: Task[], settings: AppSettings): PersistedState {
  return {
    version: 1,
    tasks: sortAndReorder(tasks),
    settings,
    updatedAt: toLocalIso(),
  }
}

function normalizeTaskCardMode(value: unknown): AppSettings['taskCardMode'] {
  return value === 'collapsed' ? 'collapsed' : 'expanded'
}

function normalizeTaskContentDisplayMode(value: unknown): AppSettings['taskContentDisplayMode'] {
  return value === 'auto-height' ? 'auto-height' : 'inner-scroll'
}

function normalizeTaskPaletteMode(value: unknown): AppSettings['taskPaletteMode'] {
  if (value === 'gray-gradient' || value === 'default-gray') {
    return value
  }
  return 'auto-vivid'
}

function normalizeArchivedDisplayMode(value: unknown): AppSettings['archivedDisplayMode'] {
  return value === 'range' ? 'range' : 'all'
}

function normalizeDateText(value: unknown): string {
  if (typeof value !== 'string') {
    return ''
  }
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : ''
}

function normalizeEdgeAutoHide(value: unknown): boolean {
  return value !== false
}

export const useTaskStore = create<TaskStore>((set, get) => {
  const enqueuePersist = (event: EventDraft) => {
    const run = async () => {
      const api = window.todoAPI
      if (!api) {
        return
      }

      const { tasks, settings } = get()
      const snapshot = toSnapshot(tasks, settings)
      const result = await api.persistState({ state: snapshot, event })

      if (!result.ok) {
        set({ persistError: result.error ?? 'Persist failed' })
      }
    }

    const chained = persistQueue.then(run)
    persistQueue = chained.catch((error) => {
      set({ persistError: error instanceof Error ? error.message : String(error) })
    })
  }

  const contentPersistScheduler = createContentPersistScheduler({
    debounceMs: CONTENT_DEBOUNCE_MS,
    onPersist: (taskId) => {
      enqueuePersist({
        taskId,
        type: 'TASK_UPDATE',
        payload: { field: 'contentRaw' },
      })
    },
  })

  return {
    hydrated: false,
    tasks: [],
    settings: { ...DEFAULT_SETTINGS },
    persistError: null,

    hydrate: async () => {
      const api = window.todoAPI
      if (!api) {
        set({ hydrated: true })
        return
      }

      try {
        const persisted = await api.getState()
        const nextTasks = sortAndReorder(Array.isArray(persisted?.tasks) ? persisted.tasks : [])
        const nextSettings = {
          ...DEFAULT_SETTINGS,
          ...(persisted?.settings ?? {}),
        }
        nextSettings.taskCardMode = normalizeTaskCardMode(nextSettings.taskCardMode)
        nextSettings.taskContentDisplayMode = normalizeTaskContentDisplayMode(nextSettings.taskContentDisplayMode)
        nextSettings.taskPaletteMode = normalizeTaskPaletteMode(nextSettings.taskPaletteMode)
        nextSettings.archivedDisplayMode = normalizeArchivedDisplayMode(nextSettings.archivedDisplayMode)
        nextSettings.archivedRangeStart = normalizeDateText(nextSettings.archivedRangeStart)
        nextSettings.archivedRangeEnd = normalizeDateText(nextSettings.archivedRangeEnd)
        nextSettings.edgeAutoHide = normalizeEdgeAutoHide(nextSettings.edgeAutoHide)
        nextSettings.contextMenuOrder = normalizeContextMenuOrder(nextSettings.contextMenuOrder)

        set({
          tasks: nextTasks,
          settings: nextSettings,
          hydrated: true,
        })

        await api.setWindowOptions({
          opacity: nextSettings.opacity,
          alwaysOnTop: nextSettings.alwaysOnTop,
          edgeAutoHide: nextSettings.edgeAutoHide,
        })
      } catch (error) {
        set({
          hydrated: true,
          persistError: error instanceof Error ? error.message : String(error),
        })
      }
    },

    clearPersistError: () => set({ persistError: null }),

    toggleTaskDurationVisibility: (taskId) => {
      const now = toLocalIso()

      set((state) => ({
        tasks: state.tasks.map((task) => {
          if (task.id !== taskId) {
            return task
          }

          return {
            ...task,
            showDuration: task.showDuration === false,
            updatedAt: now,
          }
        }),
      }))

      enqueuePersist({
        taskId,
        type: 'TASK_UPDATE',
        payload: { field: 'showDuration' },
      })
    },

    setAllTaskDurationVisibility: (visible) => {
      const now = toLocalIso()

      set((state) => ({
        tasks: state.tasks.map((task) => ({
          ...task,
          showDuration: visible,
          updatedAt: now,
        })),
      }))

      enqueuePersist({
        taskId: null,
        type: 'TASK_UPDATE',
        payload: { field: 'showDurationAll', value: visible },
      })
    },

    setTaskDurationLayoutMode: (taskId, layoutMode) => {
      const normalizedLayoutMode = layoutMode === 'inline' ? 'inline' : 'stacked'
      const now = toLocalIso()

      set((state) => ({
        tasks: applyTaskDurationLayoutMode(state.tasks, [taskId], normalizedLayoutMode, now),
      }))

      enqueuePersist({
        taskId,
        type: 'TASK_UPDATE',
        payload: { field: 'durationLayoutMode', value: normalizedLayoutMode },
      })
    },

    setTasksDurationLayoutMode: (taskIds, layoutMode) => {
      const normalizedLayoutMode = layoutMode === 'inline' ? 'inline' : 'stacked'
      const targetTaskIds = [...new Set(taskIds.filter((taskId): taskId is string => typeof taskId === 'string' && taskId.length > 0))]
      if (targetTaskIds.length === 0) {
        return
      }

      const now = toLocalIso()

      set((state) => ({
        tasks: applyTaskDurationLayoutMode(state.tasks, targetTaskIds, normalizedLayoutMode, now),
      }))

      enqueuePersist({
        taskId: null,
        type: 'TASK_UPDATE',
        payload: {
          field: 'durationLayoutModeMany',
          taskIds: targetTaskIds,
          value: normalizedLayoutMode,
        },
      })
    },

    archiveAndHideTask: (taskId) => {
      const now = toLocalIso()

      set((state) => ({
        tasks: state.tasks.map((task) => {
          if (task.id !== taskId) {
            return task
          }

          const finalizedSegments = task.status === 'doing' ? closeOpenSegment(task.segments, now) : task.segments
          return {
            ...task,
            status: task.status === 'doing' ? 'paused' : task.status,
            archived: true,
            archivedAt: now,
            hidden: true,
            segments: finalizedSegments,
            totalDurationMs: sumClosedDurations(finalizedSegments),
            updatedAt: now,
          }
        }),
      }))

      enqueuePersist({
        taskId,
        type: 'TASK_ARCHIVE',
        payload: { at: now, hidden: true },
      })
    },

    hideArchivedTasks: (filter) => {
      const now = toLocalIso()
      const todayDate = now.slice(0, 10)

      set((state) => ({
        tasks: state.tasks.map((task) =>
          shouldHideArchivedTask(task, {
            mode: filter.mode,
            todayDate,
            start: filter.start,
            end: filter.end,
          })
            ? {
                ...task,
                hidden: true,
                updatedAt: now,
              }
            : task,
        ),
      }))

      enqueuePersist({
        taskId: null,
        type: 'TASK_UPDATE',
        payload: {
          field: 'hideArchivedTasks',
          mode: filter.mode,
          start: filter.start ?? '',
          end: filter.end ?? '',
        },
      })
    },

    addTask: () => {
      const now = toLocalIso()
      set((state) => {
        const task = createTask(state.tasks.length + 1, state.settings)
        task.createdAt = now
        task.updatedAt = now
        return { tasks: [...state.tasks, task] }
      })

      const taskId = get().tasks[get().tasks.length - 1]?.id
      enqueuePersist({
        taskId: taskId ?? null,
        type: 'TASK_ADD',
        payload: {},
      })
    },

    insertTaskAfter: (taskId) => {
      const now = toLocalIso()
      let insertedTaskId = null

      set((state) => {
        const targetIndex = state.tasks.findIndex((task) => task.id === taskId)
        if (targetIndex < 0) {
          return state
        }

        const nextTask = createTask(state.tasks.length + 1, state.settings)
        nextTask.createdAt = now
        nextTask.updatedAt = now
        insertedTaskId = nextTask.id

        const reorderedTasks = [...state.tasks]
        reorderedTasks.splice(targetIndex + 1, 0, nextTask)

        return {
          tasks: reorderedTasks.map((task, index) => ({
            ...task,
            order: index + 1,
          })),
        }
      })

      enqueuePersist({
        taskId: insertedTaskId,
        type: 'TASK_ADD',
        payload: { afterTaskId: taskId },
      })
    },

    insertTaskImage: async (taskId, file, selectionStart, selectionEnd) => {
      const api = window.todoAPI
      if (!api || !file || !file.type.startsWith('image/')) {
        return
      }

      const bytes = new Uint8Array(await file.arrayBuffer())
      const saved = await api.saveTaskImage({
        taskId,
        mimeType: file.type,
        bytes,
      })

      if (!saved.ok || !saved.image) {
        set({ persistError: saved.error ?? 'Image save failed' })
        return
      }

      const savedImage = saved.image
      const now = toLocalIso()
      const imageMarkdown = buildTaskImageMarkdown(savedImage.id)
      set((state) => ({
        tasks: state.tasks.map((task) => {
          if (task.id !== taskId || task.archived) {
            return task
          }

          const nextContentRaw = insertTextAtSelection(task.contentRaw, imageMarkdown, selectionStart, selectionEnd)
          return {
            ...task,
            contentRaw: nextContentRaw,
            attachments: [...task.attachments.filter((attachment) => attachment.id !== savedImage.id), savedImage],
            updatedAt: now,
          }
        }),
      }))

      enqueuePersist({
        taskId,
        type: 'TASK_UPDATE',
        payload: { field: 'contentRaw', imageId: savedImage.id, inserted: true },
      })
    },

    updateTaskContent: (taskId, contentRaw) => {
      const now = toLocalIso()
      set((state) => ({
        tasks: state.tasks.map((task) =>
          task.id === taskId && !task.archived
            ? {
                ...task,
                contentRaw,
                attachments: pruneTaskImageAttachments(contentRaw, task.attachments),
                updatedAt: now,
              }
            : task,
        ),
      }))
      contentPersistScheduler.schedule(taskId)
    },

    flushPendingContent: async () => {
      await contentPersistScheduler.flushAll()
      await persistQueue
    },

    setTaskPresetColor: (taskId, colorValue) => {
      const now = toLocalIso()
      set((state) => ({
        tasks: state.tasks.map((task) =>
          task.id === taskId
            ? {
                ...task,
                colorMode: 'preset',
                colorValue,
                updatedAt: now,
              }
            : task,
        ),
      }))

      enqueuePersist({
        taskId,
        type: 'TASK_UPDATE',
        payload: { field: 'taskColor', mode: 'preset', colorValue },
      })
    },

    setTaskCustomColor: (taskId, colorValue) => {
      const now = toLocalIso()
      set((state) => ({
        tasks: state.tasks.map((task) =>
          task.id === taskId
            ? {
                ...task,
                colorMode: 'custom',
                colorValue,
                updatedAt: now,
              }
            : task,
        ),
      }))

      enqueuePersist({
        taskId,
        type: 'TASK_UPDATE',
        payload: { field: 'taskColor', mode: 'custom', colorValue },
      })
    },

    clearTaskColor: (taskId) => {
      const now = toLocalIso()
      set((state) => ({
        tasks: state.tasks.map((task) =>
          task.id === taskId
            ? {
                ...task,
                colorMode: 'auto',
                colorValue: null,
                updatedAt: now,
              }
            : task,
        ),
      }))

      enqueuePersist({
        taskId,
        type: 'TASK_UPDATE',
        payload: { field: 'taskColor', mode: 'auto' },
      })
    },

    toggleStartPause: (taskId) => {
      const now = toLocalIso()
      let nextEvent: EventDraft = {
        taskId,
        type: 'TASK_START',
        payload: { at: now },
      }

      set((state) => ({
        tasks: state.tasks.map((task) => {
          if (task.id !== taskId || task.status === 'finished' || task.archived) {
            return task
          }

          if (task.status === 'doing') {
            const nextSegments = closeOpenSegment(task.segments, now)
            nextEvent = {
              taskId,
              type: 'TASK_PAUSE',
              payload: { at: now },
            }

            return {
              ...task,
              status: 'paused',
              segments: nextSegments,
              totalDurationMs: sumClosedDurations(nextSegments),
              updatedAt: now,
            }
          }

          return {
            ...task,
            status: 'doing',
            segments: [...task.segments, { startAt: now, pauseAt: null, durationMs: 0 }],
            updatedAt: now,
          }
        }),
      }))

      enqueuePersist(nextEvent)
    },

    finishTask: (taskId) => {
      const now = toLocalIso()

      set((state) => ({
        tasks: state.tasks.map((task) => {
          if (task.id !== taskId || task.status === 'finished') {
            return task
          }

          const finalizedSegments = task.status === 'doing' ? closeOpenSegment(task.segments, now) : task.segments

          return {
            ...task,
            status: 'finished',
            segments: finalizedSegments,
            totalDurationMs: sumClosedDurations(finalizedSegments),
            finishedAt: now,
            updatedAt: now,
          }
        }),
      }))

      enqueuePersist({
        taskId,
        type: 'TASK_FINISH',
        payload: { at: now },
      })
    },

    unfinishTask: (taskId) => {
      const now = toLocalIso()

      set((state) => ({
        tasks: state.tasks.map((task) => {
          if (task.id !== taskId || task.status !== 'finished') {
            return task
          }

          const nextStatus = task.segments.length > 0 ? 'paused' : 'idle'
          return {
            ...task,
            status: nextStatus,
            finishedAt: null,
            updatedAt: now,
          }
        }),
      }))

      enqueuePersist({
        taskId,
        type: 'TASK_UNFINISH',
        payload: { at: now },
      })
    },

    archiveTask: (taskId) => {
      const now = toLocalIso()

      set((state) => ({
        tasks: state.tasks.map((task) => {
          if (task.id !== taskId || task.archived) {
            return task
          }

          const finalizedSegments = task.status === 'doing' ? closeOpenSegment(task.segments, now) : task.segments

          return {
            ...task,
            status: task.status === 'doing' ? 'paused' : task.status,
            archived: true,
            archivedAt: now,
            hidden: false,
            segments: finalizedSegments,
            totalDurationMs: sumClosedDurations(finalizedSegments),
            updatedAt: now,
          }
        }),
      }))

      enqueuePersist({
        taskId,
        type: 'TASK_ARCHIVE',
        payload: { at: now },
      })
    },

    unarchiveTask: (taskId) => {
      const now = toLocalIso()

      set((state) => ({
        tasks: state.tasks.map((task) => {
          if (task.id !== taskId || !task.archived) {
            return task
          }

          return {
            ...task,
            archived: false,
            archivedAt: null,
            hidden: false,
            updatedAt: now,
          }
        }),
      }))

      enqueuePersist({
        taskId,
        type: 'TASK_UNARCHIVE',
        payload: { at: now },
      })
    },

    deleteTask: (taskId) => {
      set((state) => {
        const filtered = state.tasks.filter((task) => task.id !== taskId)
        return { tasks: sortAndReorder(filtered) }
      })

      enqueuePersist({
        taskId,
        type: 'TASK_DELETE',
        payload: {},
      })
    },

    reorderTasks: (orderedIds) => {
      const now = toLocalIso()
      set((state) => ({
        tasks: applyTaskOrder(state.tasks, orderedIds, now),
      }))

      enqueuePersist({
        taskId: null,
        type: 'TASK_REORDER',
        payload: { orderedIds },
      })
    },

    updateSettings: (patch) => {
      const prev = get().settings
      const next = { ...prev, ...patch }
      next.uiScale = Math.max(0.75, Math.min(1.6, Number(next.uiScale) || 1))
      next.taskCardMode = normalizeTaskCardMode(next.taskCardMode)
      next.taskContentDisplayMode = normalizeTaskContentDisplayMode(next.taskContentDisplayMode)
      next.taskPaletteMode = normalizeTaskPaletteMode(next.taskPaletteMode)
      next.archivedDisplayMode = normalizeArchivedDisplayMode(next.archivedDisplayMode)
      next.archivedRangeStart = normalizeDateText(next.archivedRangeStart)
      next.archivedRangeEnd = normalizeDateText(next.archivedRangeEnd)
      next.edgeAutoHide = normalizeEdgeAutoHide(next.edgeAutoHide)
      next.contextMenuOrder = normalizeContextMenuOrder(next.contextMenuOrder)
      const shouldApplyFontToAll = Object.hasOwn(patch, 'defaultFontFamily') || Object.hasOwn(patch, 'defaultFontSize')
      const now = toLocalIso()

      set((state) => ({
        settings: next,
        tasks: shouldApplyFontToAll
          ? state.tasks.map((task) => ({
              ...task,
              fontFamily: patch.defaultFontFamily ?? task.fontFamily,
              fontSize: patch.defaultFontSize ?? task.fontSize,
              updatedAt: now,
            }))
          : state.tasks,
      }))

      const api = window.todoAPI
      if (api) {
        if (Object.hasOwn(patch, 'opacity') || Object.hasOwn(patch, 'alwaysOnTop') || Object.hasOwn(patch, 'edgeAutoHide')) {
          void api.setWindowOptions({
            opacity: next.opacity,
            alwaysOnTop: next.alwaysOnTop,
            edgeAutoHide: next.edgeAutoHide,
          })
        }

        if (Object.hasOwn(patch, 'autoLaunch')) {
          void api.setAutoLaunch(Boolean(next.autoLaunch))
        }
      }

      enqueuePersist({
        taskId: null,
        type: 'SETTINGS_UPDATE',
        payload: {
          ...(patch as Record<string, unknown>),
          applyFontToAll: shouldApplyFontToAll,
        },
      })
    },
  }
})


