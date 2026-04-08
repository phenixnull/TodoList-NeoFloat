import type { Task } from '../types/domain'
import { closeOpenSegment, sumClosedDurations } from './time.ts'

function finalizeArchiveSegments(task: Task, now: string) {
  const nextSegments = task.status === 'doing' ? closeOpenSegment(task.segments, now) : task.segments
  return {
    nextSegments,
    nextStatus: task.status === 'doing' ? 'paused' : task.status,
    nextTotalDurationMs: sumClosedDurations(nextSegments),
  }
}

export function archiveTaskState(task: Task, now: string): Task {
  if (task.archived) {
    return task
  }

  const { nextSegments, nextStatus, nextTotalDurationMs } = finalizeArchiveSegments(task, now)

  return {
    ...task,
    status: nextStatus,
    archived: true,
    archivedAt: now,
    hidden: task.hidden,
    hiddenAt: task.hidden ? task.hiddenAt ?? now : null,
    segments: nextSegments,
    totalDurationMs: nextTotalDurationMs,
    updatedAt: now,
  }
}

export function archiveAndHideTaskState(task: Task, now: string): Task {
  const { nextSegments, nextStatus, nextTotalDurationMs } = finalizeArchiveSegments(task, now)

  return {
    ...task,
    status: nextStatus,
    archived: true,
    archivedAt: task.archivedAt ?? now,
    hidden: true,
    hiddenAt: task.hidden ? task.hiddenAt ?? now : now,
    segments: nextSegments,
    totalDurationMs: nextTotalDurationMs,
    updatedAt: now,
  }
}

export function unarchiveTaskState(task: Task, now: string): Task {
  if (!task.archived) {
    return task
  }

  return {
    ...task,
    archived: false,
    archivedAt: null,
    hidden: task.hidden,
    hiddenAt: task.hidden ? task.hiddenAt ?? now : null,
    updatedAt: now,
  }
}
