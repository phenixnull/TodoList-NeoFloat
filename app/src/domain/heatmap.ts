import { toLocalDateKey } from './streak';

export type HeatmapStatus = 'empty' | 'partial' | 'complete' | 'failed';

export type HeatmapDay = {
  date: string;
  completed?: boolean;
  failed?: boolean;
  durationMs?: number;
};

export type HeatmapCell = {
  date: string;
  count: number;
  status: HeatmapStatus;
  durationMs: number;
  intensity: number;
  level: 0 | 1 | 2 | 3 | 4;
};

type DateKey = string;

function parseDateKey(dateKey: DateKey): Date {
  return new Date(`${dateKey}T00:00:00`);
}

function addDays(date: Date, amount: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + amount);

  return result;
}

function clamp01(value: number): number {
  if (!Number.isFinite(value) || value < 0) return 0;
  if (value > 1) return 1;

  return value;
}

function intensityLevel(intensity: number, hasData: boolean): 0 | 1 | 2 | 3 | 4 {
  if (!hasData) return 0;
  if (intensity <= 0) return 1;
  if (intensity <= 0.25) return 2;
  if (intensity <= 0.5) return 3;

  return 4;
}

export function buildHeatmap(
  days: HeatmapDay[],
  weeks: number,
  today: DateKey,
): HeatmapCell[][] {
  const dayByKey = new Map<DateKey, HeatmapDay>();

  for (const day of days) {
    dayByKey.set(day.date, day);
  }

  const maxDurationMs = Math.max(
    0,
    ...[...dayByKey.values()].map((day) => day.durationMs ?? 0),
  );
  const totalDays = Math.max(1, weeks) * 7;
  const endDate = parseDateKey(today);
  const startDate = addDays(endDate, -(totalDays - 1));
  const grid: HeatmapCell[][] = [];

  for (let weekIndex = 0; weekIndex < Math.max(1, weeks); weekIndex += 1) {
    const week: HeatmapCell[] = [];

    for (let dayIndex = 0; dayIndex < 7; dayIndex += 1) {
      const date = addDays(startDate, weekIndex * 7 + dayIndex);
      const dateKey = toLocalDateKey(date);
      const day = dayByKey.get(dateKey);
      const completed = day?.completed ?? false;
      const failed = day?.failed ?? false;
      const durationMs = Math.max(0, day?.durationMs ?? 0);
      const hasData = completed || failed || durationMs > 0;
      const intensity = maxDurationMs > 0 ? clamp01(durationMs / maxDurationMs) : 0;
      const status: HeatmapStatus = completed
        ? 'complete'
        : failed
          ? 'failed'
          : durationMs > 0
          ? 'partial'
          : 'empty';

      week.push({
        date: dateKey,
        count: hasData ? 1 : 0,
        status,
        durationMs,
        intensity,
        level: intensityLevel(intensity, hasData),
      });
    }

    grid.push(week);
  }

  return grid;
}

export function getHeatmapCellStyle(
  cell: HeatmapCell,
  appearance: 'light' | 'dark' | 'system' = 'dark',
  systemColorScheme: string | null | undefined = null,
): {
  backgroundColor: string;
} {
  const isLight = appearance === 'light'
    || (appearance === 'system' && systemColorScheme === 'light');

  if (cell.status === 'empty') {
    return { backgroundColor: isLight ? 'rgba(15,23,42,0.08)' : 'rgba(2,6,23,0.78)' };
  }

  if (cell.status === 'failed') {
    return { backgroundColor: 'rgba(239,68,68,0.88)' };
  }

  const rgb = cell.status === 'complete' ? '34,197,94' : '56,189,248';
  const alpha = 0.24 + 0.76 * clamp01(cell.intensity);

  return { backgroundColor: `rgba(${rgb},${alpha.toFixed(3)})` };
}
