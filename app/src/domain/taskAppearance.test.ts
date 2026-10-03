import { describe, expect, it } from 'vitest';
import { getNextTaskAppearance, taskColors, taskIcons } from './taskAppearance';
import { Task } from './types';

function task(id: string): Task {
  return {
    id,
    name: id,
    icon: 'heart',
    color: '#22d3ee',
    description: '',
    sortOrder: 0,
    timerSegments: [],
    manualDurationMs: 0,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    deletedAt: null,
  };
}

describe('getNextTaskAppearance', () => {
  it('randomly avoids icons and colors used by the six most recent task cards', () => {
    const tasks = Array.from({ length: 6 }, (_, index) => ({
      ...task(String(index + 1)),
      icon: taskIcons[index],
      color: taskColors[index],
    }));

    const appearance = getNextTaskAppearance(tasks, () => 0);

    expect(taskIcons.slice(0, 6)).not.toContain(appearance.icon);
    expect(taskColors.slice(0, 6)).not.toContain(appearance.color);
  });

  it('falls back to a choice different from the immediately preceding card', () => {
    const tasks = taskIcons.map((icon, index) => ({
      ...task(String(index + 1)),
      icon,
      color: taskColors[index % taskColors.length],
    }));

    const appearance = getNextTaskAppearance(tasks, () => 0);

    expect(appearance.icon).not.toBe(taskIcons.at(-1));
    expect(appearance.color).not.toBe(taskColors[(taskIcons.length - 1) % taskColors.length]);
  });

  it('ignores deleted tasks', () => {
    const deleted = { ...task('1'), deletedAt: '2026-01-02T00:00:00.000Z' };

    const active = { ...task('active'), icon: 'heart', color: '#22d3ee' };

    expect(getNextTaskAppearance([active, deleted], () => 0)).toEqual(
      getNextTaskAppearance([active], () => 0),
    );
  });
});
