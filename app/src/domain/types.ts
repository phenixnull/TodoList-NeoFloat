export type Task = {
  id: string;
  name: string;
  icon: string;
  iconImage?: string | null;
  color: string;
  description: string;
  sortOrder: number;
  customGroups?: string[];
  selectedGroup?: string | null;
  timerSegments: TimeSegment[];
  /** IDs intentionally deleted on any device. Used to stop server-side union sync from resurrecting them. */
  removedSegmentIds?: string[];
  /** Foreground periods imported from an Android app binding. Kept separate from manual timing. */
  appUsageSegments?: TimeSegment[];
  appUsageBinding?: AppUsageBinding | null;
  /** User-editable correction/additional time. May be negative; task total is clamped at zero. */
  manualDurationMs: number;
  /** Optional planned time window; a missing check-in past its end auto-fails. */
  scheduleWindow?: ScheduleWindow | null;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
};

export type TimeSegment = {
  id: string;
  startAt: string;
  stopAt?: string | null;
};

export type AppUsageBinding = {
  packageName: string;
  appName?: string;
  /** Runtime-only launcher icon. The server intentionally strips this to keep task sync small. */
  icon?: string | null;
};

export type ScheduleRepeat = 'daily' | 'weekly' | 'once';

/** A planned local time window for a task. When the end passes on a day the
 * window applies to and there is no successful check-in, it auto-fails. */
export type ScheduleWindow = {
  /** Local time "HH:MM", e.g. "07:00". */
  start: string;
  /** Local time "HH:MM", e.g. "08:00". */
  end: string;
  repeat: ScheduleRepeat;
  /** For weekly: weekday numbers 0=Sunday..6=Saturday the window applies on. */
  weekdays?: number[];
  /** For once: the single local date key YYYY-MM-DD the window applies on. */
  targetDate?: string;
};

export type CheckIn = {
  id: string;
  taskId: string;
  date: string;
  createdAt: string;
  status?: CheckInStatus;
};

export type CheckInStatus = 'success' | 'failed';

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
  selectedGroup?: string | null;
  selectedGroups?: string[];
};

export type AppData = {
  tasks: Task[];
  checkIns: CheckIn[];
  deletedCheckIns?: DeletedCheckIn[];
  dayRecords: DayRecord[];
  voiceRecords?: VoiceRecord[];
  settings: HabitSettings;
};

export type VoiceRecordSource = 'voice' | 'keyboard';

export type VoiceRecord = {
  id: string;
  text: string;
  language: string | null;
  source: VoiceRecordSource;
  images: string[];
  createdAt: string;
};

export type SyncState = {
  status: 'idle' | 'syncing' | 'ok' | 'error';
  message?: string;
};
