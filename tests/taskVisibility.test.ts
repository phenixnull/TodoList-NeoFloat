import assert from 'node:assert/strict'
import test from 'node:test'
import type { Task } from '../src/types/domain.ts'
import { resolveHiddenArchiveRangeDefaults, shouldHideArchivedTask, shouldShowTaskInList, shouldUnhideTask } from '../src/lib/taskVisibility.ts'

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
    hiddenAt: null,
    showDuration: true,
    segments: [],
    totalDurationMs: 0,
    createdAt: '2026-04-03T09:00:00.000+08:00',
    updatedAt: '2026-04-03T09:00:00.000+08:00',
    finishedAt: null,
    ...overrides,
  }
}

test('plain archived tasks stay visible when they are not hidden', () => {
  const task = createTask({
    archived: true,
    archivedAt: '2026-04-03T10:00:00.000+08:00',
    hidden: false,
  })

  assert.equal(shouldShowTaskInList(task), true)
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

test('date-based archive hiding does not fall back to task creation time', () => {
  const legacyArchivedTask = createTask({
    archived: true,
    archivedAt: null,
    hidden: false,
    createdAt: '2026-04-03T09:00:00.000+08:00',
    updatedAt: '2026-04-03T09:00:00.000+08:00',
  })

  assert.equal(
    shouldHideArchivedTask(legacyArchivedTask, {
      mode: 'range',
      todayDate: '2026-04-08',
      start: '2026-04-03',
      end: '2026-04-03',
    }),
    false,
  )
})

test('hidden tasks stay hidden until they are explicitly restored', () => {
  const task = createTask({
    archived: true,
    archivedAt: '2026-04-03T10:00:00.000+08:00',
    hidden: true,
  })

  assert.equal(shouldShowTaskInList(task), false)
})

test('shouldUnhideTask restores any hidden task in all mode', () => {
  const hiddenTask = createTask({
    hidden: true,
    archived: false,
    archivedAt: null,
  })

  assert.equal(
    shouldUnhideTask(hiddenTask, {
      mode: 'all',
      todayDate: '2026-04-03',
    }),
    true,
  )
})

test('shouldUnhideTask supports created time basis', () => {
  const hiddenTask = createTask({
    hidden: true,
    hiddenAt: '2026-04-08T11:00:00.000+08:00',
    archived: true,
    archivedAt: '2026-04-07T10:00:00.000+08:00',
    createdAt: '2026-04-03T09:00:00.000+08:00',
  })

  assert.equal(
    shouldUnhideTask(hiddenTask, {
      mode: 'range',
      basis: 'created',
      todayDate: '2026-04-08',
      start: '2026-04-03',
      end: '2026-04-03',
    }),
    true,
  )
})

test('shouldUnhideTask ignores unfinished tasks when finished time basis is selected', () => {
  const hiddenTask = createTask({
    hidden: true,
    archived: true,
    archivedAt: '2026-04-08T11:00:00.000+08:00',
    finishedAt: null,
  })

  assert.equal(
    shouldUnhideTask(hiddenTask, {
      mode: 'range',
      basis: 'finished',
      todayDate: '2026-04-08',
      start: '2026-04-08',
      end: '2026-04-08',
    }),
    false,
  )
})

test('shouldUnhideTask supports hidden time basis and falls back to updatedAt for legacy hidden tasks', () => {
  const hiddenTask = createTask({
    hidden: true,
    hiddenAt: '2026-04-05T12:00:00.000+08:00',
    updatedAt: '2026-04-08T09:00:00.000+08:00',
  })
  const legacyHiddenTask = createTask({
    id: 'task-legacy',
    hidden: true,
    hiddenAt: null,
    updatedAt: '2026-04-06T09:30:00.000+08:00',
  })

  assert.equal(
    shouldUnhideTask(hiddenTask, {
      mode: 'range',
      basis: 'hidden',
      todayDate: '2026-04-08',
      start: '2026-04-05',
      end: '2026-04-05',
    }),
    true,
  )
  assert.equal(
    shouldUnhideTask(legacyHiddenTask, {
      mode: 'range',
      basis: 'hidden',
      todayDate: '2026-04-08',
      start: '2026-04-06',
      end: '2026-04-06',
    }),
    true,
  )
})

test('range-based hidden restore falls back to today when no explicit dates are stored', () => {
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

  assert.equal(
    shouldUnhideTask(todayTask, {
      mode: 'range',
      basis: 'archived',
      todayDate: '2026-04-03',
    }),
    true,
  )
  assert.equal(
    shouldUnhideTask(yesterdayTask, {
      mode: 'range',
      basis: 'archived',
      todayDate: '2026-04-03',
    }),
    false,
  )
})

test('date-based hidden-task restore does not fall back to task creation time', () => {
  const legacyHiddenArchivedTask = createTask({
    archived: true,
    archivedAt: null,
    hidden: true,
    createdAt: '2026-04-03T09:00:00.000+08:00',
    updatedAt: '2026-04-03T09:00:00.000+08:00',
  })

  assert.equal(
    shouldUnhideTask(legacyHiddenArchivedTask, {
      mode: 'range',
      basis: 'archived',
      todayDate: '2026-04-08',
      start: '2026-04-03',
      end: '2026-04-03',
    }),
    false,
  )
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
