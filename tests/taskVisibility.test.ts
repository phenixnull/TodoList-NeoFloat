import assert from 'node:assert/strict'
import test from 'node:test'
import type { Task } from '../src/types/domain.ts'
import { resolveHiddenArchiveRangeDefaults, shouldHideArchivedTask, shouldShowTaskInList } from '../src/lib/taskVisibility.ts'

function createTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 'task-1',
    order: 1,
    contentRaw: 'demo',
    attachments: [],
    colorMode: 'auto',
    colorValue: null,
    fontFamily: 'Segoe UI',
    fontSize: 16,
    status: 'idle',
    archived: false,
    archivedAt: null,
    hidden: false,
    showDuration: true,
    segments: [],
    totalDurationMs: 0,
    createdAt: '2026-04-03T09:00:00.000+08:00',
    updatedAt: '2026-04-03T09:00:00.000+08:00',
    finishedAt: null,
    ...overrides,
  }
}

const baseSettings = {
  showArchived: false,
  archivedDisplayMode: 'all' as const,
  archivedRangeStart: '',
  archivedRangeEnd: '',
}

test('plain archived tasks stay visible when they are not hidden', () => {
  const task = createTask({
    archived: true,
    archivedAt: '2026-04-03T10:00:00.000+08:00',
    hidden: false,
  })

  assert.equal(shouldShowTaskInList(task, baseSettings, '2026-04-03'), true)
})

test('shouldHideArchivedTask selects archived visible tasks in all mode', () => {
  const task = createTask({
    archived: true,
    archivedAt: '2026-04-03T10:00:00.000+08:00',
    hidden: false,
  })

  assert.equal(
    shouldHideArchivedTask(
      task,
      {
        mode: 'all',
        todayDate: '2026-04-03',
      },
    ),
    true,
  )
})

test('shouldHideArchivedTask only selects archived tasks inside the hide range', () => {
  const todayTask = createTask({
    archived: true,
    archivedAt: '2026-04-03T10:00:00.000+08:00',
    hidden: false,
  })
  const yesterdayTask = createTask({
    id: 'task-3',
    archived: true,
    archivedAt: '2026-04-02T10:00:00.000+08:00',
    hidden: false,
  })

  const settings = {
    mode: 'range' as const,
    todayDate: '2026-04-03',
    start: '2026-04-03',
    end: '2026-04-03',
  }

  assert.equal(shouldHideArchivedTask(todayTask, settings), true)
  assert.equal(shouldHideArchivedTask(yesterdayTask, settings), false)
})

test('hidden archived tasks stay hidden until hidden-task display is enabled', () => {
  const task = createTask({
    archived: true,
    archivedAt: '2026-04-03T10:00:00.000+08:00',
    hidden: true,
  })

  assert.equal(shouldShowTaskInList(task, baseSettings, '2026-04-03'), false)
  assert.equal(
    shouldShowTaskInList(
      task,
      {
        ...baseSettings,
        showArchived: true,
      },
      '2026-04-03',
    ),
    true,
  )
})

test('range filtering falls back to today when no explicit dates are stored', () => {
  const todayTask = createTask({
    archived: true,
    archivedAt: '2026-04-03T10:00:00.000+08:00',
    hidden: true,
  })
  const yesterdayTask = createTask({
    id: 'task-2',
    archived: true,
    archivedAt: '2026-04-02T10:00:00.000+08:00',
    hidden: true,
  })

  const settings = {
    ...baseSettings,
    showArchived: true,
    archivedDisplayMode: 'range' as const,
  }

  assert.equal(shouldShowTaskInList(todayTask, settings, '2026-04-03'), true)
  assert.equal(shouldShowTaskInList(yesterdayTask, settings, '2026-04-03'), false)
})

test('hidden archive defaults track today and normalize inverted ranges', () => {
  assert.deepEqual(
    resolveHiddenArchiveRangeDefaults({
      todayDate: '2026-04-03',
      currentStart: '',
      currentEnd: '',
    }),
    {
      start: '2026-04-03',
      end: '2026-04-03',
    },
  )

  assert.deepEqual(
    resolveHiddenArchiveRangeDefaults({
      todayDate: '2026-04-03',
      currentStart: '2026-04-07',
      currentEnd: '2026-04-04',
    }),
    {
      start: '2026-04-04',
      end: '2026-04-07',
    },
  )
})
