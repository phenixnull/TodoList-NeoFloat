import type { Task } from '../types/domain'

export function applyTaskDurationLayoutMode(
  tasks: Task[],
  taskIds: string[],
  layoutMode: Task['durationLayoutMode'],
  updatedAt: string,
): Task[] {
  const normalizedLayoutMode = layoutMode === 'inline' ? 'inline' : 'stacked'
  const targetIds = new Set(taskIds)

  if (targetIds.size === 0) {
    return tasks
  }

  return tasks.map((task) => {
    if (!targetIds.has(task.id)) {
      return task
    }

    if (task.durationLayoutMode === normalizedLayoutMode && task.showDuration !== false) {
      return task
    }

    return {
      ...task,
      durationLayoutMode: normalizedLayoutMode,
      showDuration: true,
      updatedAt,
    }
  })
}
