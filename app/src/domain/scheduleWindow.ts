import { CheckIn, ScheduleWindow, Task } from './types';

const HHMM_PATTERN = /^(\d{2}):(\d{2})$/;

function pad2(value: number): string {
  return value.toString().padStart(2, '0');
}

export function parseHHMM(value: string): { hour: number; minute: number } | null {
  const match = HHMM_PATTERN.exec(value);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return null;
  return { hour, minute };
}

export function formatHHMM(hour: number, minute: number): string {
  return `${pad2(hour)}:${pad2(minute)}`;
}

/** Does the window apply on the given local date? weekday uses 0=Sunday..6=Saturday. */
export function windowAppliesOn(
  win: ScheduleWindow | null | undefined,
  dateKey: string,
  weekday: number,
): boolean {
  if (!win) return false;
  if (win.repeat === 'daily') return true;
  if (win.repeat === 'weekly') return (win.weekdays ?? []).includes(weekday);
  if (win.repeat === 'once') return win.targetDate === dateKey;
  return false;
}

/** Absolute Date for a window boundary (start/end) on a local date. */
function boundaryDate(dateKey: string, hhmm: string): Date | null {
  const parsed = parseHHMM(hhmm);
  if (!parsed) return null;
  return new Date(`${dateKey}T${formatHHMM(parsed.hour, parsed.minute)}:00`);
}

export type WindowPhase = 'none' | 'before' | 'active' | 'after';

/** Phase of the task's window on a given date relative to now. */
export function getWindowPhase(
  task: Task,
  dateKey: string,
  weekday: number,
  now: Date,
): WindowPhase {
  const win = task.scheduleWindow;
  if (!windowAppliesOn(win, dateKey, weekday)) return 'none';
  const start = boundaryDate(dateKey, win!.start);
  const end = boundaryDate(dateKey, win!.end);
  if (!start || !end) return 'none';
  const t = now.getTime();
  if (t < start.getTime()) return 'before';
  if (t >= end.getTime()) return 'after';
  return 'active';
}

export type AutoFailure = {
  taskId: string;
  date: string;
};

/**
 * Find (task, date) pairs that should be auto-marked failed:
 * - daily/weekly tasks whose window applies today and whose end has passed;
 * - once tasks whose target date is today or earlier and whose end has passed;
 * and there is no successful (non-failed) check-in for that date.
 *
 * Daily/weekly history before today is intentionally not swept, so days the
 * user actually completed but did not record are not retroactively failed.
 */
export function findAutoFailures(
  tasks: Task[],
  checkIns: CheckIn[],
  now: Date,
  todayKey: string,
  todayWeekday: number,
): AutoFailure[] {
  const existingByKey = new Set<string>();
  for (const checkIn of checkIns) {
    // Any live check-in (success OR already-failed) means the date is settled.
    existingByKey.add(`${checkIn.taskId}|${checkIn.date}`);
  }

  const failures: AutoFailure[] = [];

  for (const task of tasks) {
    const win = task.scheduleWindow;
    if (!win || task.deletedAt) continue;

    let candidateDate: string;
    if (win.repeat === 'once') {
      if (!win.targetDate || win.targetDate > todayKey) continue;
      candidateDate = win.targetDate;
    } else {
      if (!windowAppliesOn(win, todayKey, todayWeekday)) continue;
      candidateDate = todayKey;
    }

    const end = boundaryDate(candidateDate, win.end);
    if (!end || now.getTime() < end.getTime()) continue;
    if (existingByKey.has(`${task.id}|${candidateDate}`)) continue;

    failures.push({ taskId: task.id, date: candidateDate });
  }

  return failures;
}
