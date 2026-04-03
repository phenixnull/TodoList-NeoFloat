import assert from 'node:assert/strict'
import test from 'node:test'
import {
  addMobileTask,
  archiveAndHideMobileTask,
  clearMobileTaskColor,
  createEmptyMobileState,
  hideArchivedMobileTasks,
  insertMobileTaskAfter,
  reorderMobileTasks,
  setAllMobileTaskDurationVisibility,
  setMobileTaskCustomColor,
  setMobileTaskDurationLayoutMode,
  setMobileTaskPresetColor,
  setMobileTasksDurationLayoutMode,
  toggleMobileTaskDurationVisibility,
} from '../src/mobile/mobileState.ts'

function createSeededState() {
  const first = addMobileTask(createEmptyMobileState('2026-04-04T09:00:00.000+08:00'), '2026-04-04T09:01:00.000+08:00')
  const second = addMobileTask(first, '2026-04-04T09:02:00.000+08:00')
  return addMobileTask(second, '2026-04-04T09:03:00.000+08:00')
}

test('insertMobileTaskAfter adds a task directly below the selected task', () => {
  const state = createSeededState()
  const targetId = state.tasks[1].id

  const nextState = insertMobileTaskAfter(state, targetId, '2026-04-04T09:04:00.000+08:00')

  assert.equal(nextState.tasks.length, 4)
  assert.deepEqual(
    nextState.tasks.map((task) => task.order),
    [1, 2, 3, 4],
  )
  assert.equal(nextState.tasks[2].createdAt, '2026-04-04T09:04:00.000+08:00')
  assert.equal(nextState.tasks[2].fontFamily, state.settings.defaultFontFamily)
})

test('duration visibility and layout helpers mirror desktop behavior', () => {
  const state = createSeededState()
  const taskId = state.tasks[0].id

  const hidden = toggleMobileTaskDurationVisibility(state, taskId, '2026-04-04T09:05:00.000+08:00')
  assert.equal(hidden.tasks[0].showDuration, false)

  const allHidden = setAllMobileTaskDurationVisibility(hidden, false, '2026-04-04T09:06:00.000+08:00')
  assert.equal(allHidden.tasks.every((task) => task.showDuration === false), true)

  const inlineOne = setMobileTaskDurationLayoutMode(allHidden, taskId, 'inline', '2026-04-04T09:07:00.000+08:00')
  assert.equal(inlineOne.tasks[0].durationLayoutMode, 'inline')
  assert.equal(inlineOne.tasks[0].showDuration, true)

  const stackedMany = setMobileTasksDurationLayoutMode(
    inlineOne,
    inlineOne.tasks.map((task) => task.id),
    'stacked',
    '2026-04-04T09:08:00.000+08:00',
  )
  assert.equal(stackedMany.tasks.every((task) => task.durationLayoutMode === 'stacked'), true)
  assert.equal(stackedMany.tasks.every((task) => task.showDuration === true), true)
})

test('mobile color helpers support preset, custom, and reset flows', () => {
  const state = createSeededState()
  const taskId = state.tasks[0].id

  const preset = setMobileTaskPresetColor(state, taskId, 'linear-gradient(135deg, #22d3ee, #3b82f6)', '2026-04-04T09:09:00.000+08:00')
  assert.equal(preset.tasks[0].colorMode, 'preset')
  assert.equal(preset.tasks[0].colorValue, 'linear-gradient(135deg, #22d3ee, #3b82f6)')

  const custom = setMobileTaskCustomColor(preset, taskId, '#123456', '2026-04-04T09:10:00.000+08:00')
  assert.equal(custom.tasks[0].colorMode, 'custom')
  assert.equal(custom.tasks[0].colorValue, '#123456')

  const cleared = clearMobileTaskColor(custom, taskId, '2026-04-04T09:11:00.000+08:00')
  assert.equal(cleared.tasks[0].colorMode, 'auto')
  assert.equal(cleared.tasks[0].colorValue, null)
})

test('archiveAndHideMobileTask and hideArchivedMobileTasks keep desktop hidden-archive semantics', () => {
  const state = createSeededState()
  const taskId = state.tasks[0].id

  const archivedHidden = archiveAndHideMobileTask(state, taskId, '2026-04-04T09:12:00.000+08:00')
  assert.equal(archivedHidden.tasks[0].archived, true)
  assert.equal(archivedHidden.tasks[0].hidden, true)

  const archivedVisible = {
    ...archivedHidden,
    tasks: archivedHidden.tasks.map((task, index) =>
      index === 1
        ? {
            ...task,
            archived: true,
            archivedAt: '2026-04-03T09:00:00.000+08:00',
            hidden: false,
          }
        : task,
    ),
  }

  const rangeHidden = hideArchivedMobileTasks(
    archivedVisible,
    { mode: 'range', start: '2026-04-03', end: '2026-04-03' },
    '2026-04-04T09:13:00.000+08:00',
  )
  assert.equal(rangeHidden.tasks[1].hidden, true)
})

test('reorderMobileTasks reorders visible ids while keeping orders normalized', () => {
  const state = createSeededState()
  const reordered = reorderMobileTasks(
    state,
    [state.tasks[2].id, state.tasks[0].id, state.tasks[1].id],
    '2026-04-04T09:14:00.000+08:00',
  )

  assert.deepEqual(
    reordered.tasks.map((task) => task.id),
    [state.tasks[2].id, state.tasks[0].id, state.tasks[1].id],
  )
  assert.deepEqual(
    reordered.tasks.map((task) => task.order),
    [1, 2, 3],
  )
})
