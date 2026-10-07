import { AppUsageBinding, Task, TimeSegment } from './types';

export function usageSegmentId(packageName: string, startAtMs: number): string {
  return `app-${packageName.replace(/[^a-z0-9.]/gi, '_')}-${startAtMs.toString(36)}`;
}

export function mergeAppUsageSegments(
  current: TimeSegment[] | undefined,
  incoming: TimeSegment[],
): TimeSegment[] {
  const byId = new Map((current ?? []).map((segment) => [segment.id, segment]));

  for (const segment of incoming) {
    byId.set(segment.id, segment);
  }

  return [...byId.values()]
    .filter((segment) => Number.isFinite(new Date(segment.startAt).getTime()))
    .sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime());
}

export function shouldReplaceAppUsage(
  task: Task,
  binding: AppUsageBinding | null | undefined,
): boolean {
  const current = task.appUsageBinding;
  if (!binding) return Boolean(current || (task.appUsageSegments?.length ?? 0) > 0);
  return current?.packageName !== binding.packageName;
}
