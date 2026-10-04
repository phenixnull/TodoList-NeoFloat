import { Task } from './types';

export type TaskCompletionGroup = 'unfinished' | 'finished';

export type TaskGroups = {
  unfinished: Task[];
  finished: Task[];
};

export function matchesGroupFilter(task: Task, selectedGroups: string[]): boolean {
  if (selectedGroups.length === 0) return true;

  // Multiple selected groups form an intersection: a task must belong to
  // every selected drawer before it is shown.
  return selectedGroups.every((group) => task.customGroups?.includes(group));
}

function compareTasks(a: Task, b: Task): number {
  if (a.sortOrder !== b.sortOrder) {
    return a.sortOrder - b.sortOrder;
  }

  return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
}

export function getTaskGroups(tasks: Task[], completedTaskIds: Set<string>): TaskGroups {
  const active = tasks.filter((task) => !task.deletedAt);
  const unfinished = active
    .filter((task) => !completedTaskIds.has(task.id))
    .sort(compareTasks);
  const finished = active
    .filter((task) => completedTaskIds.has(task.id))
    .sort(compareTasks);

  return { unfinished, finished };
}

export function reorderTaskGroup(
  tasks: Task[],
  orderedIds: string[],
  group: TaskCompletionGroup,
  completedTaskIds: Set<string>,
  now: Date = new Date(),
): Task[] {
  const currentGroups = getTaskGroups(tasks, completedTaskIds);
  const expectedIds = new Set((group === 'unfinished' ? currentGroups.unfinished : currentGroups.finished).map((task) => task.id));
  const uniqueOrderedIds = [...new Set(orderedIds)];

  if (
    uniqueOrderedIds.length !== expectedIds.size ||
    uniqueOrderedIds.some((id) => !expectedIds.has(id))
  ) {
    return tasks;
  }

  const unfinishedIds = group === 'unfinished'
    ? uniqueOrderedIds
    : currentGroups.unfinished.map((task) => task.id);
  const finishedIds = group === 'finished'
    ? uniqueOrderedIds
    : currentGroups.finished.map((task) => task.id);
  const orderBy_id = new Map(
    [...unfinishedIds, ...finishedIds].map((id, index) => [id, index]),
  );

  const reordered = tasks.map((task) => {
    const sortOrder = orderBy_id.get(task.id);

    if (sortOrder === undefined || sortOrder === task.sortOrder) {
      return task;
    }

    return {
      ...task,
      sortOrder,
      updatedAt: now.toISOString(),
    };
  });

  return [
    ...reordered
      .filter((task) => !task.deletedAt)
      .sort((a, b) => a.sortOrder - b.sortOrder),
    ...reordered.filter((task) => task.deletedAt),
  ];
}
