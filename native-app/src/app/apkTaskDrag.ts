export type ApkTaskDragLayout = {
  id: string
  y: number
  height: number
}

export function moveDraggedTaskIds(taskIds: string[], activeId: string, targetIndex: number): string[] {
  const fromIndex = taskIds.indexOf(activeId)
  if (fromIndex < 0 || taskIds.length <= 1) {
    return taskIds
  }

  const nextIndex = Math.max(0, Math.min(targetIndex, taskIds.length - 1))
  if (nextIndex === fromIndex) {
    return taskIds
  }

  const nextTaskIds = [...taskIds]
  const [movedTaskId] = nextTaskIds.splice(fromIndex, 1)

  if (!movedTaskId) {
    return taskIds
  }

  nextTaskIds.splice(nextIndex, 0, movedTaskId)
  return nextTaskIds
}

export function resolveDraggedTaskIndex(
  layouts: ApkTaskDragLayout[],
  activeId: string,
  draggedCenterY: number,
): number {
  const orderedLayouts = [...layouts].sort((left, right) => left.y - right.y)
  if (!orderedLayouts.some((item) => item.id === activeId)) {
    return -1
  }

  const crossedMidpoints = orderedLayouts.reduce((count, item) => {
    if (item.id === activeId) {
      return count
    }

    return draggedCenterY > item.y + item.height / 2 ? count + 1 : count
  }, 0)

  return Math.max(0, Math.min(crossedMidpoints, orderedLayouts.length - 1))
}
