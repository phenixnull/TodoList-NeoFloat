export type HabitStats = {
  total: number;
  current: number;
  longest: number;
};

export function toLocalDateKey(value: Date): string {
  const year = value.getFullYear().toString().padStart(4, '0');
  const month = (value.getMonth() + 1).toString().padStart(2, '0');
  const day = value.getDate().toString().padStart(2, '0');

  return `${year}-${month}-${day}`;
}

export function getTodayKey(now: Date = new Date()): string {
  return toLocalDateKey(now);
}

function parseDateKey(dateKey: string): Date {
  return new Date(`${dateKey}T00:00:00`);
}

function addDays(date: Date, amount: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + amount);

  return result;
}

export function computeStats(inputDates: string[], today: string): HabitStats {
  const dates = [...new Set(inputDates)].sort();
  const dateSet = new Set(dates);
  const total = dates.length;

  let current = 0;
  const todayChecked = dateSet.has(today);
  const yesterday = toLocalDateKey(addDays(parseDateKey(today), -1));
  const streakAnchor = todayChecked ? today : dateSet.has(yesterday) ? yesterday : null;

  if (streakAnchor) {
    let cursor = parseDateKey(streakAnchor);

    while (dateSet.has(toLocalDateKey(cursor))) {
      current += 1;
      cursor = addDays(cursor, -1);
    }
  }

  let longest = 0;
  let run = 0;
  let previous: Date | null = null;

  for (const dateKey of dates) {
    const date = parseDateKey(dateKey);

    if (previous && toLocalDateKey(addDays(previous, 1)) === dateKey) {
      run += 1;
    } else {
      run = 1;
    }

    longest = Math.max(longest, run);
    previous = date;
  }

  return { total, current, longest };
}
