import type { Task, TaskSegment } from '../types/domain'

const TWO = 2
const THREE = 3

const pad = (value: number, size = TWO) => String(value).padStart(size, '0')

export function toLocalIso(date = new Date()): string {
  const year = date.getFullYear()
  const month = pad(date.getMonth() + 1)
  const day = pad(date.getDate())
  const hour = pad(date.getHours())
  const minute = pad(date.getMinutes())
  const second = pad(date.getSeconds())
  const ms = pad(date.getMilliseconds(), THREE)

  const offset = -date.getTimezoneOffset()
  const sign = offset >= 0 ? '+' : '-'
  const abs = Math.abs(offset)
  const offsetHour = pad(Math.floor(abs / 60))
  const offsetMinute = pad(abs % 60)

  return `${year}-${month}-${day}T${hour}:${minute}:${second}.${ms}${sign}${offsetHour}:${offsetMinute}`
}

export function localDateTimeText(iso: string): string {
  if (!iso) {
    return '--'
  }

  const date = new Date(iso)
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}

export function formatDuration(durationMs: number): string {
  const sec = Math.max(0, Math.floor(durationMs / 1000))
  const hour = Math.floor(sec / 3600)
  const minute = Math.floor((sec % 3600) / 60)
  const second = sec % 60

  return `${pad(hour)}:${pad(minute)}:${pad(second)}`
}

export function calcTaskDuration(task: Task, nowMs: number): number {
  let total = task.totalDurationMs

  if (task.status === 'doing') {
    const active = task.segments[task.segments.length - 1]
    if (active && !active.pauseAt) {
      total += Math.max(0, nowMs - new Date(active.startAt).getTime())
    }
  }

  return total
}

export function closeOpenSegment(segments: TaskSegment[], pauseAt: string): TaskSegment[] {
  const next = [...segments]
  for (let i = next.length - 1; i >= 0; i -= 1) {
    if (!next[i].pauseAt) {
      const startTime = new Date(next[i].startAt).getTime()
      const endTime = new Date(pauseAt).getTime()
      next[i] = {
        ...next[i],
        pauseAt,
        durationMs: Math.max(0, endTime - startTime),
      }
      break
    }
  }
  return next
}

export function sumClosedDurations(segments: TaskSegment[]): number {
  return segments.reduce((sum, segment) => {
    if (!segment.pauseAt) {
      return sum
    }
    return sum + Math.max(0, segment.durationMs)
  }, 0)
}

/**
 * Calculate the remaining countdown time in ms.
 * Returns null if no countdown is active.
 * Returns 0 if countdown has expired.
 */
export function calcCountdownRemaining(task: Task, nowMs: number): number | null {
  if (task.countdownTargetMs === null || task.countdownTargetMs <= 0) {
    return null
  }

  const currentDuration = calcTaskDuration(task, nowMs)
  return Math.max(0, task.countdownTargetMs - currentDuration)
}
