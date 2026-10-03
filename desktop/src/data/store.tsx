import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { CheckIn, DayRecord, DayRecordImage, Task } from '../../../app/src/domain/types';
import { fetchServerData } from '../../../app/src/services/api';
import { toggleTimer as domainToggleTimer } from '../../../app/src/domain/timeTracking';

const SETTINGS_KEY = 'habitpulse.desktop.settings.v1';
const CACHE_KEY = 'habitpulse.desktop.cache.v1';

type LoadedData = {
  tasks: Task[];
  checkIns: CheckIn[];
  dayRecords: DayRecord[];
};

type PersistedSettings = {
  serverUrl: string;
};

export type NewTaskInput = {
  name: string;
  icon?: string;
  color?: string;
  description?: string;
  customGroups?: string[];
  manualDurationMs?: number;
};

export type DayRecordSaveInput = {
  taskId: string;
  date: string;
  note: string;
  keptImages: DayRecordImage[];
  newFiles: File[];
};

type StoreValue = LoadedData & {
  now: Date;
  online: boolean;
  loading: boolean;
  busy: boolean;
  serverUrl: string;
  lastSyncedAt: Date | null;
  setServerUrl: (url: string) => void;
  refresh: () => Promise<void>;
  toggleCheckIn: (taskId: string, date: string) => Promise<void>;
  undoCheckIn: () => Promise<void>;
  toggleTimer: (taskId: string) => Promise<void>;
  createTask: (input: NewTaskInput) => Promise<void>;
  updateTask: (taskId: string, patch: Partial<Task>) => Promise<void>;
  reorderTasks: (orderedIds: string[]) => Promise<void>;
  deleteTask: (taskId: string) => Promise<void>;
  saveDayRecord: (input: DayRecordSaveInput) => Promise<void>;
  imageUrl: (taskId: string, date: string, index: number) => string;
};

const StoreContext = createContext<StoreValue | null>(null);

function readSettings(): PersistedSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<PersistedSettings>;
      return { serverUrl: parsed.serverUrl?.trim() || 'http://127.0.0.1:8787' };
    }
  } catch {
    // ignore
  }

  return { serverUrl: 'http://127.0.0.1:8787' };
}

function readCache(): LoadedData | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? (JSON.parse(raw) as LoadedData) : null;
  } catch {
    return null;
  }
}

function genId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('读取文件失败'));
    reader.readAsDataURL(file);
  });
}

function getImageSize(dataUrl: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
    image.onerror = () => resolve({ width: 0, height: 0 });
    image.src = dataUrl;
  });
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<PersistedSettings>(readSettings);
  const [data, setData] = useState<LoadedData>(() =>
    readCache() ?? { tasks: [], checkIns: [], dayRecords: [] },
  );
  const [online, setOnline] = useState(true);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);
  const serverUrlRef = useRef(settings.serverUrl);
  serverUrlRef.current = settings.serverUrl;
  const checkInHistoryRef = useRef<Array<{ taskId: string; date: string; wasChecked: boolean }>>([]);

  const jsonFetch = useCallback(
    async <T,>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T | null> => {
      const response = await fetch(`${serverUrlRef.current.replace(/\/+$/, '')}${path}`, {
        method: init.method ?? 'GET',
        headers: init.body ? { 'Content-Type': 'application/json' } : undefined,
        body: init.body ? JSON.stringify(init.body) : undefined,
      });

      if (!response.ok && response.status !== 409) {
        throw new Error(`请求失败 ${response.status}`);
      }

      const text = await response.text();
      return (text ? JSON.parse(text) : null) as T;
    },
    [],
  );

  const refresh = useCallback(async () => {
    try {
      const remote = await fetchServerData(serverUrlRef.current);
      const next = {
        tasks: remote.tasks,
        checkIns: remote.checkIns,
        dayRecords: remote.dayRecords,
      };
      setData(next);
      localStorage.setItem(CACHE_KEY, JSON.stringify(next));
      setOnline(true);
      setLastSyncedAt(new Date());
    } catch {
      setOnline(false);
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial load + periodic refresh (fallback) + real-time SSE stream.
  useEffect(() => {
    void refresh();
    const interval = window.setInterval(() => void refresh(), 30_000);
    return () => window.clearInterval(interval);
  }, [refresh]);

  // Real-time push: any write by any device triggers an immediate debounced
  // refetch, so two devices stay in sync without waiting for the 30s poll.
  const liveUrl = settings.serverUrl;
  useEffect(() => {
    const base = liveUrl.replace(/\/+$/, '');
    let source: EventSource | null = null;
    let timer: number | null = null;
    try {
      source = new EventSource(`${base}/api/events`);
      const schedule = () => {
        if (timer !== null) window.clearTimeout(timer);
        timer = window.setTimeout(() => void refresh(), 200);
      };
      source.onmessage = schedule;
      source.addEventListener('hello', schedule);
      source.onopen = () => setOnline(true);
      source.onerror = () => setOnline(false);
    } catch {
      // SSE unavailable; 30s polling still covers updates.
    }
    return () => {
      if (timer !== null) window.clearTimeout(timer);
      source?.close();
    };
  }, [liveUrl, refresh]);

  // Clock tick (drives timers & countdown).
  useEffect(() => {
    const interval = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(interval);
  }, []);

  const setServerUrl = useCallback((url: string) => {
    const next = { serverUrl: url };
    setSettings(next);
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
  }, []);

  // Reconnect when server URL changes.
  const url = settings.serverUrl;
  useEffect(() => {
    setLoading(true);
    void refresh();
  }, [url, refresh]);

  const runWithBusy = useCallback(
    async (action: () => Promise<void>) => {
      setBusy(true);
      try {
        await action();
        await refresh();
      } finally {
        setBusy(false);
      }
    },
    [refresh],
  );

  const toggleCheckIn = useCallback(
    (taskId: string, date: string) =>
      runWithBusy(async () => {
        const exists = data.checkIns.some((c) => c.taskId === taskId && c.date === date);
        checkInHistoryRef.current.push({ taskId, date, wasChecked: exists });
        if (checkInHistoryRef.current.length > 8) checkInHistoryRef.current.shift();
        if (exists) {
          await jsonFetch(`/api/checkins/${encodeURIComponent(taskId)}/${date}`, {
            method: 'DELETE',
          });
        } else {
          await jsonFetch('/api/checkins/toggle', {
            method: 'POST',
            body: { taskId, date },
          });
        }
      }),
    [data.checkIns, jsonFetch, runWithBusy],
  );

  const undoCheckIn = useCallback(
    () =>
      runWithBusy(async () => {
        const last = checkInHistoryRef.current.pop();
        if (!last) return;
        const exists = data.checkIns.some((c) => c.taskId === last.taskId && c.date === last.date);
        if (last.wasChecked && !exists) {
          await jsonFetch('/api/checkins/toggle', {
            method: 'POST',
            body: { taskId: last.taskId, date: last.date },
          });
        } else if (!last.wasChecked && exists) {
          await jsonFetch(`/api/checkins/${encodeURIComponent(last.taskId)}/${last.date}`, {
            method: 'DELETE',
          });
        }
      }),
    [data.checkIns, jsonFetch, runWithBusy],
  );

  const toggleTimer = useCallback(
    (taskId: string) =>
      runWithBusy(async () => {
        const task = data.tasks.find((t) => t.id === taskId);
        if (!task) return;
        const next = domainToggleTimer(task, new Date());
        await jsonFetch(`/api/tasks/${taskId}`, {
          method: 'PATCH',
          body: { timerSegments: next.timerSegments },
        });
      }),
    [data.tasks, jsonFetch, runWithBusy],
  );

  const createTask = useCallback(
    (input: NewTaskInput) =>
      runWithBusy(async () => {
        const nowIso = new Date().toISOString();
        const sortOrder = data.tasks.reduce((max, t) => Math.max(max, t.sortOrder), -1) + 1;
        const task: Task = {
          id: genId(),
          name: input.name.trim(),
          icon: input.icon ?? 'flag-variant-outline',
          iconImage: null,
          color: input.color ?? '#22d3ee',
          description: input.description ?? '',
          sortOrder,
          timerSegments: [],
          manualDurationMs: input.manualDurationMs ?? 0,
          createdAt: nowIso,
          updatedAt: nowIso,
          deletedAt: null,
        };
        await jsonFetch('/api/tasks', { method: 'POST', body: task });
      }),
    [data.tasks, jsonFetch, runWithBusy],
  );

  const updateTask = useCallback(
    (taskId: string, patch: Partial<Task>) =>
      runWithBusy(async () => {
        await jsonFetch(`/api/tasks/${taskId}`, { method: 'PATCH', body: patch });
      }),
    [jsonFetch, runWithBusy],
  );

  const reorderTasks = useCallback(
    (orderedIds: string[]) =>
      runWithBusy(async () => {
        for (const [index, id] of orderedIds.entries()) {
          // fire and forget-ish; await each to avoid races
          await jsonFetch(`/api/tasks/${id}`, {
            method: 'PATCH',
            body: { sortOrder: index },
          });
        }
      }),
    [jsonFetch, runWithBusy],
  );

  const deleteTask = useCallback(
    (taskId: string) =>
      runWithBusy(async () => {
        await jsonFetch(`/api/tasks/${taskId}`, { method: 'DELETE' });
      }),
    [jsonFetch, runWithBusy],
  );

  const saveDayRecord = useCallback(
    (input: DayRecordSaveInput) =>
      runWithBusy(async () => {
        const newAssets: Array<{ meta: DayRecordImage; base64: string }> = [];

        for (const file of input.newFiles) {
          const dataUrl = await fileToDataUrl(file);
          const size = await getImageSize(dataUrl);
          const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
          newAssets.push({
            meta: {
              fileName: file.name || `image-${Date.now()}.jpg`,
              width: size.width,
              height: size.height,
              mimeType: file.type || 'image/jpeg',
            },
            base64,
          });
        }

        const images = [...input.keptImages, ...newAssets.map((a) => a.meta)];
        const imageUploads = newAssets.map((asset, i) => ({
          index: input.keptImages.length + i,
          base64: asset.base64,
        }));

        await jsonFetch('/api/day-records', {
          method: 'POST',
          body: {
            taskId: input.taskId,
            date: input.date,
            note: input.note,
            images,
            imageUploads,
          },
        });
      }),
    [jsonFetch, runWithBusy],
  );

  const imageUrl = useCallback(
    (taskId: string, date: string, index: number) =>
      `${serverUrlRef.current.replace(/\/+$/, '')}/api/day-records/${encodeURIComponent(
        taskId,
      )}/${date}/images/${index}`,
    [],
  );

  const value = useMemo<StoreValue>(
    () => ({
      ...data,
      now,
      online,
      loading,
      busy,
      serverUrl: settings.serverUrl,
      lastSyncedAt,
      setServerUrl,
      refresh,
      toggleCheckIn,
      undoCheckIn,
      toggleTimer,
      createTask,
      updateTask,
      reorderTasks,
      deleteTask,
      saveDayRecord,
      imageUrl,
    }),
    [
      data,
      now,
      online,
      loading,
      busy,
      settings.serverUrl,
      lastSyncedAt,
      setServerUrl,
      refresh,
      toggleCheckIn,
      undoCheckIn,
      toggleTimer,
      createTask,
      updateTask,
      reorderTasks,
      deleteTask,
      saveDayRecord,
      imageUrl,
    ],
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): StoreValue {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore must be used within StoreProvider');
  return ctx;
}
