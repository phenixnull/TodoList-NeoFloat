import { AppData, CheckIn, Task } from '../domain/types';
import { mergeDayRecords } from '../domain/dayRecords';

function mergeTasks(localTasks: Task[], remoteTasks: Task[]): Task[] {
  const byId = new Map<string, Task>();

  for (const task of [...localTasks, ...remoteTasks]) {
    const existing = byId.get(task.id);

    if (!existing || new Date(task.updatedAt) >= new Date(existing.updatedAt)) {
      byId.set(task.id, task);
    }
  }

  return [...byId.values()];
}

function mergeCheckIns(localCheckIns: CheckIn[], remoteCheckIns: CheckIn[]): CheckIn[] {
  const byId = new Map<string, CheckIn>();
  const byTaskDate = new Set<string>();
  const result: CheckIn[] = [];

  for (const checkIn of [...localCheckIns, ...remoteCheckIns]) {
    const taskDate = `${checkIn.taskId}:${checkIn.date}`;

    if (byId.has(checkIn.id) || byTaskDate.has(taskDate)) {
      continue;
    }

    byId.set(checkIn.id, checkIn);
    byTaskDate.add(taskDate);
    result.push(checkIn);
  }

  return result;
}

export function mergeData(local: AppData, remote: AppData): AppData {
  return {
    tasks: mergeTasks(local.tasks, remote.tasks),
    checkIns: mergeCheckIns(local.checkIns, remote.checkIns),
    dayRecords: mergeDayRecords(local.dayRecords ?? [], remote.dayRecords ?? []),
    deletedCheckIns: local.deletedCheckIns ?? [],
    settings: local.settings,
  };
}
