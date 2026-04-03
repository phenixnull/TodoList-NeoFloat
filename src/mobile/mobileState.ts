import type { PersistedState, Task, TaskImageAttachment } from '../types/domain'
import { DEFAULT_APP_SETTINGS } from '../lib/defaultSettings.ts'
import { pruneTaskImageAttachments } from '../lib/taskImages.ts'
import { closeOpenSegment, sumClosedDurations } from '../lib/time.ts'

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
      hidden: Boolean(task.hidden),
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
      hidden: false,
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
      hidden: false,
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
