import { useEffect, useRef } from 'react';
import { AppState, Platform } from 'react-native';
import { mergeAppUsageSegments } from '../domain/appUsage';
import { getTodayKey } from '../domain/streak';
import { normalizeServerUrl } from '../services/api';
import {
  getAppUsageSegments,
  hasUsageAccess,
  isAppUsageSupported,
  startUsageTracking,
  stopUsageTracking,
} from '../services/appUsage';
import { useHabitStore } from '../store/useHabitStore';

const SAMPLE_INTERVAL_MS = 15_000;

export default function useAppUsageTracker() {
  const { activeTasks, settings, updateTask } = useHabitStore();
  const tasksRef = useRef(activeTasks);
  const updateTaskRef = useRef(updateTask);
  const busyRef = useRef(false);

  useEffect(() => {
    tasksRef.current = activeTasks;
    updateTaskRef.current = updateTask;
  }, [activeTasks, updateTask]);

  const trackingBindings = activeTasks
    .filter((task) => task.appUsageBinding?.packageName)
    .map((task) => ({
      taskId: task.id,
      packageName: task.appUsageBinding!.packageName,
    }));
  const trackingConfig = JSON.stringify({
    serverUrl: settings.syncEnabled && settings.serverUrl.trim()
      ? normalizeServerUrl(settings.serverUrl)
      : '',
    samples: trackingBindings,
  });

  useEffect(() => {
    if (Platform.OS !== 'android' || !isAppUsageSupported()) return;

    let cancelled = false;

    const syncService = async () => {
      try {
        const granted = await hasUsageAccess();
        if (cancelled) return;

        const config = JSON.parse(trackingConfig) as {
          serverUrl: string;
          samples: { taskId: string; packageName: string }[];
        };
        if (!granted || config.samples.length === 0) {
          await stopUsageTracking();
          return;
        }

        await startUsageTracking(config.serverUrl, config.samples);
      } catch {
        // A transient permission/provider/start failure must not break the UI.
      }
    };

    void syncService();

    return () => {
      cancelled = true;
    };
    // trackingConfig is a stable JSON fingerprint that avoids restarting the
    // foreground service on every unrelated task/check-in state update.
  }, [trackingConfig]);

  useEffect(() => {
    if (Platform.OS !== 'android' || !isAppUsageSupported()) return;

    let cancelled = false;

    const sample = async () => {
      if (busyRef.current || cancelled) return;
      busyRef.current = true;

      try {
        if (!(await hasUsageAccess())) return;

        const today = getTodayKey();
        const start = new Date(`${today}T00:00:00`);

        for (const task of tasksRef.current) {
          const binding = task.appUsageBinding;
          if (!binding?.packageName || cancelled) continue;

          const incoming = await getAppUsageSegments(
            binding.packageName,
            start.getTime(),
            Date.now(),
          );
          const merged = mergeAppUsageSegments(task.appUsageSegments, incoming);
          const existing = task.appUsageSegments ?? [];
          const changed = existing.length !== merged.length
            || merged.some((segment, index) => {
              const old = existing[index];
              return !old || old.startAt !== segment.startAt || old.stopAt !== segment.stopAt;
            });

          if (changed) {
            updateTaskRef.current(task.id, { appUsageSegments: merged });
          }
        }
      } catch {
        // Usage data is additive; a transient permission/provider failure must not break the UI.
      } finally {
        busyRef.current = false;
      }
    };

    const initial = setTimeout(() => void sample(), 1_000);
    const timer = setInterval(() => void sample(), SAMPLE_INTERVAL_MS);
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void sample();
    });

    return () => {
      cancelled = true;
      clearTimeout(initial);
      clearInterval(timer);
      subscription.remove();
    };
  }, []);
}
