import { describe, expect, it } from 'vitest';
import { mergeData } from './sync';
import { AppData, CheckIn, DayRecord, Task } from '../domain/types';

const settings = { syncEnabled: true, serverUrl: 'http://10.0.2.2:8787', lastSyncedAt: null };

const task = (id: string, updatedAt: string): Task => ({
  id,
  name: `Task ${id}`,
  icon: 'star',
  color: '#22d3ee',
  description: '',
  sortOrder: 0,
  timerSegments: [],
  manualDurationMs: 0,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt,
  deletedAt: null,
});

const checkIn = (id: string, taskId: string, date: string): CheckIn => ({
  id,
  taskId,
  date,
  createdAt: '2026-01-01T00:00:00.000Z',
});

const dayRecord = (note: string, updatedAt: string): DayRecord => ({
  taskId: 'task',
  date: '2026-10-02',
  note,
  image: null,
  images: [],
  createdAt: updatedAt,
  updatedAt,
});

describe('mergeData', () => {
  it('keeps the newest task version and unions task ids', () => {
    const local: AppData = {
      tasks: [task('old', '2026-01-02T00:00:00.000Z'), task('local-only', '2026-01-01T00:00:00.000Z')],
      checkIns: [],
      dayRecords: [],
      settings,
    };
    const remote: AppData = {
      tasks: [task('old', '2026-01-03T00:00:00.000Z'), task('remote-only', '2026-01-01T00:00:00.000Z')],
      checkIns: [],
      dayRecords: [],
      settings,
    };

    const result = mergeData(local, remote);

    expect(result.tasks.map((item) => item.id)).toEqual(['old', 'local-only', 'remote-only']);
    expect(result.tasks.find((item) => item.id === 'old')?.updatedAt).toBe('2026-01-03T00:00:00.000Z');
  });

  it('deduplicates check-ins by id and task/day', () => {
    const local: AppData = {
      tasks: [],
      checkIns: [checkIn('a', 'task', '2026-01-01'), checkIn('different-id', 'task', '2026-01-02')],
      dayRecords: [],
      settings,
    };
    const remote: AppData = {
      tasks: [],
      checkIns: [checkIn('a-copy', 'task', '2026-01-01'), checkIn('remote', 'task', '2026-01-03')],
      dayRecords: [],
      settings,
    };

    const result = mergeData(local, remote);

    expect(result.checkIns.map((item) => item.id)).toEqual(['a', 'different-id', 'remote']);
  });

  it('merges day records by task and date', () => {
    const local: AppData = {
      tasks: [],
      checkIns: [],
      dayRecords: [dayRecord('local', '2026-10-02T01:00:00.000Z')],
      settings,
    };
    const remote: AppData = {
      tasks: [],
      checkIns: [],
      dayRecords: [dayRecord('remote', '2026-10-02T02:00:00.000Z')],
      settings,
    };

    const result = mergeData(local, remote);

    expect(result.dayRecords).toHaveLength(1);
    expect(result.dayRecords[0]?.note).toBe('remote');
  });
});
