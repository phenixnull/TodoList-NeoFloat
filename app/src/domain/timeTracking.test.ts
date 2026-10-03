import { describe, expect, it } from 'vitest';
import {
  calculateTaskDurationMs,
  calculateTimeSegmentsDurationForDate,
  clearTimeSegmentsForDate,
  createTimeSegment,
  formatDuration,
  getTaskTimeSegmentsForDate,
  isTimerRunning,
  parseDurationInput,
  replaceTimeSegment,
  resetTaskDuration,
  setTaskTotalDuration,
  toggleTimer,
} from './timeTracking';
import { Task } from './types';

function task(overrides: Partial<Task> = {}): Task {
  return {
    id: 'task',
    name: 'Task',
    icon: 'run',
    color: '#22d3ee',
    description: '',
    sortOrder: 0,
    timerSegments: [],
    manualDurationMs: 0,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    deletedAt: null,
    ...overrides,
  };
}

describe('time tracking', () => {
  it('starts and stops timer segments', () => {
    const started = toggleTimer(task(), new Date('2026-10-02T08:00:00Z'));
    const stopped = toggleTimer(started, new Date('2026-10-02T09:01:30Z'));

    expect(started.timerSegments).toHaveLength(1);
    expect(started.timerSegments[0]?.stopAt).toBeNull();
    expect(stopped.timerSegments[0]?.stopAt).toBe('2026-10-02T09:01:30.000Z');
    expect(isTimerRunning(stopped)).toBe(false);
  });

  it('adds closed, live, and manual durations', () => {
    const source = task({
      manualDurationMs: 60_000,
      timerSegments: [
        {
          id: 'closed',
          startAt: '2026-10-02T08:00:00Z',
          stopAt: '2026-10-02T08:10:00Z',
        },
        {
          id: 'live',
          startAt: '2026-10-02T09:00:00Z',
          stopAt: null,
        },
      ],
    });

    expect(calculateTaskDurationMs(source, Date.parse('2026-10-02T09:02:30Z')))
      .toBe((10 + 2.5) * 60_000 + 60_000);
  });

  it('attributes overnight segments to each local date and keeps live time current', () => {
    const source = task({
      timerSegments: [
        {
          id: 'overnight',
          startAt: '2026-10-01T23:00:00',
          stopAt: '2026-10-02T01:00:00',
        },
        {
          id: 'live',
          startAt: '2026-10-02T02:00:00',
          stopAt: null,
        },
      ],
    });

    expect(getTaskTimeSegmentsForDate(source, '2026-10-01')).toHaveLength(1);
    expect(getTaskTimeSegmentsForDate(source, '2026-10-02')).toHaveLength(2);
    expect(calculateTimeSegmentsDurationForDate(
      source,
      '2026-10-01',
      Date.parse('2026-10-02T03:00:00'),
    )).toBe(60 * 60_000);
    expect(calculateTimeSegmentsDurationForDate(
      source,
      '2026-10-02',
      Date.parse('2026-10-02T03:00:00'),
    )).toBe(2 * 60 * 60_000);
  });

  it('creates, validates, and replaces editable segments', () => {
    const created = createTimeSegment('2026-10-02', '08:00', '2026-10-02', '09:30');

    if (!created) {
      throw new Error('Expected a valid segment');
    }

    const segment = created;
    const source = task({ timerSegments: [segment] });
    const updated = replaceTimeSegment(source, {
      ...segment,
      stopAt: new Date('2026-10-02T10:15:00').toISOString(),
    });

    expect(segment.stopAt).toBe(new Date('2026-10-02T09:30:00').toISOString());
    expect(calculateTaskDurationMs(updated)).toBe(135 * 60_000);
  });

  it('clears one date without damaging adjacent-day time and can reset all usage', () => {
    const source = task({
      manualDurationMs: 5 * 60_000,
      timerSegments: [
        {
          id: 'before',
          startAt: '2026-10-01T20:00:00',
          stopAt: '2026-10-02T01:00:00',
        },
        {
          id: 'only-this-day',
          startAt: '2026-10-02T08:00:00',
          stopAt: '2026-10-02T09:00:00',
        },
      ],
    });
    const cleared = clearTimeSegmentsForDate(source, '2026-10-02');
    const reset = resetTaskDuration(cleared);

    expect(cleared.timerSegments).toHaveLength(1);
    expect(cleared.timerSegments[0]).toEqual({
      id: 'before',
      startAt: new Date('2026-10-01T20:00:00').toISOString(),
      stopAt: new Date('2026-10-02T00:00:00').toISOString(),
    });
    expect(reset.timerSegments).toHaveLength(0);
    expect(reset.manualDurationMs).toBe(0);
    expect(reset.removedSegmentIds).toEqual(['before', 'only-this-day']);
  });

  it('sets total duration without changing segments when the target is large enough', () => {
    const source = task({
      timerSegments: [
        { id: 'a', startAt: '2026-10-02T08:00:00Z', stopAt: '2026-10-02T08:30:00Z' },
        { id: 'b', startAt: '2026-10-02T09:00:00Z', stopAt: '2026-10-02T10:00:00Z' },
      ],
    });

    const updated = setTaskTotalDuration(source, 120 * 60_000, new Date('2026-10-02T12:00:00Z'));
    expect(updated.timerSegments).toEqual(source.timerSegments);
    expect(updated.removedSegmentIds).toEqual([]);
    expect(updated.manualDurationMs).toBe(30 * 60_000);
  });

  it('trims the newest segment first when the target is smaller than segment time', () => {
    const source = task({
      timerSegments: [
        { id: 'a', startAt: '2026-10-02T08:00:00Z', stopAt: '2026-10-02T08:30:00Z' },
        { id: 'b', startAt: '2026-10-02T09:00:00Z', stopAt: '2026-10-02T10:00:00Z' },
      ],
    });

    const trimmed = setTaskTotalDuration(source, 75 * 60_000, new Date('2026-10-02T12:00:00Z'));
    expect(trimmed.timerSegments).toEqual([
      source.timerSegments[0],
      { id: 'b', startAt: '2026-10-02T09:00:00Z', stopAt: '2026-10-02T09:45:00.000Z' },
    ]);
    expect(trimmed.removedSegmentIds).toEqual([]);
    expect(trimmed.manualDurationMs).toBe(0);

    const partiallyDeleted = setTaskTotalDuration(source, 20 * 60_000, new Date('2026-10-02T12:00:00Z'));
    expect(partiallyDeleted.timerSegments).toEqual([
      { id: 'a', startAt: '2026-10-02T08:00:00Z', stopAt: '2026-10-02T08:20:00.000Z' },
    ]);
    expect(partiallyDeleted.removedSegmentIds).toEqual(['b']);

    const cleared = setTaskTotalDuration(source, 0, new Date('2026-10-02T12:00:00Z'));
    expect(cleared.timerSegments).toEqual([]);
    expect(cleared.removedSegmentIds).toEqual(['a', 'b']);
    expect(cleared.manualDurationMs).toBe(0);
  });

  it('locks a live timer before applying a total-duration target', () => {
    const source = task({
      timerSegments: [
        { id: 'closed', startAt: '2026-10-02T08:00:00Z', stopAt: '2026-10-02T08:30:00Z' },
        { id: 'live', startAt: '2026-10-02T09:00:00Z', stopAt: null },
      ],
    });

    const updated = setTaskTotalDuration(source, 70 * 60_000, new Date('2026-10-02T09:10:00Z'));
    expect(isTimerRunning(updated)).toBe(false);
    expect(updated.timerSegments).toEqual([
      source.timerSegments[0],
      { id: 'live', startAt: '2026-10-02T09:00:00Z', stopAt: '2026-10-02T09:10:00.000Z' },
    ]);
    expect(updated.manualDurationMs).toBe(30 * 60_000);
  });

  it('formats duration as HH:mm:ss', () => {
    expect(formatDuration(0)).toBe('00:00:00');
    expect(formatDuration(3_723_000)).toBe('01:02:03');
  });

  it('parses minutes, hours, compact units, and clock durations', () => {
    expect(parseDurationInput('30')).toBe(30 * 60_000);
    expect(parseDurationInput('1.5')).toBe(90 * 60_000);
    expect(parseDurationInput('20m')).toBe(20 * 60_000);
    expect(parseDurationInput('1h 30m')).toBe(90 * 60_000);
    expect(parseDurationInput('01:02:03')).toBe(3_723_000);
    expect(parseDurationInput('02:03')).toBe(123_000);
    expect(parseDurationInput('bad')).toBeNull();
  });
});
