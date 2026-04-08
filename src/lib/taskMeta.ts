import type { TaskMeta } from '../types/domain'

export const DEFAULT_TASK_TAG = '日常'
export const DEFAULT_TASK_TAG_BACKGROUND_COLOR = '#0f172a'
export const DEFAULT_TASK_TEXT_COLOR = '#f8fbff'
export const TASK_TAG_PRESETS = ['日常', '娱乐', '科研', '工作', '学习'] as const

type ParsedProgressDraft = {
  value: number | null
  isInvalid: boolean
}

function normalizeHexColor(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null
  }

  const hex = value.trim()
  if (!/^#[\da-f]{3}([\da-f]{3})?$/i.test(hex)) {
    return null
  }

  if (hex.length === 4) {
    const [r, g, b] = hex.slice(1)
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase()
  }

  return hex.toLowerCase()
}

function hexToRgba(hex: string, alpha: number): string {
  const normalized = normalizeHexColor(hex)
  if (!normalized) {
    return `rgba(3, 7, 16, ${alpha})`
  }

  const r = Number.parseInt(normalized.slice(1, 3), 16)
  const g = Number.parseInt(normalized.slice(3, 5), 16)
  const b = Number.parseInt(normalized.slice(5, 7), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

function normalizeProgressValue(value: unknown): number | null {
  if (value === '' || value === null || value === undefined) {
    return null
  }

  const nextValue =
    typeof value === 'number'
      ? value
      : typeof value === 'string'
        ? Number(value.trim())
        : Number.NaN

  if (!Number.isFinite(nextValue)) {
    return null
  }

  return Math.max(0, Math.round(nextValue))
}

export function normalizeTaskTagText(value: unknown): string {
  if (typeof value !== 'string') {
    return DEFAULT_TASK_TAG
  }

  const trimmed = value.trim()
  if (!trimmed) {
    return DEFAULT_TASK_TAG
  }

  return Array.from(trimmed).slice(0, 2).join('')
}

export function normalizeTaskMeta(value: unknown): TaskMeta {
  const candidate = value && typeof value === 'object' ? (value as Partial<TaskMeta>) : {}
  const normalizedTagBackgroundColor = normalizeHexColor(candidate.tagBackgroundColor)
  const normalizedTextColor = normalizeHexColor(candidate.textColor)

  return {
    tagText: normalizeTaskTagText(candidate.tagText),
    progressCurrent: normalizeProgressValue(candidate.progressCurrent),
    progressTotal: normalizeProgressValue(candidate.progressTotal),
    tagBackgroundColor: normalizedTagBackgroundColor === DEFAULT_TASK_TAG_BACKGROUND_COLOR ? null : normalizedTagBackgroundColor,
    textColor: normalizedTextColor === DEFAULT_TASK_TEXT_COLOR ? null : normalizedTextColor,
  }
}

export function resolveTaskTagBackgroundCss(tagBackgroundColor: string | null): string {
  if (!tagBackgroundColor) {
    return 'rgba(3, 7, 16, 0.42)'
  }

  return hexToRgba(tagBackgroundColor, 0.78)
}

export function resolveTaskTagBorderCss(tagBackgroundColor: string | null): string {
  if (!tagBackgroundColor) {
    return 'rgba(255, 255, 255, 0.46)'
  }

  return hexToRgba(tagBackgroundColor, 0.96)
}

export function progressValueToDraftText(value: number | null): string {
  return value === null ? '' : String(value)
}

function parseProgressDraftValue(value: string): ParsedProgressDraft {
  const trimmed = value.trim()
  if (!trimmed) {
    return {
      value: null,
      isInvalid: false,
    }
  }

  if (!/^\d+$/.test(trimmed)) {
    return {
      value: null,
      isInvalid: true,
    }
  }

  return {
    value: Number(trimmed),
    isInvalid: false,
  }
}

export function formatTaskProgressText(meta: TaskMeta): string {
  const current = meta.progressCurrent === null ? '--' : String(meta.progressCurrent)
  const total = meta.progressTotal === null ? '--' : String(meta.progressTotal)
  return `${current} / ${total}`
}

export function resolveTaskProgressDraft(progressCurrentDraft: string, progressTotalDraft: string): {
  progressCurrent: number | null
  progressTotal: number | null
  isInvalid: boolean
  progressPercent: number
} {
  const parsedCurrent = parseProgressDraftValue(progressCurrentDraft)
  const parsedTotal = parseProgressDraftValue(progressTotalDraft)
  const hasSemanticError =
    (parsedTotal.value !== null && parsedTotal.value <= 0) ||
    (parsedCurrent.value !== null && parsedTotal.value !== null && parsedCurrent.value > parsedTotal.value)
  const isInvalid = parsedCurrent.isInvalid || parsedTotal.isInvalid || hasSemanticError

  if (isInvalid) {
    return {
      progressCurrent: parsedCurrent.value,
      progressTotal: parsedTotal.value,
      isInvalid: true,
      progressPercent: 100,
    }
  }

  if (parsedTotal.value === null || parsedTotal.value <= 0) {
    return {
      progressCurrent: parsedCurrent.value,
      progressTotal: parsedTotal.value,
      isInvalid: false,
      progressPercent: 0,
    }
  }

  return {
    progressCurrent: parsedCurrent.value,
    progressTotal: parsedTotal.value,
    isInvalid: false,
    progressPercent: Math.max(0, Math.min(100, ((parsedCurrent.value ?? 0) / parsedTotal.value) * 100)),
  }
}

export function resolveTaskProgressCurrentFromRatio(progressTotal: number, ratio: number): number {
  if (!Number.isFinite(progressTotal) || progressTotal <= 0) {
    return 0
  }

  const clampedRatio = Math.max(0, Math.min(1, ratio))
  return Math.round(clampedRatio * Math.round(progressTotal))
}

export function resolveTaskProgressPercent(meta: TaskMeta): number {
  if (meta.progressTotal === null || meta.progressTotal <= 0) {
    return 0
  }

  const current = meta.progressCurrent ?? 0
  return Math.max(0, Math.min(100, (current / meta.progressTotal) * 100))
}
