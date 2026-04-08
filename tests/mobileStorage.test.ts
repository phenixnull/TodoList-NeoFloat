import assert from 'node:assert/strict'
import test from 'node:test'
import type { PersistedState } from '../src/types/domain.ts'
import {
  loadStoredMobileState,
  loadStoredSyncConfig,
  saveStoredMobileState,
  saveStoredSyncConfig,
} from '../src/mobile/storage.ts'

function createMemoryStorage(seed: Record<string, string> = {}) {
  const store = new Map(Object.entries(seed))

  return {
    getItem(key: string) {
      return store.has(key) ? store.get(key)! : null
    },
    setItem(key: string, value: string) {
      store.set(key, value)
    },
    removeItem(key: string) {
      store.delete(key)
    },
  }
}

function createState(): PersistedState {
  return {
    version: 1,
    tasks: [],
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
    updatedAt: '2026-03-12T12:00:00.000+08:00',
  }
}

test('loadStoredSyncConfig normalizes malformed persisted values', () => {
  const storage = createMemoryStorage({
    'neo-float-mobile-sync-config': JSON.stringify({
      enabled: true,
      serverUrl: 'https://todo.example.com///',
      token: '  secret-token  ',
    }),
  })

  const config = loadStoredSyncConfig(storage)

  assert.deepEqual(config, {
    enabled: true,
    serverUrl: 'https://todo.example.com',
    token: 'secret-token',
  })
})

test('loadStoredSyncConfig falls back cleanly when json is invalid', () => {
  const storage = createMemoryStorage({
    'neo-float-mobile-sync-config': '{bad-json',
  })

  const config = loadStoredSyncConfig(storage)

  assert.deepEqual(config, {
    enabled: false,
    serverUrl: '',
    token: '',
  })
})

test('saveStoredSyncConfig persists the normalized payload', () => {
  const storage = createMemoryStorage()

  const saved = saveStoredSyncConfig(storage, {
    enabled: true,
    serverUrl: 'https://todo.example.com/',
    token: ' secret-token ',
  })

  assert.deepEqual(saved, {
    enabled: true,
    serverUrl: 'https://todo.example.com',
    token: 'secret-token',
  })
  assert.equal(
    storage.getItem('neo-float-mobile-sync-config'),
    JSON.stringify(saved),
  )
})

test('loadStoredMobileState returns null for malformed payloads', () => {
  const storage = createMemoryStorage({
    'neo-float-mobile-state': JSON.stringify({
      version: 1,
      tasks: 'oops',
    }),
  })

  assert.equal(loadStoredMobileState(storage), null)
})

test('saveStoredMobileState round-trips a persisted snapshot', () => {
  const storage = createMemoryStorage()
  const state = createState()

  saveStoredMobileState(storage, state)

  assert.deepEqual(loadStoredMobileState(storage), state)
})

test('loadStoredMobileState backfills missing task duration totals from closed segments', () => {
  const storage = createMemoryStorage({
    'neo-float-mobile-state': JSON.stringify({
      ...createState(),
      tasks: [
        {
          id: 'task-1',
          order: 1,
          contentRaw: 'Legacy task',
          attachments: [],
          colorMode: 'auto',
          colorValue: null,
          fontFamily: 'Segoe UI',
          fontSize: 16,
          status: 'paused',
          archived: false,
          archivedAt: null,
          hidden: true,
          hiddenAt: null,
          segments: [
            {
              startAt: '2026-03-12T10:00:00.000+08:00',
              pauseAt: '2026-03-12T10:25:00.000+08:00',
              durationMs: 25 * 60 * 1000,
            },
          ],
          createdAt: '2026-03-12T10:00:00.000+08:00',
          updatedAt: '2026-03-12T10:25:00.000+08:00',
          finishedAt: null,
        },
      ],
    }),
  })

  const loaded = loadStoredMobileState(storage)

  assert.equal(loaded?.tasks[0].totalDurationMs, 25 * 60 * 1000)
  assert.equal(loaded?.tasks[0].showDuration, true)
  assert.equal(loaded?.tasks[0].durationLayoutMode, 'stacked')
  assert.equal(loaded?.tasks[0].hiddenAt, '2026-03-12T10:25:00.000+08:00')
})
