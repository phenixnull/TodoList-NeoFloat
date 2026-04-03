import assert from 'node:assert/strict'
import test from 'node:test'
import type { Task } from '../src/types/domain.ts'
import { applyTaskDurationLayoutMode } from '../src/lib/taskDurationLayout.ts'

function createTask(id: string, overrides: Partial<Task> = {}): Task {
  return {
    id,
    order: Number(id.replace(/\D+/g, '')) || 1,
    contentRaw: `task-${id}`,
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
    durationLayoutMode: 'stacked',
    segments: [],
    totalDurationMs: 0,
    createdAt: '2026-04-03T17:00:00.000+08:00',
    updatedAt: '2026-04-03T17:00:00.000+08:00',
    finishedAt: null,
    ...overrides,
  }
}

test('applyTaskDurationLayoutMode only updates selected tasks', () => {
  const now = '2026-04-03T17:10:00.000+08:00'
  const tasks = [
    createTask('task-1', { showDuration: false }),
    createTask('task-2', { durationLayoutMode: 'inline', showDuration: false }),
    createTask('task-3', { showDuration: false }),
  ]

  const result = applyTaskDurationLayoutMode(tasks, ['task-1', 'task-3'], 'inline', now)

  assert.deepEqual(
    result.map((task) => task.durationLayoutMode),
    ['inline', 'inline', 'inline'],
  )
  assert.deepEqual(
    result.map((task) => task.showDuration),
    [true, false, true],
  )
  assert.equal(result[0].updatedAt, now)
  assert.equal(result[2].updatedAt, now)
  assert.equal(result[1], tasks[1])
})

test('applyTaskDurationLayoutMode normalizes invalid mode to stacked', () => {
  const now = '2026-04-03T17:20:00.000+08:00'
  const tasks = [
    createTask('task-1', { durationLayoutMode: 'inline', showDuration: false }),
    createTask('task-2', { durationLayoutMode: 'inline' }),
  ]

  const result = applyTaskDurationLayoutMode(tasks, ['task-1'], 'weird' as Task['durationLayoutMode'], now)

  assert.equal(result[0].durationLayoutMode, 'stacked')
  assert.equal(result[0].showDuration, true)
  assert.equal(result[0].updatedAt, now)
  assert.equal(result[1], tasks[1])
})
