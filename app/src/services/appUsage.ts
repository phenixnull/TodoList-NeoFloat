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
  startUsageTracking(configJson: string): Promise<boolean>;
  stopUsageTracking(): Promise<boolean>;
  isUsageTrackingActive(): Promise<boolean>;
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

export function startUsageTracking(
  serverUrl: string,
  samples: { taskId: string; packageName: string }[],
): Promise<boolean> {
  if (!native) return Promise.resolve(false);
  return native.startUsageTracking(JSON.stringify({ serverUrl, samples }));
}

export function stopUsageTracking(): Promise<boolean> {
  if (!native) return Promise.resolve(true);
  return native.stopUsageTracking();
}
