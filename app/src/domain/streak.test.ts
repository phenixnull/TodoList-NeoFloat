import { describe, expect, it } from 'vitest';
import { computeStats } from './streak';

describe('computeStats', () => {
  it('counts unique lifetime check-ins', () => {
    const stats = computeStats(['2026-01-01', '2026-01-01', '2026-01-03'], '2026-01-04');

    expect(stats.total).toBe(2);
  });

  it('continues a streak when today is checked in', () => {
    const stats = computeStats(['2026-01-01', '2026-01-02', '2026-01-03'], '2026-01-03');

    expect(stats.current).toBe(3);
    expect(stats.longest).toBe(3);
  });

  it('keeps yesterday alive but does not count today before check-in', () => {
    const stats = computeStats(['2026-01-01', '2026-01-02'], '2026-01-03');

    expect(stats.current).toBe(2);
    expect(stats.longest).toBe(2);
  });

  it('breaks the streak when the last check-in is older than yesterday', () => {
    const stats = computeStats(['2026-01-01'], '2026-01-03');

    expect(stats.current).toBe(0);
    expect(stats.longest).toBe(1);
  });
});
