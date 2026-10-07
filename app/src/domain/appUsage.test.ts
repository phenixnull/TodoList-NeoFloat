import { describe, expect, it } from 'vitest';
import { mergeAppUsageSegments, shouldReplaceAppUsage, usageSegmentId } from './appUsage';
import { Task } from './types';

function task(overrides: Partial<Task> = {}): Task {
  return {
    id: 'task',
    name: 'Task',
    icon: 'target',
    color: '#22d3ee',
    description: '',
    sortOrder: 0,
    timerSegments: [],
    manualDurationMs: 0,
    createdAt: '2026-10-07T00:00:00.000Z',
    updatedAt: '2026-10-07T00:00:00.000Z',
    ...overrides,
  };
}

describe('app usage bindings', () => {
  it('creates stable segment ids and merges newer samples without duplicating starts', () => {
    const incoming = [
      { id: usageSegmentId('com.example.app', 1000), startAt: '1970-01-01T00:00:01.000Z', stopAt: null },
      { id: usageSegmentId('com.example.app', 2000), startAt: '1970-01-01T00:00:02.000Z', stopAt: '1970-01-01T00:00:03.000Z' },
    ];
    const merged = mergeAppUsageSegments([
      { id: incoming[1]!.id, startAt: incoming[1]!.startAt, stopAt: null },
      { id: 'old', startAt: '1969-12-31T00:00:00.000Z', stopAt: null },
    ], incoming);

    expect(merged.map((segment) => segment.id)).toEqual(['old', incoming[0]!.id, incoming[1]!.id]);
    expect(merged[1]?.stopAt).toBeNull();
    expect(merged[2]?.stopAt).toBe('1970-01-01T00:00:03.000Z');
  });

  it('detects binding replacement and unbinding so stale usage is not mixed into a new app', () => {
    const source = task({
      appUsageBinding: { packageName: 'com.old.app', appName: 'Old' },
      appUsageSegments: [{ id: 'a', startAt: '2026-10-07T01:00:00.000Z' }],
    });

    expect(shouldReplaceAppUsage(source, { packageName: 'com.new.app', appName: 'New' })).toBe(true);
    expect(shouldReplaceAppUsage(source, { packageName: 'com.old.app', appName: 'Renamed' })).toBe(false);
    expect(shouldReplaceAppUsage(source, null)).toBe(true);
    expect(shouldReplaceAppUsage(task(), null)).toBe(false);
  });
});
