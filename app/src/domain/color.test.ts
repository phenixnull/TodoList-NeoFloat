import { describe, expect, it } from 'vitest';
import { getPulseColors } from './color';

describe('getPulseColors', () => {
  it('builds a task-specific gradient anchored by the main color', () => {
    const colors = getPulseColors('#22d3ee');

    expect(colors).toHaveLength(3);
    expect(colors[0]).toBe('#22d3ee');
    expect(colors[1]).not.toBe(colors[0]);
    expect(colors[2]).not.toBe(colors[0]);
    expect(colors.every((color) => /^#[0-9a-f]{6}$/i.test(color))).toBe(true);
  });

  it('returns safe colors for invalid input', () => {
    expect(getPulseColors('not-a-color')).toEqual(['#22d3ee', '#a78bfa', '#f472b6']);
  });
});
