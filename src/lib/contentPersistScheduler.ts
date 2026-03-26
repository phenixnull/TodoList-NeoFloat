type TimerHandle = ReturnType<typeof setTimeout>

type ContentPersistSchedulerOptions = {
  debounceMs: number
  onPersist: (taskId: string) => void | Promise<void>
  setTimer?: (callback: () => void, delayMs: number) => TimerHandle
  clearTimer?: (timer: TimerHandle) => void
}

export type ContentPersistScheduler = {
  schedule: (taskId: string) => void
  flush: (taskId: string) => Promise<void>
  flushAll: () => Promise<void>
}

export function createContentPersistScheduler({
  debounceMs,
  onPersist,
  setTimer = (callback, delayMs) => setTimeout(callback, delayMs),
  clearTimer = clearTimeout,
}: ContentPersistSchedulerOptions): ContentPersistScheduler {
  const timers = new Map<string, TimerHandle>()

  const runPersist = (taskId: string) => Promise.resolve(onPersist(taskId))

  const clearPendingTimer = (taskId: string) => {
    const timer = timers.get(taskId)
    if (!timer) {
      return false
    }

    clearTimer(timer)
    timers.delete(taskId)
    return true
  }

  return {
    schedule: (taskId) => {
      clearPendingTimer(taskId)

      const timer = setTimer(() => {
        if (timers.get(taskId) !== timer) {
          return
        }

        timers.delete(taskId)
        void runPersist(taskId)
      }, debounceMs)

      timers.set(taskId, timer)
    },

    flush: async (taskId) => {
      if (!clearPendingTimer(taskId)) {
        return
      }

      await runPersist(taskId)
    },

    flushAll: async () => {
      const pendingTaskIds = [...timers.keys()]
      pendingTaskIds.forEach((taskId) => {
        clearPendingTimer(taskId)
      })

      await Promise.all(pendingTaskIds.map((taskId) => runPersist(taskId)))
    },
  }
}
