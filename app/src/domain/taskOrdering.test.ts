import { describe, expect, it } from 'vitest';
import { getAvailableTaskGroups, getTaskGroups, matchesGroupFilter, reorderTaskGroup } from './taskOrdering';
import { Task } from './types';

function task(id: string, sortOrder: number): Task {
  return {
    id,
    name: id,
    icon: 'run',
    color: '#22d3ee',
    description: '',
    sortOrder,
    timerSegments: [],
    manualDurationMs: 0,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    deletedAt: null,
  };
}

describe('task ordering', () => {
  it('puts unfinished tasks above finished tasks', () => {
    const groups = getTaskGroups([task('a', 3), task('b', 1)], new Set(['a']));

    expect(groups.unfinished.map((item) => item.id)).toEqual(['b']);
    expect(groups.finished.map((item) => item.id)).toEqual(['a']);
  });

  it('sorts each group by sortOrder and ignores deleted tasks', () => {
    const groups = getTaskGroups([
      task('a', 3),
      task('b', 1),
      { ...task('deleted', 0), deletedAt: '2026-01-02T00:00:00.000Z' },
    ], new Set(['b']));

    expect(groups.unfinished.map((item) => item.id)).toEqual(['a']);
    expect(groups.finished.map((item) => item.id)).toEqual(['b']);
  });

  it('reorders only the selected completion group', () => {
    const tasks = [task('a', 1), task('b', 2), task('x', 3), task('y', 4)];
    const result = reorderTaskGroup(tasks, ['b', 'a'], 'unfinished', new Set(['x', 'y']));

    expect(result.map((item) => [item.id, item.sortOrder])).toEqual([
      ['b', 0],
      ['a', 1],
      ['x', 2],
      ['y', 3],
    ]);
  });

  it('rejects an ordered id from another completion group', () => {
    const tasks = [task('a', 1), task('done', 2)];

    expect(reorderTaskGroup(tasks, ['done', 'a'], 'unfinished', new Set(['done']))).toEqual(tasks);
  });

  it('reorders the finished group while keeping it below unfinished tasks', () => {
    const tasks = [task('a', 0), task('done-a', 1), task('done-b', 2)];
    const result = reorderTaskGroup(tasks, ['done-b', 'done-a'], 'finished', new Set(['done-a', 'done-b']));

    expect(result.map((item) => [item.id, item.sortOrder])).toEqual([
      ['a', 0],
      ['done-b', 1],
      ['done-a', 2],
    ]);
  });

  it('uses intersection semantics when multiple drawer groups are selected', () => {
    const both = { ...task('both', 0), customGroups: ['日常打卡', '学习打卡'] };
    const dailyOnly = { ...task('daily', 1), customGroups: ['日常打卡'] };
    const studyOnly = { ...task('study', 2), customGroups: ['学习打卡'] };
    const none = task('none', 3);

    expect(matchesGroupFilter(both, ['日常打卡', '学习打卡'])).toBe(true);
    expect(matchesGroupFilter(dailyOnly, ['日常打卡', '学习打卡'])).toBe(false);
    expect(matchesGroupFilter(studyOnly, ['日常打卡', '学习打卡'])).toBe(false);
    expect(matchesGroupFilter(none, ['日常打卡', '学习打卡'])).toBe(false);
    expect(matchesGroupFilter(dailyOnly, [])).toBe(true);
  });

  it('collects drawer options from settings and every active task', () => {
    const groups = getAvailableTaskGroups(
      ['学习打卡'],
      [
        { ...task('daily', 0), customGroups: ['日常打卡'] },
        { ...task('hidden', 1), customGroups: ['历史分组'], deletedAt: '2026-01-02T00:00:00.000Z' },
        task('none', 2),
      ],
    );

    expect(groups).toEqual(['学习打卡', '日常打卡']);
  });
});
