import { describe, expect, it } from 'vitest';
import { buildHeatmap, getHeatmapCellStyle, type HeatmapDay } from './heatmap';

function day(date: string, overrides: Partial<HeatmapDay> = {}): HeatmapDay {
  return {
    date,
    completed: false,
    durationMs: 0,
    ...overrides,
  };
}

describe('buildHeatmap', () => {
  it('returns an aligned grid of seven-day weeks ending on today', () => {
    const weeks = buildHeatmap(
      [day('2026-01-01', { completed: true })],
      2,
      '2026-01-04',
    );

    expect(weeks).toHaveLength(2);
    expect(weeks.at(-1)).toHaveLength(7);
    expect(weeks.flat().at(-1)?.date).toBe('2026-01-04');
  });

  it('marks days without a check-in or duration as empty', () => {
    const weeks = buildHeatmap([], 1, '2026-01-04');
    const today = weeks.flat().at(-1);

    expect(today?.status).toBe('empty');
    expect(today?.level).toBe(0);
  });

  it('marks untimed work as partial and checked-in work as complete', () => {
    const weeks = buildHeatmap(
      [
        day('2026-01-01', { durationMs: 30_000 }),
        day('2026-01-02', { completed: true, durationMs: 90_000 }),
      ],
      1,
      '2026-01-04',
    );
    const cells = weeks.flat().filter((cell) => cell.status !== 'empty');

    expect(cells[0]?.status).toBe('partial');
    expect(cells[1]?.status).toBe('complete');
  });

  it('normalizes duration intensity against the longest recorded day', () => {
    const weeks = buildHeatmap(
      [
        day('2026-01-01', { durationMs: 120_000 }),
        day('2026-01-02', { durationMs: 60_000 }),
        day('2026-01-03', { durationMs: 30_000 }),
      ],
      1,
      '2026-01-04',
    );
    const cells = weeks.flat().filter((cell) => cell.durationMs > 0);

    expect(cells[0]?.intensity).toBe(1);
    expect(cells[0]?.level).toBe(4);
    expect(cells[1]?.intensity).toBeCloseTo(0.5);
    expect(cells[1]?.level).toBe(3);
    expect(cells[2]?.intensity).toBeCloseTo(0.25);
    expect(cells[2]?.level).toBe(2);
  });

  it('gives a completed day with no duration the minimum visible level', () => {
    const weeks = buildHeatmap(
      [day('2026-01-04', { completed: true })],
      1,
      '2026-01-04',
    );
    const today = weeks.flat().at(-1);

    expect(today?.status).toBe('complete');
    expect(today?.intensity).toBe(0);
    expect(today?.level).toBe(1);
  });
});

describe('getHeatmapCellStyle', () => {
  const emptyCell = {
    date: '2026-01-01',
    count: 0,
    status: 'empty' as const,
    durationMs: 0,
    intensity: 0,
    level: 0 as const,
  };

  it('renders empty days black', () => {
    expect(getHeatmapCellStyle(emptyCell).backgroundColor).toBe(
      'rgba(2,6,23,0.78)',
    );
  });

  it('renders system light empty days with the light track color', () => {
    expect(getHeatmapCellStyle(emptyCell, 'system', 'light').backgroundColor).toBe(
      'rgba(15,23,42,0.08)',
    );
  });

  it('renders partial days blue with duration-based depth', () => {
    const half = getHeatmapCellStyle({
      ...emptyCell,
      status: 'partial',
      durationMs: 60_000,
      intensity: 0.5,
      level: 3,
    });
    const brightest = getHeatmapCellStyle({
      ...emptyCell,
      status: 'partial',
      durationMs: 120_000,
      intensity: 1,
      level: 4,
    });

    expect(half.backgroundColor).toBe('rgba(56,189,248,0.620)');
    expect(brightest.backgroundColor).toBe('rgba(56,189,248,1.000)');
  });

  it('renders complete days green with duration-based depth', () => {
    const style = getHeatmapCellStyle({
      ...emptyCell,
      status: 'complete',
      count: 1,
      durationMs: 30_000,
      intensity: 0.25,
      level: 2,
    });

    expect(style.backgroundColor).toBe('rgba(34,197,94,0.430)');
  });
});
