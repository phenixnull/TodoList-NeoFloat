type OrderedTaskLike = {
  id: string
  order: number
  updatedAt?: string
}

export function applyTaskOrder<T extends OrderedTaskLike>(tasks: T[], orderedIds: string[], updatedAt: string): T[] {
  const orderedTasks = [...tasks].sort((a, b) => a.order - b.order)
  const taskById = new Map(orderedTasks.map((task) => [task.id, task]))
  const visibleIds = new Set<string>()
  const reorderedVisibleTasks: T[] = []

  orderedIds.forEach((id) => {
    if (visibleIds.has(id)) {
      return
    }

    const task = taskById.get(id)
    if (!task) {
      return
    }

    visibleIds.add(id)
    reorderedVisibleTasks.push(task)
  })

  let reorderedIndex = 0
  const nextTasks = orderedTasks.map((task) => {
    if (!visibleIds.has(task.id)) {
      return task
    }

    const nextTask = reorderedVisibleTasks[reorderedIndex]
    reorderedIndex += 1
    return nextTask
  })

  return nextTasks.map((task, index) => ({
    ...task,
    order: index + 1,
    updatedAt,
  }))
}
