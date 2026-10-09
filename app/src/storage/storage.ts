import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppData, DayRecord, Task } from '../domain/types';

const STORAGE_KEY = 'habitpulse.data.v1';
let memoryData: AppData | null = null;
let writeQueue: Promise<void> = Promise.resolve();
let pendingData: AppData | null = null;
let saveTimer: ReturnType<typeof setTimeout> | null = null;
let flushListenerInstalled = false;

const ignoreWriteError = () => {};

export const defaultData: AppData = {
  tasks: [],
  checkIns: [],
  deletedCheckIns: [],
  dayRecords: [],
  voiceRecords: [],
  settings: {
    syncEnabled: true,
    serverUrl: 'https://habitpulse.vip.cpolar.top',
    lastSyncedAt: null,
    appearance: 'dark',
    customGroups: [],
  },
};

function normalizeTask(task: Task, index: number): Task {
  return {
    ...task,
    sortOrder: Number.isFinite(task.sortOrder) ? task.sortOrder : index,
    timerSegments: Array.isArray(task.timerSegments) ? task.timerSegments : [],
    removedSegmentIds: Array.isArray(task.removedSegmentIds) ? task.removedSegmentIds : [],
    appUsageSegments: Array.isArray(task.appUsageSegments) ? task.appUsageSegments : [],
    appUsageBinding: task.appUsageBinding ?? null,
    customGroups: Array.isArray(task.customGroups) ? task.customGroups : [],
    manualDurationMs: Number.isFinite(task.manualDurationMs) ? task.manualDurationMs : 0,
  };
}

function normalizeDayRecord(record: DayRecord): DayRecord {
  const images = Array.isArray(record.images)
    ? record.images
    : record.image
      ? [record.image]
      : [];

  return { ...record, images, image: images[0] ?? null };
}

export function normalizeStoredData(parsed: Partial<AppData> | null | undefined): AppData {
  if (!parsed) {
    return defaultData;
  }

  return {
    tasks: (parsed.tasks ?? []).map(normalizeTask),
    checkIns: parsed.checkIns ?? [],
    deletedCheckIns: parsed.deletedCheckIns ?? [],
    dayRecords: (parsed.dayRecords ?? []).map(normalizeDayRecord),
    voiceRecords: parsed.voiceRecords ?? [],
    settings: {
      ...defaultData.settings,
      ...(parsed.settings ?? {}),
    },
  };
}

export async function loadData(): Promise<AppData> {
  if (memoryData) return memoryData;

  // If a save is in flight, do not read the older value behind it.
  await writeQueue.then(ignoreWriteError, ignoreWriteError);
  if (memoryData) return memoryData;

  const raw = await AsyncStorage.getItem(STORAGE_KEY);

  if (!raw) {
    memoryData = defaultData;
    return memoryData;
  }

  try {
    memoryData = normalizeStoredData(JSON.parse(raw) as Partial<AppData>);
  } catch {
    memoryData = defaultData;
  }

  return memoryData;
}

export async function saveData(data: AppData): Promise<void> {
  memoryData = data;
  pendingData = data;
  if (saveTimer) clearTimeout(saveTimer);

  // Coalesce rapid commits (group chips, toggles) into one write so the
  // potentially multi-megabyte JSON.stringify never runs per tap.
  // Callers resolve immediately; the trailing write happens off the interaction
  // and is force-flushed when the app leaves the foreground.
  saveTimer = setTimeout(() => flushPendingWrite(), 250);
}

async function stringifyAppData(data: AppData): Promise<string> {
  // Section-level memoization keyed by array/object IDENTITY: commits create
  // new references only for sections that changed, so a group-chip tap
  // (settings only) reuses the cached multi-megabyte task/record strings and
  // serializes just the tiny settings section.
  const tasks = cachedSection('tasks', data.tasks ?? []);
  const checkIns = cachedSection('checkins', data.checkIns ?? []);
  const dayRecords = cachedSection('dayrecords', data.dayRecords ?? []);
  const voiceRecords = cachedSection('voicerecords', data.voiceRecords ?? []);
  const deletedCheckIns = cachedSection('deletedCheckIns', data.deletedCheckIns ?? []);
  const settings = cachedSection('settings', data.settings);
  return `{"tasks":${tasks},"checkIns":${checkIns},"deletedCheckIns":${deletedCheckIns},"dayRecords":${dayRecords},"voiceRecords":${voiceRecords},"settings":${settings}}`;
}

const sectionCache = new Map<string, { ref: unknown; str: string }>();

function cachedSection(key: string, ref: unknown): string {
  const hit = sectionCache.get(key);
  if (hit && hit.ref === ref) return hit.str;
  const str = JSON.stringify(ref);
  sectionCache.set(key, { ref, str });
  return str;
}

function flushPendingWrite(done?: () => void): void {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  const toWrite = pendingData;
  pendingData = null;
  if (!toWrite) {
    done?.();
    return;
  }
  const task = writeQueue
    .then(() => stringifyAppData(toWrite))
    .then((raw) => AsyncStorage.setItem(STORAGE_KEY, raw));
  writeQueue = task.then(ignoreWriteError, ignoreWriteError);
  task.then(() => done?.(), () => done?.());
}

// Never lose queued data when the app goes to background / is killed.
export function setupStorageFlushListener(): void {
  if (flushListenerInstalled) return;
  flushListenerInstalled = true;
  // Lazy require keeps web/vitest free of the react-native import.
  const { AppState } = require('react-native') as typeof import('react-native');
  AppState.addEventListener('change', (state: string) => {
    if (state === 'background' || state === 'inactive') {
      flushPendingWrite();
    }
  });
}
