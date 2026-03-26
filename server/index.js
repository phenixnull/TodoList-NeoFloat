import fs from 'node:fs/promises'
import fsSync from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { isAuthorizedRequest, normalizeRequestedStoragePath } from './syncCore.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..')
const distDir = process.env.TODO_SYNC_DIST_DIR
  ? path.resolve(process.env.TODO_SYNC_DIST_DIR)
  : path.join(rootDir, 'dist')
const dataDir = process.env.TODO_SYNC_DATA_DIR
  ? path.resolve(process.env.TODO_SYNC_DATA_DIR)
  : path.join(rootDir, 'server-data')
const snapshotFile = path.join(dataDir, 'state.snapshot.json')
const port = Number(process.env.TODO_SYNC_PORT || 8787)
const host = process.env.TODO_SYNC_HOST || '0.0.0.0'
const syncToken = String(process.env.TODO_SYNC_TOKEN || '').trim()
const BODY_LIMIT_BYTES = 12 * 1024 * 1024

const DEFAULT_SETTINGS = {
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
}

let stateCache = defaultState()
let persistQueue = Promise.resolve()

function pad(value) {
  return String(value).padStart(2, '0')
}

function padMs(value) {
  return String(value).padStart(3, '0')
}

function toLocalIso(date = new Date()) {
  const year = date.getFullYear()
  const month = pad(date.getMonth() + 1)
  const day = pad(date.getDate())
  const hours = pad(date.getHours())
  const minutes = pad(date.getMinutes())
  const seconds = pad(date.getSeconds())
  const milliseconds = padMs(date.getMilliseconds())

  const offsetMinutes = -date.getTimezoneOffset()
  const sign = offsetMinutes >= 0 ? '+' : '-'
  const absoluteOffset = Math.abs(offsetMinutes)
  const offsetHours = pad(Math.floor(absoluteOffset / 60))
  const offsetRemainderMinutes = pad(absoluteOffset % 60)

  return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}.${milliseconds}${sign}${offsetHours}:${offsetRemainderMinutes}`
}

function defaultState() {
  return {
    version: 1,
    tasks: [],
    settings: { ...DEFAULT_SETTINGS },
    updatedAt: toLocalIso(),
  }
}

function mergeState(raw) {
  if (!raw || typeof raw !== 'object') {
    return defaultState()
  }

  return {
    version: 1,
    tasks: Array.isArray(raw.tasks) ? raw.tasks : [],
    settings: {
      ...DEFAULT_SETTINGS,
      ...(raw.settings || {}),
    },
    updatedAt: typeof raw.updatedAt === 'string' && raw.updatedAt ? raw.updatedAt : toLocalIso(),
  }
}

function enqueuePersist(work) {
  const run = persistQueue.then(work)
  persistQueue = run.catch(() => undefined)
  return run
}

async function ensureDataDir() {
  await fs.mkdir(path.join(dataDir, 'task-assets'), { recursive: true })
}

async function readSnapshot() {
  try {
    const raw = await fs.readFile(snapshotFile, 'utf8')
    return mergeState(JSON.parse(raw))
  } catch {
    return defaultState()
  }
}

async function writeSnapshot(nextState) {
  const merged = {
    ...mergeState(nextState),
    updatedAt: toLocalIso(),
  }
  await fs.writeFile(snapshotFile, `${JSON.stringify(merged, null, 2)}\n`, 'utf8')
  stateCache = merged
  return merged
}

function setCorsHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type')
  res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, POST, OPTIONS')
}

function writeJson(res, statusCode, payload) {
  setCorsHeaders(res)
  res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' })
  res.end(`${JSON.stringify(payload)}\n`)
}

function writeText(res, statusCode, body, contentType) {
  res.writeHead(statusCode, { 'Content-Type': contentType })
  res.end(body)
}

function contentTypeFromPath(filePath) {
  const ext = path.extname(filePath).toLowerCase()
  switch (ext) {
    case '.css':
      return 'text/css; charset=utf-8'
    case '.js':
      return 'text/javascript; charset=utf-8'
    case '.json':
      return 'application/json; charset=utf-8'
    case '.png':
      return 'image/png'
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg'
    case '.svg':
      return 'image/svg+xml'
    case '.webp':
      return 'image/webp'
    case '.ico':
      return 'image/x-icon'
    case '.html':
    default:
      return 'text/html; charset=utf-8'
  }
}

function resolveStoragePath(storagePath) {
  const normalized = String(storagePath || '')
    .split('/')
    .map((segment) => decodeURIComponent(segment))
    .join('/')
    .replace(/\\/g, '/')

  const absolutePath = path.resolve(dataDir, normalized)
  const relativePath = path.relative(dataDir, absolutePath)
  if (!normalized || relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
    throw new Error('Invalid asset path')
  }
  return absolutePath
}

function ensureAuthorized(req, url) {
  return isAuthorizedRequest({
    expectedToken: syncToken,
    authorizationHeader: req.headers.authorization || null,
    queryToken: url.searchParams.get('token'),
  })
}

function localImageAttachment(storagePath, mimeType) {
  return {
    id: path.basename(storagePath, path.extname(storagePath)),
    storagePath,
    mimeType,
    createdAt: toLocalIso(),
  }
}

async function readJsonBody(req) {
  const chunks = []
  let total = 0

  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    total += buffer.length
    if (total > BODY_LIMIT_BYTES) {
      throw new Error('Payload too large')
    }
    chunks.push(buffer)
  }

  if (chunks.length === 0) {
    return {}
  }

  return JSON.parse(Buffer.concat(chunks).toString('utf8'))
}

async function handleAssetUpload(body) {
  const taskId = typeof body.taskId === 'string' ? body.taskId : ''
  const mimeType = typeof body.mimeType === 'string' ? body.mimeType : ''
  const dataBase64 = typeof body.dataBase64 === 'string' ? body.dataBase64 : ''
  const requestedStoragePath = typeof body.requestedStoragePath === 'string' ? body.requestedStoragePath : ''

  if (!taskId || !mimeType.startsWith('image/') || !dataBase64) {
    throw new Error('Invalid asset upload payload')
  }

  const storagePath = normalizeRequestedStoragePath({
    taskId,
    mimeType,
    requestedStoragePath,
  })
  const absolutePath = resolveStoragePath(storagePath)
  const bytes = Buffer.from(dataBase64, 'base64')
  if (!bytes.length) {
    throw new Error('Empty asset payload')
  }

  await fs.mkdir(path.dirname(absolutePath), { recursive: true })
  await fs.writeFile(absolutePath, bytes)

  return {
    ok: true,
    image: localImageAttachment(storagePath, mimeType),
  }
}

async function tryServeStaticFile(urlPath, res) {
  if (!fsSync.existsSync(distDir)) {
    return false
  }

  const requestedPath = urlPath === '/' ? 'mobile.html' : urlPath.replace(/^\/+/, '')
  const absolutePath = path.resolve(distDir, requestedPath)
  const relativePath = path.relative(distDir, absolutePath)
  if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
    return false
  }

  try {
    const stat = await fs.stat(absolutePath)
    if (!stat.isFile()) {
      return false
    }
    const fileBuffer = await fs.readFile(absolutePath)
    writeText(res, 200, fileBuffer, contentTypeFromPath(absolutePath))
    return true
  } catch {
    if (urlPath === '/') {
      const mobileEntry = path.join(distDir, 'mobile.html')
      try {
        const fileBuffer = await fs.readFile(mobileEntry)
        writeText(res, 200, fileBuffer, 'text/html; charset=utf-8')
        return true
      } catch {
        return false
      }
    }
    return false
  }
}

async function createServer() {
  await ensureDataDir()
  stateCache = await readSnapshot()

  return http.createServer(async (req, res) => {
    if (!req.url || !req.method) {
      writeJson(res, 400, { ok: false, error: 'Invalid request' })
      return
    }

    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`)

    if (req.method === 'OPTIONS') {
      setCorsHeaders(res)
      res.writeHead(204)
      res.end()
      return
    }

    if (req.method === 'GET' && url.pathname === '/api/health') {
      writeJson(res, 200, {
        ok: true,
        updatedAt: stateCache.updatedAt,
        hasStaticClient: fsSync.existsSync(path.join(distDir, 'mobile.html')),
      })
      return
    }

    if (url.pathname.startsWith('/api/') && !ensureAuthorized(req, url)) {
      writeJson(res, 401, { ok: false, error: 'Unauthorized' })
      return
    }

    if (req.method === 'GET' && url.pathname === '/api/state') {
      writeJson(res, 200, { ok: true, state: stateCache })
      return
    }

    if (req.method === 'PUT' && url.pathname === '/api/state') {
      try {
        const body = await readJsonBody(req)
        const nextState = mergeState(body?.state)
        const saved = await enqueuePersist(() => writeSnapshot(nextState))
        writeJson(res, 200, { ok: true, state: saved })
      } catch (error) {
        writeJson(res, 400, {
          ok: false,
          error: error instanceof Error ? error.message : 'Failed to save state',
        })
      }
      return
    }

    if (req.method === 'POST' && url.pathname === '/api/assets') {
      try {
        const body = await readJsonBody(req)
        const saved = await handleAssetUpload(body)
        writeJson(res, 200, saved)
      } catch (error) {
        writeJson(res, 400, {
          ok: false,
          error: error instanceof Error ? error.message : 'Failed to upload asset',
        })
      }
      return
    }

    if (req.method === 'GET' && url.pathname.startsWith('/api/assets/')) {
      try {
        const storagePath = url.pathname.slice('/api/assets/'.length)
        const absolutePath = resolveStoragePath(storagePath)
        const buffer = await fs.readFile(absolutePath)
        writeText(res, 200, buffer, contentTypeFromPath(absolutePath))
      } catch {
        writeJson(res, 404, { ok: false, error: 'Asset not found' })
      }
      return
    }

    if (req.method === 'GET') {
      const served = await tryServeStaticFile(url.pathname, res)
      if (served) {
        return
      }
    }

    writeJson(res, 404, { ok: false, error: 'Not found' })
  })
}

if (!syncToken) {
  throw new Error('TODO_SYNC_TOKEN is required before starting the sync server')
}

const server = await createServer()

server.listen(port, host, () => {
  console.log(`Todo sync server listening on http://${host}:${port}`)
})
