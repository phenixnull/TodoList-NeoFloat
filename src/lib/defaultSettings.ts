import type { AppSettings } from '../types/domain'

export const DEFAULT_APP_SETTINGS: AppSettings = {
  opacity: 0.82,
  alwaysOnTop: true,
  edgeAutoHide: true,
  autoLaunch: false,
  defaultFontFamily: 'Segoe UI',
  defaultFontSize: 16,
  showArchived: false,
  archivedDisplayMode: 'all',
  archivedRangeStart: '',
  archivedRangeEnd: '',
  uiScale: 1,
  taskCardMode: 'expanded',
  taskContentDisplayMode: 'inner-scroll',
  taskPaletteMode: 'auto-vivid',
}
