import { describe, expect, it } from 'vitest';
import { formatCheckInTime } from './format';

describe('formatCheckInTime', () => {
  it('shows a short 24-hour time', () => {
    expect(formatCheckInTime('2026-10-02T09:07:00.000Z')).toMatch(/^\d{2}:\d{2}$/);
  });

  it('ignores invalid timestamps', () => {
    expect(formatCheckInTime('invalid')).toBeNull();
    expect(formatCheckInTime(undefined)).toBeNull();
  });
});
