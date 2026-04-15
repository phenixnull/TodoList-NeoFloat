import type { Task } from '../../../src/types/domain'

export const PRESET_COLORS = ['#7cc6fe', '#57d6c3', '#8fa57d', '#f4a261', '#e76f51', '#b79cff']

export const COLORS = {
  canvas: '#050914',
  canvasAlt: '#09101b',
  panel: 'rgba(12, 18, 31, 0.9)',
  panelSoft: 'rgba(18, 26, 40, 0.78)',
  line: 'rgba(255,255,255,0.1)',
  lineStrong: 'rgba(255,255,255,0.18)',
  textPrimary: '#f4f7fb',
  textSecondary: '#ccd5e2',
  textMuted: '#8a98ae',
  cyan: '#57d6c3',
  blue: '#7cc6fe',
  green: '#8fa57d',
  amber: '#f4a261',
  red: '#e76f51',
  violet: '#b79cff',
  slate: '#788396',
  lime: '#d7ff8a',
  overlay: 'rgba(2, 6, 14, 0.78)',
} as const

export const FONTS = {
  displayBold: 'SpaceGrotesk_700Bold',
  displayMedium: 'SpaceGrotesk_500Medium',
  body: 'IBMPlexSans_400Regular',
  bodyMedium: 'IBMPlexSans_500Medium',
  bodySemibold: 'IBMPlexSans_600SemiBold',
  mono: 'JetBrainsMono_500Medium',
  monoSemibold: 'JetBrainsMono_600SemiBold',
} as const

export type ProgressState = {
  label: string | null
  ratio: number
  invalid: boolean
}

export function two(value: number): string {
  return String(value).padStart(2, '0')
}

export function formatClockText(nowMs: number): string {
  const date = new Date(nowMs)
  return `${date.getFullYear()}-${two(date.getMonth() + 1)}-${two(date.getDate())}  ${two(date.getHours())}:${two(date.getMinutes())}:${two(date.getSeconds())}`
}

export function formatRelativeStamp(isoText: string | null): string {
  if (!isoText) return '暂无记录'
  const value = new Date(isoText)
  if (Number.isNaN(value.getTime())) return isoText
  return `${two(value.getMonth() + 1)}-${two(value.getDate())} ${two(value.getHours())}:${two(value.getMinutes())}`
}

export function rgba(hex: string, alpha: number): string {
  const raw = hex.replace('#', '').trim()
  const normalized = raw.length === 3 ? raw.split('').map((part) => `${part}${part}`).join('') : raw
  if (!/^[0-9a-fA-F]{6}$/.test(normalized)) return `rgba(124, 198, 254, ${alpha})`
  const value = Number.parseInt(normalized, 16)
  const red = (value >> 16) & 255
  const green = (value >> 8) & 255
  const blue = value & 255
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`
}

export function taskAccent(task: Task): string {
  if ((task.colorMode === 'custom' || task.colorMode === 'preset') && task.colorValue) return task.colorValue
  if (task.archived) return COLORS.slate
  if (task.status === 'doing') return COLORS.cyan
  if (task.status === 'paused') return COLORS.amber
  if (task.status === 'finished') return COLORS.green
  return COLORS.blue
}

export function taskStatusLabel(task: Task): string {
  if (task.archived) return '已归档'
  if (task.status === 'doing') return '进行中'
  if (task.status === 'paused') return '已暂停'
  if (task.status === 'finished') return '已完成'
  return '待开始'
}

export function taskStatusHint(task: Task): string {
  if (task.archived && task.hidden) return '归档并隐藏'
  if (task.archived) return '归档保留'
  if (task.status === 'doing') return '计时正在推进'
  if (task.status === 'paused') return '暂停中，等待继续'
  if (task.status === 'finished') return '已标记完成'
  return '等待处理'
}

export function taskStatusTone(task: Task): string {
  if (task.archived) return COLORS.slate
  if (task.status === 'doing') return COLORS.cyan
  if (task.status === 'paused') return COLORS.amber
  if (task.status === 'finished') return COLORS.green
  return COLORS.blue
}

export function taskProgress(task: Task): ProgressState {
  const current = task.meta?.progressCurrent ?? null
  const total = task.meta?.progressTotal ?? null
  if (current === null && total === null) {
    return { label: null, ratio: 0, invalid: false }
  }
  if (
    typeof current !== 'number' ||
    typeof total !== 'number' ||
    !Number.isFinite(current) ||
    !Number.isFinite(total) ||
    total <= 0 ||
    current < 0 ||
    current > total
  ) {
    const currentText = current === null ? '-' : String(current)
    const totalText = total === null ? '-' : String(total)
    return { label: `${currentText}/${totalText}`, ratio: 1, invalid: true }
  }
  return {
    label: `${current}/${total}`,
    ratio: Math.max(0, Math.min(1, current / total)),
    invalid: false,
  }
}
