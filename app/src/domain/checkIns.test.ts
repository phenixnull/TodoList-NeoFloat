import { describe, expect, it } from 'vitest';
import { toggleCheckIn } from './checkIns';
import { CheckIn } from './types';

const checkIn: CheckIn = {
  id: 'check-in',
  taskId: 'task',
  date: '2026-10-02',
  createdAt: '2026-10-02T01:20:00.000Z',
};

describe('toggleCheckIn', () => {
  it('creates a check-in with the current timestamp', () => {
    const result = toggleCheckIn([], 'task', '2026-10-02', new Date('2026-10-02T09:30:00.000Z'));

    expect(result.checkedIn).toBe(true);
    expect(result.checkIns).toHaveLength(1);
    expect(result.checkIns[0].createdAt).toBe('2026-10-02T09:30:00.000Z');
  });

  it('removes the existing check-in so the card returns to unchecked', () => {
    const result = toggleCheckIn([checkIn], 'task', '2026-10-02');

    expect(result.checkedIn).toBe(false);
    expect(result.removedCheckIn).toEqual(checkIn);
    expect(result.checkIns).toHaveLength(0);
  });

  it('does not remove check-ins for another task or date', () => {
    const result = toggleCheckIn([checkIn], 'other-task', '2026-10-02');

    expect(result.checkedIn).toBe(true);
    expect(result.checkIns).toEqual([checkIn, expect.objectContaining({ taskId: 'other-task' })]);
  });
});
