import type { PersistedState, Task, TaskImageAttachment } from '../types/domain'
import { normalizeContextMenuOrder } from '../lib/contextMenuOrder.ts'
import { DEFAULT_APP_SETTINGS } from '../lib/defaultSettings.ts'
import { applyTaskDurationLayoutMode } from '../lib/taskDurationLayout.ts'
import { pruneTaskImageAttachments } from '../lib/taskImages.ts'
import { normalizeTaskMeta } from '../lib/taskMeta.ts'
import { applyTaskOrder } from '../lib/taskOrder.ts'
import { closeOpenSegment, sumClosedDurations } from '../lib/time.ts'
import { shouldHideArchivedTask } from '../lib/taskVisibility.ts'

function createTaskId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2, 10)}`
}

function sortAndReorder(tasks: Task[]): Task[] {
  return [...tasks]
    .sort((a, b) => a.order - b.order)
    .map((task, index) => ({
      ...task,
      meta: normalizeTaskMeta(task.meta),
      hidden: Boolean(task.hidden),
      hiddenAt:
        typeof task.hiddenAt === 'string'
          ? task.hiddenAt
          : task.hidden
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
      order: index + 1,
    }))
}

function withStateTasks(state: PersistedState, tasks: Task[], updatedAt: string): PersistedState {
  return {
    ...state,
    tasks: sortAndReorder(tasks),
    updatedAt,
  }
}

function createMobileTask(order: number, now: string, settings = DEFAULT_APP_SETTINGS): Task {
  return {
    id: createTaskId(),
    order,
    contentRaw: '',
    attachments: [],
    meta: normalizeTaskMeta(undefined),
    colorMode: 'auto',
    colorValue: null,
    fontFamily: settings.defaultFontFamily,
    fontSize: settings.defaultFontSize,
    status: 'idle',
    archived: false,
    archivedAt: null,
    hidden: false,
    hiddenAt: null,
    showDuration: true,
    durationLayoutMode: 'stacked',
    countdownTargetMs: null,
    segments: [],
    totalDurationMs: 0,
    createdAt: now,
    updatedAt: now,
    finishedAt: null,
  }
}

function normalizeMobileSettings(settings: PersistedState['settings']): PersistedState['settings'] {
  return {
    ...DEFAULT_APP_SETTINGS,
    ...settings,
    taskCardMode: settings.taskCardMode === 'collapsed' ? 'collapsed' : 'expanded',
    taskContentDisplayMode: settings.taskContentDisplayMode === 'auto-height' ? 'auto-height' : 'inner-scroll',
    taskPaletteMode:
      settings.taskPaletteMode === 'gray-gradient' || settings.taskPaletteMode === 'default-gray'
        ? settings.taskPaletteMode
        : 'auto-vivid',
    archivedDisplayMode: settings.archivedDisplayMode === 'range' ? 'range' : 'all',
    archivedRangeStart:
      typeof settings.archivedRangeStart === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(settings.archivedRangeStart)
        ? settings.archivedRangeStart
        : '',
    archivedRangeEnd:
      typeof settings.archivedRangeEnd === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(settings.archivedRangeEnd)
        ? settings.archivedRangeEnd
        : '',
    edgeAutoHide: settings.edgeAutoHide !== false,
    contextMenuOrder: normalizeContextMenuOrder(settings.contextMenuOrder),
    uiScale: Math.max(0.75, Math.min(1.6, Number(settings.uiScale) || 1)),
  }
}

function updateTask(
  state: PersistedState,
  taskId: string,
  updatedAt: string,
  updater: (task: Task) => Task,
): PersistedState {
  return withStateTasks(
    state,
    state.tasks.map((task) => (task.id === taskId ? updater(task) : task)),
    updatedAt,
  )
}

export function createEmptyMobileState(updatedAt: string): PersistedState {
  return {
    version: 1,
    tasks: [],
    settings: { ...DEFAULT_APP_SETTINGS },
    updatedAt,
  }
}

export function addMobileTask(state: PersistedState, updatedAt: string): PersistedState {
  return withStateTasks(
    state,
    [...state.tasks, createMobileTask(state.tasks.length + 1, updatedAt, state.settings)],
    updatedAt,
  )
}

export function insertMobileTaskAfter(state: PersistedState, taskId: string, updatedAt: string): PersistedState {
  const orderedTasks = [...state.tasks].sort((a, b) => a.order - b.order)
  const insertIndex = orderedTasks.findIndex((task) => task.id === taskId)
  const nextTask = createMobileTask(orderedTasks.length + 1, updatedAt, state.settings)

  if (insertIndex < 0) {
    return withStateTasks(state, [...orderedTasks, nextTask], updatedAt)
  }

  const nextTasks = [...orderedTasks]
  nextTasks.splice(insertIndex + 1, 0, nextTask)
  return {
    ...state,
    tasks: nextTasks.map((task, index) => ({
      ...task,
      order: index + 1,
    })),
    updatedAt,
  }
}

export function updateMobileTaskContent(
  state: PersistedState,
  taskId: string,
  contentRaw: string,
  updatedAt: string,
): PersistedState {
  return updateTask(state, taskId, updatedAt, (task) => ({
    ...task,
    contentRaw,
    attachments: pruneTaskImageAttachments(contentRaw, task.attachments),
    updatedAt,
  }))
}

export function attachMobileTaskImage(
  state: PersistedState,
  taskId: string,
  attachment: TaskImageAttachment,
  nextContentRaw: string,
  updatedAt: string,
): PersistedState {
  return updateTask(state, taskId, updatedAt, (task) => ({
    ...task,
    contentRaw: nextContentRaw,
    attachments: [...task.attachments.filter((item) => item.id !== attachment.id), attachment],
    updatedAt,
  }))
}

export function setMobileTaskPresetColor(
  state: PersistedState,
  taskId: string,
  colorValue: string,
  updatedAt: string,
): PersistedState {
  return updateTask(state, taskId, updatedAt, (task) => ({
    ...task,
    colorMode: 'preset',
    colorValue,
    updatedAt,
  }))
}

export function setMobileTaskCustomColor(
  state: PersistedState,
  taskId: string,
  colorValue: string,
  updatedAt: string,
): PersistedState {
  return updateTask(state, taskId, updatedAt, (task) => ({
    ...task,
    colorMode: 'custom',
    colorValue,
    updatedAt,
  }))
}

export function clearMobileTaskColor(state: PersistedState, taskId: string, updatedAt: string): PersistedState {
  return updateTask(state, taskId, updatedAt, (task) => ({
    ...task,
    colorMode: 'auto',
    colorValue: null,
    updatedAt,
  }))
}

export function toggleMobileTaskDurationVisibility(
  state: PersistedState,
  taskId: string,
  updatedAt: string,
): PersistedState {
  return updateTask(state, taskId, updatedAt, (task) => ({
    ...task,
    showDuration: task.showDuration === false,
    updatedAt,
  }))
}

export function setAllMobileTaskDurationVisibility(
  state: PersistedState,
  visible: boolean,
  updatedAt: string,
): PersistedState {
  return withStateTasks(
    state,
    state.tasks.map((task) => ({
      ...task,
      showDuration: visible,
      updatedAt,
    })),
    updatedAt,
  )
}

export function setMobileTaskDurationLayoutMode(
  state: PersistedState,
  taskId: string,
  layoutMode: Task['durationLayoutMode'],
  updatedAt: string,
): PersistedState {
  return withStateTasks(state, applyTaskDurationLayoutMode(state.tasks, [taskId], layoutMode, updatedAt), updatedAt)
}

export function setMobileTasksDurationLayoutMode(
  state: PersistedState,
  taskIds: string[],
  layoutMode: Task['durationLayoutMode'],
  updatedAt: string,
): PersistedState {
  const normalizedTaskIds = [...new Set(taskIds.filter((taskId): taskId is string => typeof taskId === 'string' && taskId.length > 0))]
  return withStateTasks(state, applyTaskDurationLayoutMode(state.tasks, normalizedTaskIds, layoutMode, updatedAt), updatedAt)
}

export function toggleMobileTaskTimer(state: PersistedState, taskId: string, updatedAt: string): PersistedState {
  return updateTask(state, taskId, updatedAt, (task) => {
    if (task.archived || task.status === 'finished') {
      return task
    }

    if (task.status === 'doing') {
      const nextSegments = closeOpenSegment(task.segments, updatedAt)
      return {
        ...task,
        status: 'paused',
        segments: nextSegments,
        totalDurationMs: sumClosedDurations(nextSegments),
        updatedAt,
      }
    }

    return {
      ...task,
      status: 'doing',
      segments: [...task.segments, { startAt: updatedAt, pauseAt: null, durationMs: 0 }],
      updatedAt,
    }
  })
}

export function toggleMobileTaskFinished(state: PersistedState, taskId: string, updatedAt: string): PersistedState {
  return updateTask(state, taskId, updatedAt, (task) => {
    if (task.archived) {
      return task
    }

    if (task.status === 'finished') {
      return {
        ...task,
        status: task.segments.length > 0 ? 'paused' : 'idle',
        finishedAt: null,
        updatedAt,
      }
    }

    const finalizedSegments = task.status === 'doing' ? closeOpenSegment(task.segments, updatedAt) : task.segments
    return {
      ...task,
      status: 'finished',
      segments: finalizedSegments,
      totalDurationMs: sumClosedDurations(finalizedSegments),
      finishedAt: updatedAt,
      updatedAt,
    }
  })
}

export function archiveMobileTask(state: PersistedState, taskId: string, updatedAt: string): PersistedState {
  return updateTask(state, taskId, updatedAt, (task) => {
    if (task.archived) {
      return task
    }

    const finalizedSegments = task.status === 'doing' ? closeOpenSegment(task.segments, updatedAt) : task.segments
    return {
      ...task,
      status: task.status === 'doing' ? 'paused' : task.status,
      archived: true,
      archivedAt: updatedAt,
      hidden: task.hidden,
      hiddenAt: task.hidden ? task.hiddenAt ?? updatedAt : null,
      segments: finalizedSegments,
      totalDurationMs: sumClosedDurations(finalizedSegments),
      updatedAt,
    }
  })
}

export function archiveAndHideMobileTask(state: PersistedState, taskId: string, updatedAt: string): PersistedState {
  return updateTask(state, taskId, updatedAt, (task) => {
    const finalizedSegments = task.status === 'doing' ? closeOpenSegment(task.segments, updatedAt) : task.segments
    return {
      ...task,
      status: task.status === 'doing' ? 'paused' : task.status,
      archived: true,
      archivedAt: task.archivedAt ?? updatedAt,
      hidden: true,
      hiddenAt: task.hidden ? task.hiddenAt ?? updatedAt : updatedAt,
      segments: finalizedSegments,
      totalDurationMs: sumClosedDurations(finalizedSegments),
      updatedAt,
    }
  })
}

export function unarchiveMobileTask(state: PersistedState, taskId: string, updatedAt: string): PersistedState {
  return updateTask(state, taskId, updatedAt, (task) => {
    if (!task.archived) {
      return task
    }

    return {
      ...task,
      archived: false,
      archivedAt: null,
      hidden: task.hidden,
      hiddenAt: task.hidden ? task.hiddenAt ?? updatedAt : null,
      updatedAt,
    }
  })
}

export function deleteMobileTask(state: PersistedState, taskId: string, updatedAt: string): PersistedState {
  return withStateTasks(
    state,
    state.tasks.filter((task) => task.id !== taskId),
    updatedAt,
  )
}

export function hideArchivedMobileTasks(
  state: PersistedState,
  filter: { mode: 'all' | 'range'; start?: string; end?: string },
  updatedAt: string,
): PersistedState {
  const todayDate = updatedAt.slice(0, 10)

  return withStateTasks(
    state,
    state.tasks.map((task) =>
      shouldHideArchivedTask(task, {
        mode: filter.mode,
        todayDate,
        start: filter.start,
        end: filter.end,
      })
        ? {
            ...task,
            hidden: true,
            hiddenAt: updatedAt,
            updatedAt,
          }
        : task,
    ),
    updatedAt,
  )
}

export function reorderMobileTasks(state: PersistedState, orderedIds: string[], updatedAt: string): PersistedState {
  return withStateTasks(state, applyTaskOrder(state.tasks, orderedIds, updatedAt), updatedAt)
}

export function updateMobileSettings(
  state: PersistedState,
  patch: Partial<PersistedState['settings']>,
  updatedAt: string,
): PersistedState {
  const nextSettings = normalizeMobileSettings({
    ...state.settings,
    ...patch,
  })

  const shouldApplyFontToAll = Object.hasOwn(patch, 'defaultFontFamily') || Object.hasOwn(patch, 'defaultFontSize')

  return {
    ...state,
    settings: nextSettings,
    tasks: shouldApplyFontToAll
      ? state.tasks.map((task) => ({
          ...task,
          fontFamily: patch.defaultFontFamily ?? task.fontFamily,
          fontSize: patch.defaultFontSize ?? task.fontSize,
          updatedAt,
        }))
      : sortAndReorder(state.tasks),
    updatedAt,
  }
}
