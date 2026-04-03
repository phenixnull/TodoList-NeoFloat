export type TaskStatus = 'idle' | 'doing' | 'paused' | 'finished'

export type TaskCardMode = 'expanded' | 'collapsed'
export type TaskContentDisplayMode = 'inner-scroll' | 'auto-height'
export type TaskPaletteMode = 'auto-vivid' | 'gray-gradient' | 'default-gray'
export type TaskColorMode = 'auto' | 'preset' | 'custom'
export type ArchivedDisplayMode = 'all' | 'range'
export type TaskDurationLayoutMode = 'stacked' | 'inline'

export interface TaskSegment {
  startAt: string
  pauseAt: string | null
  durationMs: number
}

export interface TaskImageAttachment {
  id: string
  storagePath: string
  mimeType: string
  createdAt: string
}

export interface Task {
  id: string
  order: number
  contentRaw: string
  attachments: TaskImageAttachment[]
  colorMode: TaskColorMode
  colorValue: string | null
  fontFamily: string
  fontSize: number
  status: TaskStatus
  archived: boolean
  archivedAt: string | null
  hidden: boolean
  showDuration: boolean
  durationLayoutMode?: TaskDurationLayoutMode
  segments: TaskSegment[]
  totalDurationMs: number
  createdAt: string
  updatedAt: string
  finishedAt: string | null
}

export interface AppSettings {
  opacity: number
  alwaysOnTop: boolean
  edgeAutoHide: boolean
  autoLaunch: boolean
  defaultFontFamily: string
  defaultFontSize: number
  showArchived: boolean
  archivedDisplayMode: ArchivedDisplayMode
  archivedRangeStart: string
  archivedRangeEnd: string
  uiScale: number
  taskCardMode: TaskCardMode
  taskContentDisplayMode: TaskContentDisplayMode
  taskPaletteMode: TaskPaletteMode
  contextMenuOrder: string[]
}

export interface PersistedState {
  version: 1
  tasks: Task[]
  settings: AppSettings
  updatedAt: string
}

export interface EventDraft {
  taskId: string | null
  type:
    | 'TASK_ADD'
    | 'TASK_UPDATE'
    | 'TASK_DELETE'
    | 'TASK_START'
    | 'TASK_PAUSE'
    | 'TASK_FINISH'
    | 'TASK_UNFINISH'
    | 'TASK_ARCHIVE'
    | 'TASK_UNARCHIVE'
    | 'TASK_REORDER'
    | 'SETTINGS_UPDATE'
  payload: Record<string, unknown>
}
