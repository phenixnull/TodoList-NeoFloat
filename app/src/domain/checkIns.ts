import { CheckIn } from './types';

export type ToggleCheckInResult = {
  checkIns: CheckIn[];
  checkedIn: boolean;
  removedCheckIn?: CheckIn;
};

export function toggleCheckIn(
  checkIns: CheckIn[],
  taskId: string,
  dateKey: string,
  now: Date = new Date(),
): ToggleCheckInResult {
  const existing = checkIns.find((item) => item.taskId === taskId && item.date === dateKey);

  if (existing) {
    return {
      checkIns: checkIns.filter((item) => item.id !== existing.id),
      checkedIn: false,
      removedCheckIn: existing,
    };
  }

  return {
    checkIns: [
      ...checkIns,
      {
        id: `${now.getTime().toString(36)}-${Math.random().toString(36).slice(2, 10)}`,
        taskId,
        date: dateKey,
        createdAt: now.toISOString(),
      },
    ],
    checkedIn: true,
  };
}
