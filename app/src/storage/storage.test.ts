import { describe, expect, it } from 'vitest';
import { normalizeStoredData } from './storage';
import { Task } from '../domain/types';

describe('normalizeStoredData', () => {
  it('migrates legacy tasks and adds day records', () => {
    const result = normalizeStoredData({
      tasks: [{
        id: 'legacy',
        name: 'Legacy',
        icon: 'run',
        color: '#22d3ee',
        description: '',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
        deletedAt: null,
      } as Task],
      checkIns: [],
    });

    expect(result.tasks).toHaveLength(1);
    expect(result.tasks[0]).toMatchObject({
      sortOrder: 0,
      timerSegments: [],
      manualDurationMs: 0,
    });
    expect(result.dayRecords).toEqual([]);
  });
});
