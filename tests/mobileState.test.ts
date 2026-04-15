import assert from 'node:assert/strict'
import test from 'node:test'
import { moveDraggedTaskIds, resolveDraggedTaskIndex } from '../native-app/src/app/apkTaskDrag.ts'
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

test('unarchiveMobileTask preserves hidden state so archive and hidden remain independent', () => {
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
  assert.equal(nextState.tasks[0].hidden, true)
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

test('moveDraggedTaskIds reorders visible ids for a dragged apk strip', () => {
  assert.deepEqual(
    moveDraggedTaskIds(['task-a', 'task-b', 'task-c'], 'task-a', 2),
    ['task-b', 'task-c', 'task-a'],
  )

  assert.deepEqual(
    moveDraggedTaskIds(['task-a', 'task-b', 'task-c'], 'task-c', 0),
    ['task-c', 'task-a', 'task-b'],
  )
})

test('resolveDraggedTaskIndex uses crossed card midpoints as the drop target', () => {
  const layouts = [
    { id: 'task-a', y: 0, height: 100 },
    { id: 'task-b', y: 100, height: 100 },
    { id: 'task-c', y: 200, height: 100 },
  ]

  assert.equal(resolveDraggedTaskIndex(layouts, 'task-a', 80), 0)
  assert.equal(resolveDraggedTaskIndex(layouts, 'task-a', 160), 1)
  assert.equal(resolveDraggedTaskIndex(layouts, 'task-a', 280), 2)
})
