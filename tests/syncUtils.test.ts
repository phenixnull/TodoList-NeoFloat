import assert from 'node:assert/strict'
import test from 'node:test'
import type { PersistedState, Task } from '../src/types/domain.ts'
import {
  compareTaskActivity,
  collectTaskAssetPaths,
  mergeLocalTasksIntoRemoteState,
  mergeRemoteTasksIntoLocalState,
  normalizeSyncConfig,
  pickAuthoritativeState,
} from '../src/lib/sync.ts'

function createState(updatedAt: string, tasks: Task[] = []): PersistedState {
  return {
    version: 1,
    tasks,
    settings: {
      opacity: 0.82,
      alwaysOnTop: true,
      edgeAutoHide: true,
      autoLaunch: false,
      defaultFontFamily: 'Segoe UI',
      defaultFontSize: 16,
      showArchived: false,
      archivedDisplayMode: 'all',
      archivedRangeStart: '',
      archivedRangeEnd: '',
      uiScale: 1,
      taskCardMode: 'expanded',
      taskContentDisplayMode: 'inner-scroll',
      taskPaletteMode: 'auto-vivid',
    },
    updatedAt,
  }
}

function createTask(id: string, storagePath?: string): Task {
  return {
    id,
    order: 1,
    contentRaw: '',
    attachments: storagePath
      ? [{ id: `${id}-img`, storagePath, mimeType: 'image/png', createdAt: '2026-03-12T10:00:00.000+08:00' }]
      : [],
    colorMode: 'auto',
    colorValue: null,
    fontFamily: 'Segoe UI',
    fontSize: 16,
    status: 'idle',
    archived: false,
    archivedAt: null,
    segments: [],
    totalDurationMs: 0,
    createdAt: '2026-03-12T10:00:00.000+08:00',
    updatedAt: '2026-03-12T10:00:00.000+08:00',
    finishedAt: null,
  }
}

test('normalizeSyncConfig trims server url and only enables complete config', () => {
  const config = normalizeSyncConfig({
    enabled: true,
    serverUrl: ' https://todo.example.com/ ',
    token: ' secret-token ',
  })

  assert.deepEqual(config, {
    enabled: true,
    serverUrl: 'https://todo.example.com',
    token: 'secret-token',
  })
})

test('normalizeSyncConfig disables sync when url or token is missing', () => {
  const config = normalizeSyncConfig({
    enabled: true,
    serverUrl: 'https://todo.example.com/',
    token: '   ',
  })

  assert.equal(config.enabled, false)
  assert.equal(config.serverUrl, 'https://todo.example.com')
  assert.equal(config.token, '')
})

test('pickAuthoritativeState prefers the most recently updated snapshot', () => {
  const local = createState('2026-03-12T11:00:00.000+08:00')
  const remote = createState('2026-03-12T11:05:00.000+08:00')

  assert.equal(pickAuthoritativeState(local, remote), remote)
  assert.equal(pickAuthoritativeState(remote, local), remote)
})

test('compareTaskActivity ignores snapshot updatedAt changes when task timestamps are identical', () => {
  const sharedTask = createTask('task-a')
  const local = createState('2026-03-12T11:10:00.000+08:00', [sharedTask])
  const remote = createState('2026-03-12T11:05:00.000+08:00', [sharedTask])

  assert.equal(compareTaskActivity(local, remote), 0)
})

test('compareTaskActivity prefers the side with newer task activity even if snapshot updatedAt is older', () => {
  const local = createState('2026-03-12T11:10:00.000+08:00', [
    createTask('task-a'),
  ])
  const remote = createState('2026-03-12T11:05:00.000+08:00', [
    {
      ...createTask('task-a'),
      updatedAt: '2026-03-12T11:06:00.000+08:00',
    },
  ])

  assert.equal(compareTaskActivity(local, remote), -1)
})

test('mergeRemoteTasksIntoLocalState replaces task data but preserves local desktop settings', () => {
  const local = createState('2026-03-12T11:00:00.000+08:00', [createTask('local-task')])
  local.settings.opacity = 0.41
  local.settings.edgeAutoHide = false
  const remote = createState('2026-03-12T11:05:00.000+08:00', [createTask('remote-task')])
  remote.settings.opacity = 1
  remote.settings.edgeAutoHide = true

  const merged = mergeRemoteTasksIntoLocalState(local, remote)

  assert.equal(merged.settings.opacity, 0.41)
  assert.equal(merged.settings.edgeAutoHide, false)
  assert.deepEqual(
    merged.tasks.map((task) => task.id),
    ['remote-task'],
  )
  assert.equal(merged.updatedAt, remote.updatedAt)
})

test('mergeLocalTasksIntoRemoteState replaces remote tasks but preserves remote shared settings', () => {
  const local = createState('2026-03-12T11:08:00.000+08:00', [createTask('local-task')])
  local.settings.opacity = 0.41
  local.settings.edgeAutoHide = false

  const remote = createState('2026-03-12T11:05:00.000+08:00', [createTask('remote-task')])
  remote.settings.opacity = 0.91
  remote.settings.edgeAutoHide = true

  const merged = mergeLocalTasksIntoRemoteState(local, remote)

  assert.equal(merged.settings.opacity, 0.91)
  assert.equal(merged.settings.edgeAutoHide, true)
  assert.deepEqual(
    merged.tasks.map((task) => task.id),
    ['local-task'],
  )
  assert.equal(merged.updatedAt, local.updatedAt)
})

test('collectTaskAssetPaths returns unique attachment storage paths', () => {
  const paths = collectTaskAssetPaths([
    createTask('task-a', 'task-assets/task-a/one.png'),
    createTask('task-b', 'task-assets/task-a/one.png'),
    createTask('task-c', 'task-assets/task-c/two.webp'),
  ])

  assert.deepEqual(paths, ['task-assets/task-a/one.png', 'task-assets/task-c/two.webp'])
})
