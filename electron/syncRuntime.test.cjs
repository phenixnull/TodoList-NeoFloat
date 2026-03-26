const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')

const { createSyncRuntime } = require('./syncRuntime.cjs')

function createState(updatedAt, { taskId = 'task-1', attachment } = {}) {
  return {
    version: 1,
    tasks: [
      {
        id: taskId,
        order: 1,
        contentRaw: 'task body',
        attachments: attachment ? [attachment] : [],
        colorMode: 'auto',
        colorValue: null,
        fontFamily: 'Segoe UI',
        fontSize: 16,
        status: 'idle',
        archived: false,
        archivedAt: null,
        segments: [],
        totalDurationMs: 0,
        createdAt: updatedAt,
        updatedAt,
        finishedAt: null,
      },
    ],
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

async function createTempPaths() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'todo-sync-runtime-'))
  const dataDir = path.join(root, 'data')
  const configFile = path.join(dataDir, 'sync.config.json')
  await fs.mkdir(path.join(dataDir, 'task-assets'), { recursive: true })
  return { root, dataDir, configFile }
}

test('syncNow pulls newer remote tasks into local state and downloads remote assets', async () => {
  const { root, dataDir, configFile } = await createTempPaths()
  const remoteAttachment = {
    id: 'img-remote',
    storagePath: 'task-assets/task-remote/photo.png',
    mimeType: 'image/png',
    createdAt: '2026-03-12T12:05:00.000+08:00',
  }
  const localState = createState('2026-03-12T12:00:00.000+08:00', { taskId: 'task-local' })
  const remoteState = createState('2026-03-12T12:10:00.000+08:00', {
    taskId: 'task-remote',
    attachment: remoteAttachment,
  })

  const refreshedStates = []
  let writtenState = null
  let flushCalls = 0

  const runtime = createSyncRuntime({
    configFile,
    dataDir,
    readLocalState: async () => localState,
    writeLocalState: async (nextState) => {
      writtenState = nextState
      return nextState
    },
    requestRendererFlush: async () => {
      flushCalls += 1
    },
    notifyStateRefreshed: (state) => {
      refreshedStates.push(state)
    },
    fetchImpl: async (input, init = {}) => {
      const url = String(input)
      if (url === 'https://todo.example.com/api/state' && init.method === 'GET') {
        return new Response(JSON.stringify({ ok: true, state: remoteState }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }
      if (url === 'https://todo.example.com/api/assets/task-assets/task-remote/photo.png?token=secret-token') {
        return new Response(new Uint8Array([1, 2, 3, 4]), {
          status: 200,
          headers: { 'Content-Type': 'image/png' },
        })
      }
      throw new Error(`Unexpected request: ${url} ${init.method || 'GET'}`)
    },
  })

  await runtime.setConfig({
    enabled: true,
    serverUrl: 'https://todo.example.com/',
    token: 'secret-token',
  })

  const result = await runtime.syncNow('manual')

  assert.equal(result.direction, 'pull')
  assert.equal(flushCalls, 1)
  assert.deepEqual(
    writtenState.tasks.map((task) => task.id),
    ['task-remote'],
  )
  assert.equal(writtenState.settings.opacity, localState.settings.opacity)
  assert.equal(refreshedStates.length, 1)

  const downloaded = await fs.readFile(path.join(dataDir, 'task-assets', 'task-remote', 'photo.png'))
  assert.deepEqual([...downloaded], [1, 2, 3, 4])

  await fs.rm(root, { recursive: true, force: true })
})

test('syncNow pushes newer local tasks to the server and preserves remote settings', async () => {
  const { root, dataDir, configFile } = await createTempPaths()
  const localAttachment = {
    id: 'img-local',
    storagePath: 'task-assets/task-local/photo.png',
    mimeType: 'image/png',
    createdAt: '2026-03-12T12:11:00.000+08:00',
  }
  const localState = createState('2026-03-12T12:12:00.000+08:00', {
    taskId: 'task-local',
    attachment: localAttachment,
  })
  const remoteState = createState('2026-03-12T12:01:00.000+08:00', { taskId: 'task-remote' })
  remoteState.settings.opacity = 0.56

  await fs.mkdir(path.join(dataDir, 'task-assets', 'task-local'), { recursive: true })
  await fs.writeFile(path.join(dataDir, 'task-assets', 'task-local', 'photo.png'), Buffer.from([9, 8, 7]))

  const seenRequests = []

  const runtime = createSyncRuntime({
    configFile,
    dataDir,
    readLocalState: async () => localState,
    writeLocalState: async (nextState) => nextState,
    fetchImpl: async (input, init = {}) => {
      const url = String(input)
      const method = String(init.method || 'GET')
      const body = typeof init.body === 'string' ? JSON.parse(init.body) : null
      seenRequests.push({ url, method, body })

      if (url === 'https://todo.example.com/api/state' && method === 'GET') {
        return new Response(JSON.stringify({ ok: true, state: remoteState }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }

      if (url === 'https://todo.example.com/api/assets' && method === 'POST') {
        return new Response(
          JSON.stringify({
            ok: true,
            image: localAttachment,
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          },
        )
      }

      if (url === 'https://todo.example.com/api/state' && method === 'PUT') {
        return new Response(
          JSON.stringify({
            ok: true,
            state: body.state,
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          },
        )
      }

      throw new Error(`Unexpected request: ${url} ${method}`)
    },
  })

  await runtime.setConfig({
    enabled: true,
    serverUrl: 'https://todo.example.com/',
    token: 'secret-token',
  })

  const result = await runtime.syncNow('manual')

  assert.equal(result.direction, 'push')
  assert.equal(seenRequests[1].url, 'https://todo.example.com/api/assets')
  assert.deepEqual(seenRequests[1].body, {
    taskId: 'task-local',
    mimeType: 'image/png',
    dataBase64: Buffer.from([9, 8, 7]).toString('base64'),
    requestedStoragePath: 'task-assets/task-local/photo.png',
  })
  assert.equal(seenRequests[2].url, 'https://todo.example.com/api/state')
  assert.equal(seenRequests[2].body.state.settings.opacity, 0.56)
  assert.deepEqual(
    seenRequests[2].body.state.tasks.map((task) => task.id),
    ['task-local'],
  )

  await fs.rm(root, { recursive: true, force: true })
})
