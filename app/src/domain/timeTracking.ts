import { Task, TimeSegment } from './types';

const minuteMs = 60_000;

function isOpen(segment: TimeSegment): boolean {
  return !segment.stopAt;
}

function createSegmentId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function parseDateKey(dateKey: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
    return null;
  }

  const date = new Date(`${dateKey}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function parseDateTime(dateKey: string, time: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey) || !/^\d{2}:\d{2}(:\d{2})?$/.test(time)) {
    return null;
  }

  const normalizedTime = time.length === 5 ? `${time}:00` : time;
  if (normalizedTime.slice(0, 2) > '23' || normalizedTime.slice(3, 5) > '59' || normalizedTime.slice(6, 8) > '59') {
    return null;
  }

  const date = new Date(`${dateKey}T${normalizedTime}`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function getDateRange(dateKey: string): { start: number; end: number } | null {
  const start = parseDateKey(dateKey);
  if (!start) {
    return null;
  }

  const end = new Date(start);
  end.setDate(end.getDate() + 1);

  return { start: start.getTime(), end: end.getTime() };
}

export function isTimerRunning(task: Task): boolean {
  return task.timerSegments.some(isOpen);
}

export function toggleTimer(task: Task, now: Date = new Date()): Task {
  const openSegment = [...task.timerSegments].reverse().find(isOpen);

  if (!openSegment) {
    return {
      ...task,
      timerSegments: [
        ...task.timerSegments,
        {
          id: `${now.getTime().toString(36)}-${Math.random().toString(36).slice(2, 10)}`,
          startAt: now.toISOString(),
          stopAt: null,
        },
      ],
      updatedAt: now.toISOString(),
    };
  }

  return {
    ...task,
    timerSegments: task.timerSegments.map((segment) => (
      segment.id === openSegment.id
        ? { ...segment, stopAt: now.toISOString() }
        : segment
    )),
    updatedAt: now.toISOString(),
  };
}

export function createTimeSegment(
  startDate: string,
  startTime: string,
  endDate: string,
  endTime: string,
): TimeSegment | null {
  const start = parseDateTime(startDate, startTime);
  const stop = parseDateTime(endDate, endTime);

  if (!start || !stop || stop.getTime() <= start.getTime()) {
    return null;
  }

  return {
    id: createSegmentId(),
    startAt: start.toISOString(),
    stopAt: stop.toISOString(),
  };
}

export function replaceTimeSegment(task: Task, segment: TimeSegment): Task {
  if (!segment.stopAt) {
    return task;
  }

  const start = new Date(segment.startAt);
  const stop = new Date(segment.stopAt);

  if (Number.isNaN(start.getTime()) || Number.isNaN(stop.getTime()) || stop <= start) {
    return task;
  }

  return {
    ...task,
    timerSegments: task.timerSegments.map((item) => (item.id === segment.id ? segment : item)),
    updatedAt: new Date().toISOString(),
  };
}

export function getTaskTimeSegmentsForDate(task: Task, dateKey: string): TimeSegment[] {
  const range = getDateRange(dateKey);
  if (!range) {
    return [];
  }

  return task.timerSegments.filter((segment) => {
    const start = new Date(segment.startAt).getTime();
    const stop = segment.stopAt ? new Date(segment.stopAt).getTime() : Date.now();
    return !Number.isNaN(start) && !Number.isNaN(stop) && start < range.end && stop > range.start;
  });
}

export function calculateTimeSegmentsDurationForDate(
  task: Task,
  dateKey: string,
  nowMs: number = Date.now(),
): number {
  const range = getDateRange(dateKey);
  if (!range) {
    return 0;
  }

  return task.timerSegments.reduce((total, segment) => {
    const start = new Date(segment.startAt).getTime();
    const stop = segment.stopAt ? new Date(segment.stopAt).getTime() : nowMs;
    const overlapStart = Math.max(start, range.start);
    const overlapEnd = Math.min(stop, range.end);

    if (Number.isNaN(start) || Number.isNaN(stop) || overlapEnd <= overlapStart) {
      return total;
    }

    return total + (overlapEnd - overlapStart);
  }, 0);
}

export function clearTimeSegmentsForDate(
  task: Task,
  dateKey: string,
  now: Date = new Date(),
): Task {
  const range = getDateRange(dateKey);
  if (!range) {
    return task;
  }

  const nextSegments: TimeSegment[] = [];

  for (const segment of task.timerSegments) {
    const start = new Date(segment.startAt).getTime();
    const stop = segment.stopAt ? new Date(segment.stopAt).getTime() : now.getTime();

    if (Number.isNaN(start) || Number.isNaN(stop) || start >= range.end || stop <= range.start) {
      nextSegments.push(segment);
      continue;
    }

    if (start < range.start) {
      const beforeEnd = Math.min(stop, range.start);
      if (beforeEnd > start) {
        nextSegments.push({
          id: segment.id,
          startAt: new Date(start).toISOString(),
          stopAt: new Date(beforeEnd).toISOString(),
        });
      }
    }

    if (stop > range.end) {
      const afterStart = Math.max(start, range.end);
      if (stop > afterStart) {
        nextSegments.push({
          id: `${segment.id}-after-${createSegmentId()}`,
          startAt: new Date(afterStart).toISOString(),
          stopAt: new Date(stop).toISOString(),
        });
      }
    }
  }

  return {
    ...task,
    timerSegments: nextSegments,
    updatedAt: now.toISOString(),
  };
}

export function resetTaskDuration(task: Task, now: Date = new Date()): Task {
  return {
    ...task,
    timerSegments: [],
    manualDurationMs: 0,
    updatedAt: now.toISOString(),
  };
}

export function calculateTaskDurationMs(task: Task, nowMs: number = Date.now()): number {
  const closed = task.timerSegments.reduce((total, segment) => {
    if (!segment.stopAt) {
      return total;
    }

    return total + Math.max(0, new Date(segment.stopAt).getTime() - new Date(segment.startAt).getTime());
  }, 0);
  const open = task.timerSegments
    .filter(isOpen)
    .reduce((total, segment) => total + Math.max(0, nowMs - new Date(segment.startAt).getTime()), 0);

  return Math.max(0, closed + open + Math.max(0, task.manualDurationMs));
}

export function formatDuration(durationMs: number): string {
  const totalSeconds = Math.max(0, Math.floor(durationMs / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return [hours, minutes, seconds]
    .map((value) => value.toString().padStart(2, '0'))
    .join(':');
}

export function parseDurationInput(input: string): number | null {
  const trimmed = input.trim();

  if (!trimmed) {
    return null;
  }

  if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(trimmed)) {
    const parts = trimmed.split(':').map(Number);
    const seconds = parts.length === 3 ? parts[2] : parts[1];
    const minutes = parts.length === 3 ? parts[1] : parts[0];
    const hours = parts.length === 3 ? parts[0] : 0;

    if (minutes > 59 || seconds > 59) {
      return null;
    }

    return ((hours * 60 + minutes) * 60 + seconds) * 1000;
  }

  if (/^\d+(?:\.\d+)?$/.test(trimmed)) {
    return Math.round(Number(trimmed) * (trimmed.includes('.') ? 60 * minuteMs : minuteMs));
  }

  const compact = trimmed.toLowerCase().replace(/\s+/g, '');
  const match = /^(?:(\d+(?:\.\d+)?)h)?(?:(\d+(?:\.\d+)?)m)?$/.exec(compact);

  if (!match || (!match[1] && !match[2])) {
    return null;
  }

  const hours = match[1] ? Number(match[1]) : 0;
  const minutes = match[2] ? Number(match[2]) : 0;

  return Math.round(hours * 60 * minuteMs + minutes * minuteMs);
}
