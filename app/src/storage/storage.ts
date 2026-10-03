import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppData, DayRecord, Task } from '../domain/types';

const STORAGE_KEY = 'habitpulse.data.v1';

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
    customGroup: typeof task.customGroup === 'string' ? task.customGroup : null,
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
  const raw = await AsyncStorage.getItem(STORAGE_KEY);

  if (!raw) {
    return defaultData;
  }

  try {
    return normalizeStoredData(JSON.parse(raw) as Partial<AppData>);
  } catch {
    return defaultData;
  }
}

export async function saveData(data: AppData): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}
