import assert from 'node:assert/strict'
import test from 'node:test'
import type { PersistedState } from '../src/types/domain.ts'
import {
  addMobileTask,
  archiveMobileTask,
  createEmptyMobileState,
  deleteMobileTask,
  toggleMobileTaskTimer,
  unarchiveMobileTask,
  updateMobileTaskContent,
} from '../src/mobile/mobileState.ts'

function createState(): PersistedState {
  return createEmptyMobileState('2026-03-12T10:00:00.000+08:00')
}

test('addMobileTask appends a task with sequential order and shared defaults', () => {
  const nextState = addMobileTask(createState(), '2026-03-12T10:01:00.000+08:00')

  assert.equal(nextState.tasks.length, 1)
  assert.equal(nextState.tasks[0].order, 1)
  assert.equal(nextState.tasks[0].status, 'idle')
  assert.equal(nextState.tasks[0].showDuration, true)
  assert.equal(nextState.tasks[0].fontFamily, nextState.settings.defaultFontFamily)
})

test('toggleMobileTaskTimer starts and then pauses with a closed duration segment', () => {
  const withTask = addMobileTask(createState(), '2026-03-12T10:01:00.000+08:00')
  const taskId = withTask.tasks[0].id

  const runningState = toggleMobileTaskTimer(withTask, taskId, '2026-03-12T10:02:00.000+08:00')
  const pausedState = toggleMobileTaskTimer(runningState, taskId, '2026-03-12T10:07:00.000+08:00')
  const task = pausedState.tasks[0]

  assert.equal(task.status, 'paused')
  assert.equal(task.segments.length, 1)
  assert.equal(task.segments[0].pauseAt, '2026-03-12T10:07:00.000+08:00')
  assert.equal(task.totalDurationMs, 5 * 60 * 1000)
})

test('archiveMobileTask closes a running segment without forcing the task hidden', () => {
  const withTask = addMobileTask(createState(), '2026-03-12T10:01:00.000+08:00')
  const taskId = withTask.tasks[0].id
  const runningState = toggleMobileTaskTimer(withTask, taskId, '2026-03-12T10:02:00.000+08:00')

  const archivedState = archiveMobileTask(runningState, taskId, '2026-03-12T10:08:00.000+08:00')
  const task = archivedState.tasks[0]

  assert.equal(task.archived, true)
  assert.equal(task.archivedAt, '2026-03-12T10:08:00.000+08:00')
  assert.equal(task.status, 'paused')
  assert.equal(task.hidden, false)
  assert.equal(task.totalDurationMs, 6 * 60 * 1000)
})

test('unarchiveMobileTask clears hidden state from synced hidden archives', () => {
  const seeded = addMobileTask(createState(), '2026-03-12T10:01:00.000+08:00')
  const taskId = seeded.tasks[0].id
  const hiddenArchived = {
    ...seeded,
    tasks: [
      {
        ...seeded.tasks[0],
        archived: true,
        archivedAt: '2026-03-12T10:08:00.000+08:00',
        hidden: true,
      },
    ],
  }

  const nextState = unarchiveMobileTask(hiddenArchived, taskId, '2026-03-12T10:09:00.000+08:00')

  assert.equal(nextState.tasks[0].archived, false)
  assert.equal(nextState.tasks[0].hidden, false)
})

test('updateMobileTaskContent and deleteMobileTask keep task order stable after edits', () => {
  const first = addMobileTask(createState(), '2026-03-12T10:01:00.000+08:00')
  const second = addMobileTask(first, '2026-03-12T10:02:00.000+08:00')
  const firstTaskId = second.tasks[0].id

  const edited = updateMobileTaskContent(second, firstTaskId, 'Android checklist', '2026-03-12T10:03:00.000+08:00')
  const deleted = deleteMobileTask(edited, firstTaskId, '2026-03-12T10:04:00.000+08:00')

  assert.equal(edited.tasks[0].contentRaw, 'Android checklist')
  assert.deepEqual(
    deleted.tasks.map((task) => task.order),
    [1],
  )
})
