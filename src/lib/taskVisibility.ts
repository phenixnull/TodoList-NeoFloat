import type { AppSettings, Task } from '../types/domain'

type TaskVisibilitySettings = Pick<
  AppSettings,
  | 'showArchived'
  | 'archivedDisplayMode'
  | 'archivedRangeStart'
  | 'archivedRangeEnd'
>
type TaskVisibilityTask = Pick<Task, 'hidden' | 'archived' | 'archivedAt' | 'updatedAt' | 'createdAt'>

function normalizeDateText(value: string | null | undefined): string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : ''
}

function datePrefix(value: string | null | undefined): string | null {
  if (!value) {
    return null
  }
  const match = value.match(/^(\d{4}-\d{2}-\d{2})/)
  return match ? match[1] : null
}

export function resolveHiddenArchiveRangeDefaults(input: {
  todayDate: string
  currentStart?: string
  currentEnd?: string
}): { start: string; end: string } {
  const todayDate = normalizeDateText(input.todayDate)
  const start = normalizeDateText(input.currentStart) || todayDate
  const end = normalizeDateText(input.currentEnd) || todayDate

  if (start <= end) {
    return { start, end }
  }

  return { start: end, end: start }
}

export function resolveTaskVisibilityDate(task: TaskVisibilityTask): string | null {
  return datePrefix(task.archivedAt) ?? datePrefix(task.updatedAt) ?? datePrefix(task.createdAt)
}

export function shouldShowTaskInList(task: TaskVisibilityTask, settings: TaskVisibilitySettings, todayDate: string): boolean {
  const taskDate = resolveTaskVisibilityDate(task)

  if (task.hidden) {
    if (!settings.showArchived) {
      return false
    }

    if (settings.archivedDisplayMode !== 'range') {
      return true
    }

    if (!taskDate) {
      return false
    }

    const { start, end } = resolveHiddenArchiveRangeDefaults({
      todayDate,
      currentStart: settings.archivedRangeStart,
      currentEnd: settings.archivedRangeEnd,
    })

    return taskDate >= start && taskDate <= end
  }

  return true
}

export function shouldHideArchivedTask(
  task: TaskVisibilityTask,
  input: { mode: 'all' | 'range'; todayDate: string; start?: string; end?: string },
): boolean {
  if (!task.archived || task.hidden) {
    return false
  }

  if (input.mode !== 'range') {
    return true
  }

  const taskDate = resolveTaskVisibilityDate(task)
  if (!taskDate) {
    return false
  }

  const { start, end } = resolveHiddenArchiveRangeDefaults({
    todayDate: input.todayDate,
    currentStart: input.start,
    currentEnd: input.end,
  })

  return taskDate >= start && taskDate <= end
}
