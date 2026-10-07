import { NativeModules, Platform } from 'react-native';
import { AppUsageBinding, TimeSegment } from '../domain/types';
import { usageSegmentId } from '../domain/appUsage';

type NativeAppUsageModule = {
  hasUsageAccess(): Promise<boolean>;
  openUsageAccessSettings(): Promise<void>;
  getInstalledApps(): Promise<AppUsageBinding[]>;
  getAppUsageSegments(
    packageName: string,
    startMs: number,
    endMs: number,
  ): Promise<{ startAt: string; stopAt: string | null }[]>;
};

const native = Platform.OS === 'android'
  ? (NativeModules.HabitPulseUsage as NativeAppUsageModule | undefined)
  : undefined;

export function isAppUsageSupported(): boolean {
  return Boolean(native);
}

export function hasUsageAccess(): Promise<boolean> {
  return native?.hasUsageAccess() ?? Promise.resolve(false);
}

export function openUsageAccessSettings(): Promise<void> {
  if (!native) throw new Error('当前设备不支持应用时长统计');
  return native.openUsageAccessSettings();
}

export function getInstalledApps(): Promise<AppUsageBinding[]> {
  if (!native) return Promise.resolve([]);
  return native.getInstalledApps();
}

export async function getAppUsageSegments(
  packageName: string,
  startMs: number,
  endMs: number,
): Promise<TimeSegment[]> {
  if (!native) return [];
  const rows = await native.getAppUsageSegments(packageName, startMs, endMs);

  return rows
    .filter((row) => Number.isFinite(new Date(row.startAt).getTime()))
    .map((row) => ({
      id: usageSegmentId(packageName, new Date(row.startAt).getTime()),
      startAt: row.startAt,
      stopAt: row.stopAt,
    }));
}
