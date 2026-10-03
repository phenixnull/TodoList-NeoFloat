import { describe, expect, it } from 'vitest';
import { getDayRecordKey, mergeDayRecord, mergeDayRecords } from './dayRecords';
import { DayRecord } from './types';

const base: DayRecord = {
  taskId: 'task',
  date: '2026-10-02',
  note: 'local',
  image: null,
  images: [],
  createdAt: '2026-10-02T01:00:00.000Z',
  updatedAt: '2026-10-02T01:00:00.000Z',
};

describe('day records', () => {
  it('creates a stable task/date key', () => {
    expect(getDayRecordKey(base)).toBe('task:2026-10-02');
  });

  it('keeps the newer record', () => {
    const remote = { ...base, note: 'remote', updatedAt: '2026-10-02T02:00:00.000Z' };

    expect(mergeDayRecord(base, remote).note).toBe('remote');
  });

  it('preserves a local image URI when remote metadata is the same image', () => {
    const local = {
      ...base,
      image: {
        fileName: '2026-10-02.jpg',
        width: 100,
        height: 100,
        mimeType: 'image/jpeg',
        localUri: 'file:///local/2026-10-02.jpg',
      },
    };
    const remote = {
      ...base,
      note: 'remote',
      updatedAt: '2026-10-02T02:00:00.000Z',
      image: {
        fileName: '2026-10-02.jpg',
        width: 100,
        height: 100,
        mimeType: 'image/jpeg',
        localUri: null,
      },
    };

    const merged = mergeDayRecord(local, remote);

    expect(merged.note).toBe('remote');
    expect(merged.image?.localUri).toBe(local.image?.localUri);
  });

  it('deduplicates records by task and date', () => {
    const result = mergeDayRecords([base], [{ ...base, note: 'remote', updatedAt: '2026-10-02T02:00:00.000Z' }]);

    expect(result).toHaveLength(1);
    expect(result[0]?.note).toBe('remote');
  });
});
