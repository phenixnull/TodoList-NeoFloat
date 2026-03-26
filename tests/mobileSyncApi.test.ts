import assert from 'node:assert/strict'
import test from 'node:test'
import type { PersistedState } from '../src/types/domain.ts'
import type { SyncConfig } from '../src/types/sync.ts'
import { fetchRemoteState, saveRemoteState, uploadRemoteImage } from '../src/mobile/api.ts'

const config: SyncConfig = {
  enabled: true,
  serverUrl: 'https://todo.example.com/',
  token: 'secret-token',
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

test('fetchRemoteState requests the state endpoint with bearer auth', async () => {
  let seenUrl = ''
  let seenHeaders: Headers | undefined

  const state = await fetchRemoteState(config, async (input, init) => {
    seenUrl = String(input)
    seenHeaders = new Headers(init?.headers)
    return new Response(
      JSON.stringify({
        ok: true,
        state: createState(),
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    )
  })

  assert.equal(seenUrl, 'https://todo.example.com/api/state')
  assert.equal(seenHeaders?.get('Authorization'), 'Bearer secret-token')
  assert.equal(state.updatedAt, '2026-03-12T12:00:00.000+08:00')
})

test('saveRemoteState sends the full snapshot with json headers', async () => {
  const state = createState()
  let seenMethod = ''
  let seenBody = ''
  let seenHeaders: Headers | undefined

  await saveRemoteState(config, state, async (_input, init) => {
    seenMethod = String(init?.method)
    seenBody = String(init?.body)
    seenHeaders = new Headers(init?.headers)
    return new Response(
      JSON.stringify({
        ok: true,
        state,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    )
  })

  assert.equal(seenMethod, 'PUT')
  assert.equal(seenHeaders?.get('Authorization'), 'Bearer secret-token')
  assert.equal(seenHeaders?.get('Content-Type'), 'application/json')
  assert.deepEqual(JSON.parse(seenBody), { state })
})

test('uploadRemoteImage preserves requested storage path when syncing mobile attachments', async () => {
  let seenBody = ''

  const uploaded = await uploadRemoteImage(
    config,
    {
      taskId: 'task-a',
      mimeType: 'image/png',
      dataBase64: 'YWJj',
      requestedStoragePath: 'task-assets/task-a/photo.png',
    },
    async (_input, init) => {
      seenBody = String(init?.body)
      return new Response(
        JSON.stringify({
          ok: true,
          image: {
            id: 'img-1',
            storagePath: 'task-assets/task-a/photo.png',
            mimeType: 'image/png',
            createdAt: '2026-03-12T12:05:00.000+08:00',
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      )
    },
  )

  assert.deepEqual(JSON.parse(seenBody), {
    taskId: 'task-a',
    mimeType: 'image/png',
    dataBase64: 'YWJj',
    requestedStoragePath: 'task-assets/task-a/photo.png',
  })
  assert.equal(uploaded.storagePath, 'task-assets/task-a/photo.png')
})
