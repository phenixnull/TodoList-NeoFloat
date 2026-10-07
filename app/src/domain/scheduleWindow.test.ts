import { describe, expect, it } from 'vitest';
import { CheckIn, ScheduleWindow, Task } from './types';
import {
  findAutoFailures,
  formatHHMM,
  getWindowPhase,
  parseHHMM,
  windowAppliesOn,
} from './scheduleWindow';

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 'task-1',
    name: '吃早饭',
    icon: 'egg',
    color: '#22d3ee',
    description: '',
    sortOrder: 0,
    timerSegments: [],
    manualDurationMs: 0,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function checkIn(
  taskId: string,
  date: string,
  status: CheckIn['status'] = undefined,
): CheckIn {
  return {
    id: `${taskId}-${date}`,
    taskId,
    date,
    createdAt: `${date}T07:30:00.000Z`,
    status,
  };
}

describe('parseHHMM / formatHHMM', () => {
  it('parses valid times', () => {
    expect(parseHHMM('07:05')).toEqual({ hour: 7, minute: 5 });
    expect(parseHHMM('23:59')).toEqual({ hour: 23, minute: 59 });
  });

  it('rejects invalid times', () => {
    expect(parseHHMM('7:00')).toBeNull();
    expect(parseHHMM('24:00')).toBeNull();
    expect(parseHHMM('12:60')).toBeNull();
    expect(parseHHMM('ab')).toBeNull();
  });

  it('formats with zero padding', () => {
    expect(formatHHMM(7, 5)).toBe('07:05');
  });
});

describe('windowAppliesOn', () => {
  it('daily always applies', () => {
    const win: ScheduleWindow = { start: '07:00', end: '08:00', repeat: 'daily' };
    expect(windowAppliesOn(win, '2026-10-07', 3)).toBe(true);
  });

  it('weekly only on selected weekdays', () => {
    const win: ScheduleWindow = {
      start: '07:00',
      end: '08:00',
      repeat: 'weekly',
      weekdays: [1, 3, 5],
    };
    expect(windowAppliesOn(win, '2026-10-07', 1)).toBe(true);
    expect(windowAppliesOn(win, '2026-10-07', 2)).toBe(false);
  });

  it('once only on target date', () => {
    const win: ScheduleWindow = {
      start: '07:00',
      end: '08:00',
      repeat: 'once',
      targetDate: '2026-10-09',
    };
    expect(windowAppliesOn(win, '2026-10-09', 5)).toBe(true);
    expect(windowAppliesOn(win, '2026-10-08', 4)).toBe(false);
  });

  it('null window never applies', () => {
    expect(windowAppliesOn(null, '2026-10-07', 3)).toBe(false);
  });
});

describe('getWindowPhase', () => {
  const win: ScheduleWindow = { start: '07:00', end: '08:00', repeat: 'daily' };
  const task = makeTask({ scheduleWindow: win });

  it('reports before/active/after', () => {
    expect(getWindowPhase(task, '2026-10-07', 3, new Date('2026-10-07T06:59:00'))).toBe('before');
    expect(getWindowPhase(task, '2026-10-07', 3, new Date('2026-10-07T07:30:00'))).toBe('active');
    expect(getWindowPhase(task, '2026-10-07', 3, new Date('2026-10-07T08:00:00'))).toBe('after');
    expect(getWindowPhase(task, '2026-10-07', 3, new Date('2026-10-07T09:00:00'))).toBe('after');
  });

  it('reports none when window does not apply', () => {
    const weekly: ScheduleWindow = {
      start: '07:00',
      end: '08:00',
      repeat: 'weekly',
      weekdays: [1],
    };
    const t = makeTask({ scheduleWindow: weekly });
    expect(getWindowPhase(t, '2026-10-07', 2, new Date('2026-10-07T09:00:00'))).toBe('none');
  });
});

describe('findAutoFailures', () => {
  const daily: ScheduleWindow = { start: '07:00', end: '08:00', repeat: 'daily' };
  const today = '2026-10-07';
  // 2026-10-07 is a Wednesday = weekday 3.
  const weekday = 3;

  it('auto-fails a daily task past its end with no check-in', () => {
    const tasks = [makeTask({ scheduleWindow: daily })];
    const now = new Date('2026-10-07T08:30:00');
    expect(findAutoFailures(tasks, [], now, today, weekday)).toEqual([
      { taskId: 'task-1', date: today },
    ]);
  });

  it('does not fail before the end', () => {
    const tasks = [makeTask({ scheduleWindow: daily })];
    expect(findAutoFailures(tasks, [], new Date('2026-10-07T07:59:00'), today, weekday)).toEqual([]);
    expect(findAutoFailures(tasks, [], new Date('2026-10-07T07:30:00'), today, weekday)).toEqual([]);
  });

  it('does not fail when already checked in', () => {
    const tasks = [makeTask({ scheduleWindow: daily })];
    const checkIns = [checkIn('task-1', today)];
    expect(findAutoFailures(tasks, checkIns, new Date('2026-10-07T09:00:00'), today, weekday)).toEqual([]);
  });

  it('does not re-sweep an already-failed check-in', () => {
    const tasks = [makeTask({ scheduleWindow: daily })];
    const checkIns = [checkIn('task-1', today, 'failed')];
    expect(findAutoFailures(tasks, checkIns, new Date('2026-10-07T09:00:00'), today, weekday)).toEqual([]);
  });

  it('respects weekly weekday selection', () => {
    const win: ScheduleWindow = {
      start: '07:00',
      end: '08:00',
      repeat: 'weekly',
      weekdays: [1],
    };
    const tasks = [makeTask({ scheduleWindow: win })];
    const now = new Date('2026-10-07T09:00:00');
    expect(findAutoFailures(tasks, [], now, today, 3)).toEqual([]);
    expect(findAutoFailures(tasks, [], now, today, 1)).toEqual([{ taskId: 'task-1', date: today }]);
  });

  it('sweeps an expired once task and skips future ones', () => {
    const past: ScheduleWindow = {
      start: '07:00',
      end: '08:00',
      repeat: 'once',
      targetDate: '2026-10-01',
    };
    const future: ScheduleWindow = {
      start: '07:00',
      end: '08:00',
      repeat: 'once',
      targetDate: '2026-10-20',
    };
    const tasks = [makeTask({ id: 'past', scheduleWindow: past }), makeTask({ id: 'future', scheduleWindow: future })];
    const now = new Date('2026-10-07T09:00:00');
    expect(findAutoFailures(tasks, [], now, today, weekday)).toEqual([
      { taskId: 'past', date: '2026-10-01' },
    ]);
  });

  it('ignores deleted tasks', () => {
    const tasks = [makeTask({ scheduleWindow: daily, deletedAt: '2026-10-01T00:00:00.000Z' })];
    expect(findAutoFailures(tasks, [], new Date('2026-10-07T09:00:00'), today, weekday)).toEqual([]);
  });
});
