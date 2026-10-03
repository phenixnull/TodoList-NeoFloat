import { Task } from './types';

export const taskIcons = [
  'run',
  'walk',
  'dumbbell',
  'yoga',
  'basketball',
  'soccer',
  'tennis-ball',
  'book-open-variant',
  'book-outline',
  'notebook-outline',
  'lead-pencil',
  'fountain-pen',
  'calendar-check',
  'clock-outline',
  'alarm',
  'timer-sand',
  'code-braces',
  'laptop',
  'robot-outline',
  'brain',
  'math-log',
  'flask',
  'school',
  'translate',
  'music',
  'headphones',
  'piano',
  'microphone',
  'movie-open-outline',
  'camera-outline',
  'brush',
  'palette-outline',
  'leaf',
  'sprout',
  'flower',
  'water',
  'coffee',
  'food-apple',
  'heart-pulse',
  'heart',
  'pill',
  'sleep',
  'moon-waxing-crescent',
  'weather-sunny',
  'target',
  'trophy-outline',
  'fire',
  'cash-multiple',
  'airplane-takeoff',
  'gamepad-variant-outline',
] as const;

export const taskColors = [
  '#22d3ee',
  '#a78bfa',
  '#f97316',
  '#34d399',
  '#f472b6',
  '#facc15',
  '#60a5fa',
  '#fb7185',
  '#c084fc',
  '#2dd4bf',
  '#fbbf24',
  '#4ade80',
] as const;

export type TaskAppearance = {
  icon: string;
  color: string;
};

export function getNextTaskAppearance(
  tasks: Task[],
  random: () => number = Math.random,
): TaskAppearance {
  const activeTasks = tasks.filter((task) => !task.deletedAt);
  const recentTasks = activeTasks.slice(-6);
  const previousTask = activeTasks.at(-1);

    const pickAvoidingRecent = <T>(values: readonly T[], valueOf: (task: Task) => T): T => {
    const recentValues = new Set(recentTasks.map(valueOf));
    let candidates = values.filter((value) => !recentValues.has(value));

    if (candidates.length === 0 && previousTask) {
      const previousValue = valueOf(previousTask);
      candidates = values.filter((value) => value !== previousValue);
    }

    if (candidates.length === 0) {
      candidates = [...values];
    }

    const index = Math.floor(random() * candidates.length);
    return candidates[Math.min(index, candidates.length - 1)]!;
  };

  return {
    icon: pickAvoidingRecent(taskIcons, (task) => task.icon),
    color: pickAvoidingRecent(taskColors, (task) => task.color),
  };
}
