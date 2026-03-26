import assert from 'node:assert/strict'
import test from 'node:test'
import { createContentPersistScheduler } from '../src/lib/contentPersistScheduler.ts'
import { applyTaskOrder } from '../src/lib/taskOrder.ts'

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

const createTask = (id: string, order: number, overrides: Record<string, unknown> = {}) => ({
  id,
  order,
  archived: false,
  updatedAt: '2026-03-12T10:00:00.000+08:00',
  ...overrides,
})

test('flushAll persists pending task updates immediately and suppresses the old debounce timer', async () => {
  const persistedTaskIds: string[] = []
  const scheduler = createContentPersistScheduler({
    debounceMs: 200,
    onPersist: (taskId) => {
      persistedTaskIds.push(taskId)
    },
  })

  scheduler.schedule('task-1')

  assert.deepEqual(persistedTaskIds, [])

  await scheduler.flushAll()

  assert.deepEqual(persistedTaskIds, ['task-1'])

  await wait(220)

  assert.deepEqual(persistedTaskIds, ['task-1'])
})

test('applyTaskOrder keeps hidden archived tasks anchored when only visible tasks are reordered', () => {
  const reordered = applyTaskOrder(
    [
      createTask('task-a', 1),
      createTask('task-b', 2, { archived: true, archivedAt: '2026-03-11T10:00:00.000+08:00' }),
      createTask('task-c', 3),
    ],
    ['task-c', 'task-a'],
    '2026-03-12T10:05:00.000+08:00',
  )

  assert.deepEqual(
    reordered.map((task) => task.id),
    ['task-c', 'task-b', 'task-a'],
  )

  assert.deepEqual(
    reordered.map((task) => task.order),
    [1, 2, 3],
  )
})
