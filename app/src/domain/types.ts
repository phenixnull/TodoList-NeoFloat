export type Task = {
  id: string;
  name: string;
  icon: string;
  iconImage?: string | null;
  color: string;
  description: string;
  sortOrder: number;
  customGroup?: string | null;
  timerSegments: TimeSegment[];
  /** IDs intentionally deleted on any device. Used to stop server-side union sync from resurrecting them. */
  removedSegmentIds?: string[];
  /** User-editable correction/additional time. May be negative; task total is clamped at zero. */
  manualDurationMs: number;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
};

export type TimeSegment = {
  id: string;
  startAt: string;
  stopAt?: string | null;
};

export type CheckIn = {
  id: string;
  taskId: string;
  date: string;
  createdAt: string;
};

export type DayRecordImage = {
  fileName: string;
  width: number;
  height: number;
  mimeType: string;
  localUri?: string | null;
};

export type DayRecord = {
  taskId: string;
  date: string;
  note: string;
  images: DayRecordImage[];
  /** Backward-compatible local storage shape used by app versions before 1.5. */
  image: DayRecordImage | null;
  createdAt: string;
  updatedAt: string;
};

export type DeletedCheckIn = {
  taskId: string;
  date: string;
  deletedAt: string;
};

export type HabitSettings = {
  syncEnabled: boolean;
  serverUrl: string;
  lastSyncedAt?: string | null;
  appearance?: 'light' | 'dark' | 'system';
  customGroups?: string[];
};

export type AppData = {
  tasks: Task[];
  checkIns: CheckIn[];
  deletedCheckIns?: DeletedCheckIn[];
  dayRecords: DayRecord[];
  settings: HabitSettings;
};

export type SyncState = {
  status: 'idle' | 'syncing' | 'ok' | 'error';
  message?: string;
};
