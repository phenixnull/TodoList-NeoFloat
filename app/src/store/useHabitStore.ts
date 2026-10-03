import { createContext, createElement, ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { AppData, CheckIn, DayRecord, DayRecordImage, SyncState, Task } from '../domain/types';
import { toggleCheckIn as toggleLocalCheckIn } from '../domain/checkIns';
import { getNextTaskAppearance } from '../domain/taskAppearance';
import { getTodayKey } from '../domain/streak';
import { reorderTaskGroup, TaskCompletionGroup } from '../domain/taskOrdering';
import { toggleTimer as toggleLocalTimer } from '../domain/timeTracking';
import { cancelTimeout, createDropFollowUpScheduler } from '../domain/dropInteraction';
import { apiRequest, fetchServerData, normalizeServerUrl } from '../services/api';
import { connectRealtime } from '../services/realtime';
import {
  deleteDayRecordImageFiles,
  downloadDayRecordImages,
  readDayRecordImageBase64,
} from '../services/dayRecordFiles';
import { defaultData, loadData, saveData } from '../storage/storage';

function createId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

const keyOf = (taskId: string, date: string) => `${taskId}:${date}`;

function imageMetadataMatches(
  a: DayRecordImage | null | undefined,
  b: DayRecordImage | null | undefined,
): boolean {
  return Boolean(
    a &&
    b &&
    a.fileName === b.fileName &&
    a.width === b.width &&
    a.height === b.height &&
    a.mimeType === b.mimeType,
  );
}

function useHabitStoreInstance() {
  const [data, setData] = useState<AppData>(defaultData);
  const [loading, setLoading] = useState(true);
  const [syncState, setSyncState] = useState<SyncState>({ status: 'idle' });
  const dataRef = useRef<AppData>(defaultData);
  const dropFollowUpScheduler = useMemo(
    () => createDropFollowUpScheduler(setTimeout, cancelTimeout),
    [],
  );

  // Push-pending keys: optimistic local edits the server has not confirmed yet.
  const pendingTasksRef = useRef<Set<string>>(new Set());
  const pendingCheckInsRef = useRef<Set<string>>(new Set());
  const pullTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flushChainRef = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => () => dropFollowUpScheduler.cancel(), [dropFollowUpScheduler]);

  const commit = useCallback(async (nextData: AppData, persist = true) => {
    dataRef.current = nextData;
    setData(nextData);

    if (persist) {
      await saveData(nextData);
    }
  }, []);

  const settingsReady = useCallback(() => {
    const s = dataRef.current.settings;
    return s.syncEnabled && s.serverUrl.trim() ? normalizeServerUrl(s.serverUrl) : null;
  }, []);

  // ---- snapshot application (server is source of truth) ----
  const applySnapshot = useCallback((snapshot: Pick<AppData, 'tasks' | 'checkIns' | 'dayRecords'>): AppData => {
    const local = dataRef.current;
    const remoteTasksById = new Map(snapshot.tasks.map((t) => [t.id, t]));
    const pendingTasks = pendingTasksRef.current;
    const pendingCheckIns = pendingCheckInsRef.current;

    // Tasks: LWW for known ids; local-only pending kept; local tasks missing
    // remotely and not pending were deleted on another device -> drop.
    const tasks: Task[] = [];
    for (const remote of snapshot.tasks) {
      const localTask = local.tasks.find((t) => t.id === remote.id);
      if (!localTask) {
        tasks.push(remote);
      } else {
        tasks.push(
          new Date(localTask.updatedAt) > new Date(remote.updatedAt) ? localTask : remote,
        );
      }
    }
    for (const localTask of local.tasks) {
      if (remoteTasksById.has(localTask.id)) continue;
      if (localTask.deletedAt) {
        // Deletion already propagated (server no longer returns it).
        if (!pendingTasks.has(localTask.id)) continue;
        tasks.push(localTask);
      } else if (pendingTasks.has(localTask.id)) {
        tasks.push(localTask);
      }
      // else: deleted remotely, drop.
    }

    // Check-ins: server active set; keep only pending local additions.
    const checkIns: CheckIn[] = [];
    const seen = new Set<string>();
    for (const remote of snapshot.checkIns) {
      const k = keyOf(remote.taskId, remote.date);
      if (seen.has(k)) continue;
      seen.add(k);
      checkIns.push(remote);
    }
    for (const localCheckIn of local.checkIns) {
      const k = keyOf(localCheckIn.taskId, localCheckIn.date);
      if (seen.has(k)) continue;
      if (pendingCheckIns.has(k)) {
        seen.add(k);
        checkIns.push(localCheckIn);
      }
      // else: un-checked on another device (tombstone), drop.
    }

    return {
      ...local,
      tasks,
      checkIns,
      dayRecords: mergeDayRecordSets(local.dayRecords, snapshot.dayRecords),
      settings: {
        ...local.settings,
        lastSyncedAt: new Date().toISOString(),
      },
    };
  }, []);

  const pullFromServer = useCallback(async () => {
    const base = settingsReady();
    if (!base) return;
    const snapshot = await fetchServerData(base);
    let merged = applySnapshot(snapshot);
    merged = { ...merged, settings: { ...merged.settings, lastSyncedAt: new Date().toISOString() } };

    // Download day-record images not yet cached on this device.
    const dayRecords = merged.dayRecords;
    let nextRecords = dayRecords;
    for (const record of dayRecords) {
      const images = record.images ?? (record.image ? [record.image] : []);
      if (images.every((image) => image.localUri)) continue;
      const downloaded = await downloadDayRecordImages(base, record);
      if (downloaded) {
        nextRecords = nextRecords.map((item) => (
          item.taskId === downloaded.taskId && item.date === downloaded.date ? downloaded : item
        ));
      }
    }

    const latest = dataRef.current;
    // Re-apply against anything committed while fetching.
    const reMerged = applySnapshot({
      tasks: merged.tasks,
      checkIns: merged.checkIns,
      dayRecords: nextRecords,
    });
    await commit({
      ...reMerged,
      // local mutations during the fetch win back their pending state
      tasks: reconcileLatestTasks(latest, reMerged.tasks, pendingTasksRef.current),
      settings: latest.settings,
    });
    setSyncState({ status: 'ok', message: '已同步' });
  }, [applySnapshot, commit, settingsReady]);

  const schedulePull = useCallback(() => {
    if (pullTimerRef.current) clearTimeout(pullTimerRef.current);
    pullTimerRef.current = setTimeout(() => {
      pullFromServer().catch((error) => {
        setSyncState({ status: 'error', message: error instanceof Error ? error.message : '同步失败' });
      });
    }, 300);
  }, [pullFromServer]);

  // ---- push helpers ----
  const pushTask = useCallback(async (task: Task) => {
    const base = settingsReady();
    if (!base) return;
    pendingTasksRef.current.add(task.id);
    try {
      const remoteTasks = await apiRequest<Task[]>(base, '/api/tasks');
      const remote = remoteTasks.find((t) => t.id === task.id);
      if (task.deletedAt) {
        if (remote) await apiRequest(base, `/api/tasks/${task.id}`, { method: 'DELETE' });
      } else if (!remote) {
        await apiRequest(base, '/api/tasks', { method: 'POST', body: JSON.stringify(task) });
      } else if (new Date(task.updatedAt) > new Date(remote.updatedAt)) {
        await apiRequest(base, `/api/tasks/${task.id}`, {
          method: 'PATCH',
          body: JSON.stringify({
            name: task.name,
            icon: task.icon,
            iconImage: task.iconImage ?? null,
            color: task.color,
            description: task.description,
            sortOrder: task.sortOrder,
            timerSegments: task.timerSegments,
            removedSegmentIds: task.removedSegmentIds ?? [],
            manualDurationMs: task.manualDurationMs,
          }),
        });
      }
      pendingTasksRef.current.delete(task.id);
      schedulePull();
    } catch (error) {
      setSyncState({ status: 'error', message: error instanceof Error ? error.message : '推送失败' });
    }
  }, [schedulePull, settingsReady]);

  const pushCheckIn = useCallback(async (taskId: string, date: string, adding: boolean) => {
    const base = settingsReady();
    if (!base) return;
    const k = keyOf(taskId, date);
    if (adding) pendingCheckInsRef.current.add(k);
    try {
      if (adding) {
        await apiRequest(base, '/api/checkins/toggle', {
          method: 'POST',
          body: JSON.stringify({ taskId, date }),
        });
        pendingCheckInsRef.current.delete(k);
      } else {
        await apiRequest(base, `/api/checkins/${encodeURIComponent(taskId)}/${date}`, {
          method: 'DELETE',
        });
      }
      schedulePull();
    } catch (error) {
      if (adding) pendingCheckInsRef.current.delete(k);
      setSyncState({ status: 'error', message: error instanceof Error ? error.message : '打卡同步失败' });
      throw error;
    }
  }, [schedulePull, settingsReady]);

  const pushDayRecord = useCallback(async (record: DayRecord) => {
    const base = settingsReady();
    if (!base) return;
    try {
      const remoteRecords = await apiRequest<DayRecord[]>(base, '/api/day-records');
      const remote = remoteRecords.find((r) => r.taskId === record.taskId && r.date === record.date);
      if (remote && new Date(record.updatedAt) <= new Date(remote.updatedAt)) return;

      const images = record.images ?? (record.image ? [record.image] : []);
      const remoteImages = remote?.images ?? (remote?.image ? [remote.image] : []);
      const payloadImages: DayRecordImage[] = [];
      const imageUploads: { index: number; base64: string }[] = [];

      for (const [index, image] of images.entries()) {
        const remoteImage = remoteImages[index];
        payloadImages.push({ ...image, localUri: null });
        const needsUpload = Boolean(
          image.localUri && (!remoteImage || !imageMetadataMatches(image, remoteImage)),
        );
        if (needsUpload) {
          const imageBase64 = await readDayRecordImageBase64(image);
          if (!imageBase64) throw new Error('无法读取打卡图片');
          imageUploads.push({ index, base64: imageBase64 });
        }
      }

      await apiRequest(base, '/api/day-records', {
        method: 'POST',
        body: JSON.stringify({
          taskId: record.taskId,
          date: record.date,
          note: record.note,
          images: payloadImages,
          image: payloadImages[0] ?? null,
          ...(imageUploads.length ? { imageUploads } : {}),
        }),
      });
      schedulePull();
    } catch (error) {
      setSyncState({ status: 'error', message: error instanceof Error ? error.message : '记录同步失败' });
    }
  }, [schedulePull, settingsReady]);

  // Flush anything that accumulated while offline (also used by manual sync).
  const flushLocal = useCallback(async () => {
    const base = settingsReady();
    if (!base) return;
    const source = dataRef.current;
    const remote = await fetchServerData(base);
    const remoteTaskById = new Map(remote.tasks.map((t) => [t.id, t]));
    for (const task of source.tasks) {
      const rt = remoteTaskById.get(task.id);
      if (task.deletedAt) {
        if (rt) await apiRequest(base, `/api/tasks/${task.id}`, { method: 'DELETE' });
      } else if (!rt) {
        await apiRequest(base, '/api/tasks', { method: 'POST', body: JSON.stringify(task) });
      } else if (new Date(task.updatedAt) > new Date(rt.updatedAt)) {
        await apiRequest(base, `/api/tasks/${task.id}`, {
          method: 'PATCH',
          body: JSON.stringify({
            name: task.name, icon: task.icon, iconImage: task.iconImage ?? null,
            color: task.color, description: task.description, sortOrder: task.sortOrder,
            timerSegments: task.timerSegments, removedSegmentIds: task.removedSegmentIds ?? [],
            manualDurationMs: task.manualDurationMs,
          }),
        });
      }
    }
    const remoteCheckInKeys = new Set(remote.checkIns.map((c) => keyOf(c.taskId, c.date)));
    for (const checkIn of source.checkIns) {
      const k = keyOf(checkIn.taskId, checkIn.date);
      if (!remoteCheckInKeys.has(k)) {
        await apiRequest(base, '/api/checkins', {
          method: 'POST',
          body: JSON.stringify(checkIn),
        });
      }
    }
    const remoteRecordByKey = new Map(
      remote.dayRecords.map((r) => [keyOf(r.taskId, r.date), r]),
    );
    for (const record of source.dayRecords) {
      const rt = remoteRecordByKey.get(keyOf(record.taskId, record.date));
      if (!rt || new Date(record.updatedAt) > new Date(rt.updatedAt)) {
        await pushDayRecord(record);
      }
    }
  }, [pushDayRecord, settingsReady]);

  const enqueueFlush = useCallback(() => {
    const queued = flushChainRef.current.then(flushLocal, flushLocal);
    flushChainRef.current = queued.catch(() => {});
  }, [flushLocal]);

  // ---- realtime connection lifecycle + AppState ----
  const syncEnabled = data.settings.syncEnabled;
  const serverUrl = data.settings.serverUrl;
  useEffect(() => {
    if (!syncEnabled || !serverUrl.trim()) return;
    let connection: { close: () => void } | null = null;
    let active = true;

    const start = () => {
      if (!active) return;
      connection = connectRealtime(serverUrl, {
        onEvent: (event) => {
          if (event.event === 'message') {
            schedulePull();
          }
        },
        onStatus: (status) => {
          if (status === 'open') enqueueFlush();
        },
      });
    };

    const appStateSub = AppState.addEventListener('change', (next) => {
      if (next === 'active') {
        if (!connection) start();
        schedulePull();
      } else if (next === 'background' || next === 'inactive') {
        connection?.close();
        connection = null;
      }
    });

    start();

    return () => {
      active = false;
      appStateSub.remove();
      connection?.close();
      connection = null;
    };
  }, [enqueueFlush, schedulePull, serverUrl, syncEnabled]);

  // ---- initial load ----
  useEffect(() => {
    let mounted = true;
    (async () => {
      const stored = await loadData();
      if (!mounted) return;
      await commit(stored, false);
      setLoading(false);
      pullFromServer().catch(() => {});
    })();
    return () => {
      mounted = false;
    };
  }, [commit, schedulePull]);

  // ---- mutations (optimistic local + direct push) ----
  const createTask = useCallback((input: Partial<Pick<Task, 'name' | 'icon' | 'color' | 'description' | 'iconImage' | 'manualDurationMs'>>) => {
    const now = new Date().toISOString();
    const suggested = getNextTaskAppearance(dataRef.current.tasks);
    const nextSortOrder = dataRef.current.tasks
      .filter((task) => !task.deletedAt)
      .reduce((max, task) => Math.max(max, task.sortOrder + 1), 0);
    const task: Task = {
      id: createId(),
      name: (input.name ?? '').trim(),
      icon: input.icon ?? suggested.icon,
      color: input.color ?? suggested.color,
      iconImage: input.iconImage ?? null,
      description: input.description?.trim() ?? '',
      sortOrder: nextSortOrder,
      timerSegments: [],
      removedSegmentIds: [],
      manualDurationMs: input.manualDurationMs ?? 0,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    };
    const nextData: AppData = { ...dataRef.current, tasks: [...dataRef.current.tasks, task] };
    void commit(nextData);
    void pushTask(task);
  }, [commit, pushTask]);

  const updateTask = useCallback((id: string, input: Partial<Pick<Task, 'name' | 'icon' | 'color' | 'description' | 'iconImage' | 'manualDurationMs' | 'timerSegments' | 'removedSegmentIds'>>) => {
    const tasks = dataRef.current.tasks.map((task) => (task.id === id
      ? { ...task, ...input, updatedAt: new Date().toISOString() }
      : task));
    const nextData: AppData = { ...dataRef.current, tasks };
    void commit(nextData);
    const updated = tasks.find((t) => t.id === id);
    if (updated) void pushTask(updated);
  }, [commit, pushTask]);

  const reorderTasks = useCallback((orderedIds: string[], group: TaskCompletionGroup) => {
    const today = getTodayKey();
    const completedTaskIds = new Set(
      dataRef.current.checkIns
        .filter((checkIn) => checkIn.date === today)
        .map((checkIn) => checkIn.taskId),
    );
    const tasks = reorderTaskGroup(
      dataRef.current.tasks,
      orderedIds,
      group,
      completedTaskIds,
    );
    const nextData: AppData = { ...dataRef.current, tasks };
    void commit(nextData, false);
    const shouldSync = nextData.settings.syncEnabled && nextData.settings.serverUrl.trim().length > 0;
    dropFollowUpScheduler.schedule(
      () => {
        void saveData(dataRef.current);
      },
      shouldSync
        ? () => {
          for (const task of dataRef.current.tasks) void pushTask(task);
        }
        : undefined,
    );
  }, [commit, dropFollowUpScheduler, pushTask]);

  const toggleTimer = useCallback((taskId: string) => {
    const tasks = dataRef.current.tasks.map((task) => (
      task.id === taskId ? toggleLocalTimer(task) : task
    ));
    const nextData: AppData = { ...dataRef.current, tasks };
    void commit(nextData);
    const updated = tasks.find((t) => t.id === taskId);
    if (updated) void pushTask(updated);
  }, [commit, pushTask]);

  const deleteTask = useCallback((id: string) => {
    const now = new Date().toISOString();
    const tasks = dataRef.current.tasks.map((task) => (task.id === id
      ? { ...task, deletedAt: now, updatedAt: now }
      : task));
    const nextData: AppData = { ...dataRef.current, tasks };
    void commit(nextData);
    const updated = tasks.find((t) => t.id === id);
    if (updated) void pushTask(updated);
  }, [commit, pushTask]);

  const toggleCheckIn = useCallback((taskId: string, dateKey = getTodayKey()) => {
    const result = toggleLocalCheckIn(dataRef.current.checkIns, taskId, dateKey);
    const adding = Boolean(result.checkedIn);
    let nextData: AppData;
    if (result.removedCheckIn) {
      nextData = { ...dataRef.current, checkIns: result.checkIns };
    } else {
      nextData = { ...dataRef.current, checkIns: result.checkIns };
    }
    void commit(nextData);
    pushCheckIn(taskId, dateKey, adding).catch(() => {
      // Roll back the optimistic toggle if the server rejected it.
      const rollback = toggleLocalCheckIn(dataRef.current.checkIns, taskId, dateKey);
      const rollbackData: AppData = { ...dataRef.current, checkIns: rollback.checkIns };
      void commit(rollbackData);
    });
    return adding;
  }, [commit, pushCheckIn]);

  const updateSettings = useCallback((settings: Partial<AppData['settings']>) => {
    const nextData: AppData = {
      ...dataRef.current,
      settings: { ...dataRef.current.settings, ...settings },
    };
    void commit(nextData);
    if (nextData.settings.syncEnabled) schedulePull();
  }, [commit, schedulePull]);

  const saveDayRecord = useCallback((
    taskId: string,
    date: string,
    note: string,
    images?: DayRecordImage[],
  ) => {
    const existing = dataRef.current.dayRecords.find(
      (record) => record.taskId === taskId && record.date === date,
    );
    const now = new Date().toISOString();
    const nextImages = images ?? existing?.images ?? (existing?.image ? [existing.image] : []);
    const removedImages = images === undefined
      ? []
      : (existing?.images ?? (existing?.image ? [existing.image] : []))
        .filter((image) => !nextImages.includes(image));
    void deleteDayRecordImageFiles(removedImages);
    const record: DayRecord = {
      taskId,
      date,
      note: note.trim(),
      images: nextImages,
      image: images === undefined ? existing?.image ?? null : nextImages[0] ?? null,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    const dayRecords = [
      ...dataRef.current.dayRecords.filter(
        (item) => !(item.taskId === taskId && item.date === date),
      ),
      record,
    ];
    const nextData: AppData = { ...dataRef.current, dayRecords };
    void commit(nextData);
    void pushDayRecord(record);
  }, [commit, pushDayRecord]);

  const syncNow = useCallback(async () => {
    if (!settingsReady()) {
      setSyncState({ status: 'idle' });
      return;
    }
    setSyncState({ status: 'syncing' });
    try {
      await pullFromServer();
      await flushLocal();
      await pullFromServer();
      setSyncState({ status: 'ok', message: '已同步' });
    } catch (error) {
      setSyncState({ status: 'error', message: error instanceof Error ? error.message : '同步失败' });
    }
  }, [flushLocal, pullFromServer, settingsReady]);

  const activeTasks = data.tasks.filter((task) => !task.deletedAt);

  return {
    activeTasks,
    checkIns: data.checkIns,
    dayRecords: data.dayRecords,
    settings: data.settings,
    loading,
    syncState,
    createTask,
    updateTask,
    deleteTask,
    reorderTasks,
    toggleTimer,
    toggleCheckIn,
    saveDayRecord,
    updateSettings,
    syncNow,
  };
}

// ---- module-level merge helpers ----
function mergeDayRecordSets(local: DayRecord[], remote: DayRecord[]): DayRecord[] {
  // Lazy require of domain logic to keep this file readable; implemented inline
  // via the same LWW rule.
  const byKey = new Map<string, DayRecord>();
  for (const record of local) byKey.set(`${record.taskId}:${record.date}`, normalizeRecord(record));
  for (const record of remote) {
    const k = `${record.taskId}:${record.date}`;
    const existing = byKey.get(k);
    byKey.set(k, existing ? pickRecord(existing, normalizeRecord(record)) : normalizeRecord(record));
  }
  return [...byKey.values()].sort((a, b) => b.date.localeCompare(a.date));
}

function normalizeRecord(record: DayRecord): DayRecord {
  const images = (record.images?.length ? record.images : record.image ? [record.image] : [])
    .filter(Boolean) as DayRecordImage[];
  return { ...record, images, image: images[0] ?? null };
}

function sameImageMeta(a: DayRecordImage, b: DayRecordImage): boolean {
  return a.fileName === b.fileName && a.width === b.width && a.height === b.height && a.mimeType === b.mimeType;
}

function pickRecord(a: DayRecord, b: DayRecord): DayRecord {
  const newer = new Date(b.updatedAt) > new Date(a.updatedAt) ? b : a;
  const other = newer === b ? a : b;
  // Preserve locally cached file URIs when the newer copy lacks them.
  const images = newer.images.map((image) => {
    const match = other.images.find((candidate) => sameImageMeta(candidate, image));
    return match?.localUri && !image.localUri ? { ...image, localUri: match.localUri } : image;
  });
  return { ...newer, images, image: images[0] ?? null };
}

function reconcileLatestTasks(latest: AppData, mergedTasks: Task[], pending: Set<string>): Task[] {
  // Keep local pending edits that landed after the snapshot fetch began.
  const byId = new Map(mergedTasks.map((t) => [t.id, t]));
  for (const task of latest.tasks) {
    const known = byId.get(task.id);
    if (!known) {
      if (pending.has(task.id) || task.deletedAt) byId.set(task.id, task);
    } else if (new Date(task.updatedAt) > new Date(known.updatedAt)) {
      byId.set(task.id, task);
    }
  }
  return [...byId.values()];
}

type HabitStore = ReturnType<typeof useHabitStoreInstance>;
const HabitStoreContext = createContext<HabitStore | null>(null);

export function HabitStoreProvider({ children }: { children: ReactNode }) {
  const store = useHabitStoreInstance();

  return createElement(HabitStoreContext.Provider, { value: store }, children);
}

export function useHabitStore(): HabitStore {
  const store = useContext(HabitStoreContext);

  if (!store) {
    throw new Error('useHabitStore must be inside HabitStoreProvider');
  }

  return store;
}
