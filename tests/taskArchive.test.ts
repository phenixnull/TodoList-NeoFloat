import assert from 'node:assert/strict'
import test from 'node:test'
import type { Task } from '../src/types/domain.ts'
import { archiveAndHideTaskState, archiveTaskState, unarchiveTaskState } from '../src/lib/taskArchive.ts'

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
    createdAt: '2026-04-08T10:00:00.000+08:00',
    updatedAt: '2026-04-08T10:00:00.000+08:00',
    finishedAt: null,
    ...overrides,
  }
}

test('archiveTaskState only applies the archive tag and preserves hidden state', () => {
  const visibleTask = createTask()
  const hiddenTask = createTask({
    id: 'task-2',
    hidden: true,
  })

  const archivedVisibleTask = archiveTaskState(visibleTask, '2026-04-08T11:00:00.000+08:00')
  const archivedHiddenTask = archiveTaskState(hiddenTask, '2026-04-08T11:00:00.000+08:00')

  assert.equal(archivedVisibleTask.archived, true)
  assert.equal(archivedVisibleTask.hidden, false)
  assert.equal(archivedHiddenTask.archived, true)
  assert.equal(archivedHiddenTask.hidden, true)
})

test('archiveAndHideTaskState hides archived tasks directly and archives visible tasks before hiding', () => {
  const visibleTask = createTask()
  const archivedTask = createTask({
    id: 'task-2',
    archived: true,
    archivedAt: '2026-04-07T09:00:00.000+08:00',
    hiddenAt: null,
  })

  const archivedAndHiddenVisibleTask = archiveAndHideTaskState(visibleTask, '2026-04-08T11:00:00.000+08:00')
  const hiddenArchivedTask = archiveAndHideTaskState(archivedTask, '2026-04-08T11:00:00.000+08:00')

  assert.equal(archivedAndHiddenVisibleTask.archived, true)
  assert.equal(archivedAndHiddenVisibleTask.hidden, true)
  assert.equal(archivedAndHiddenVisibleTask.archivedAt, '2026-04-08T11:00:00.000+08:00')
  assert.equal(archivedAndHiddenVisibleTask.hiddenAt, '2026-04-08T11:00:00.000+08:00')

  assert.equal(hiddenArchivedTask.archived, true)
  assert.equal(hiddenArchivedTask.hidden, true)
  assert.equal(hiddenArchivedTask.archivedAt, '2026-04-07T09:00:00.000+08:00')
  assert.equal(hiddenArchivedTask.hiddenAt, '2026-04-08T11:00:00.000+08:00')
})

test('unarchiveTaskState only removes the archive tag and preserves hidden state', () => {
  const hiddenArchivedTask = createTask({
    archived: true,
    archivedAt: '2026-04-07T09:00:00.000+08:00',
    hidden: true,
    hiddenAt: '2026-04-08T11:00:00.000+08:00',
  })

  const unarchivedTask = unarchiveTaskState(hiddenArchivedTask, '2026-04-08T11:00:00.000+08:00')

  assert.equal(unarchivedTask.archived, false)
  assert.equal(unarchivedTask.archivedAt, null)
  assert.equal(unarchivedTask.hidden, true)
  assert.equal(unarchivedTask.hiddenAt, '2026-04-08T11:00:00.000+08:00')
})
