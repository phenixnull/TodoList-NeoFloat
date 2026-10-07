import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppData, DayRecord, Task } from '../domain/types';

const STORAGE_KEY = 'habitpulse.data.v1';
let memoryData: AppData | null = null;
let writeQueue: Promise<void> = Promise.resolve();

const ignoreWriteError = () => {};

export const defaultData: AppData = {
  tasks: [],
  checkIns: [],
  deletedCheckIns: [],
  dayRecords: [],
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
  const task = writeQueue.then(() => AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(data)));
  writeQueue = task.then(ignoreWriteError, ignoreWriteError);
  await task;
}
