import type { HiddenTaskDateBasis, Task } from '../types/domain'

export type { HiddenTaskDateBasis } from '../types/domain'

type TaskVisibilityTask = Pick<Task, 'hidden' | 'hiddenAt' | 'archived' | 'archivedAt' | 'createdAt' | 'finishedAt' | 'updatedAt'>

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

export function resolveArchivedVisibilityDate(task: TaskVisibilityTask): string | null {
  if (!task.archived) {
    return null
  }

  return datePrefix(task.archivedAt)
}

function isArchivedDateInRange(
  task: TaskVisibilityTask,
  input: { todayDate: string; start?: string; end?: string },
): boolean {
  const taskDate = resolveArchivedVisibilityDate(task)
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

function resolveHiddenTaskDate(task: TaskVisibilityTask): string | null {
  return datePrefix(task.hiddenAt) ?? (task.hidden ? datePrefix(task.updatedAt) : null)
}

function resolveTaskDateByBasis(task: TaskVisibilityTask, basis: HiddenTaskDateBasis): string | null {
  switch (basis) {
    case 'created':
      return datePrefix(task.createdAt)
    case 'finished':
      return datePrefix(task.finishedAt)
    case 'hidden':
      return resolveHiddenTaskDate(task)
    case 'archived':
    default:
      return resolveArchivedVisibilityDate(task)
  }
}

export function shouldShowTaskInList(
  task: Pick<TaskVisibilityTask, 'hidden'>,
  _settings?: unknown,
  _todayDate?: string,
): boolean {
  return !task.hidden
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

  return isArchivedDateInRange(task, input)
}

export function shouldUnhideTask(
  task: TaskVisibilityTask,
  input: { mode: 'all' | 'range'; basis?: HiddenTaskDateBasis; todayDate: string; start?: string; end?: string },
): boolean {
  if (!task.hidden) {
    return false
  }

  if (input.mode !== 'range') {
    return true
  }

  const taskDate = resolveTaskDateByBasis(task, input.basis ?? 'archived')
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
