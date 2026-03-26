import crypto from 'node:crypto'
import path from 'node:path'

function sanitizeTaskId(taskId) {
  return String(taskId || 'task').replace(/[^\w-]/g, '_') || 'task'
}

function extensionFromMimeType(mimeType) {
  switch (mimeType) {
    case 'image/jpeg':
      return 'jpg'
    case 'image/webp':
      return 'webp'
    case 'image/gif':
      return 'gif'
    case 'image/bmp':
      return 'bmp'
    default:
      return 'png'
  }
}

function normalizeStoragePath(value) {
  return String(value || '').replace(/\\/g, '/').replace(/^\/+/, '')
}

function isSafeAssetPath(storagePath) {
  if (!storagePath || !storagePath.startsWith('task-assets/')) {
    return false
  }

  const normalized = path.posix.normalize(storagePath)
  if (normalized.startsWith('../') || normalized.includes('/../') || normalized === '..') {
    return false
  }

  return normalized === storagePath
}

export function isAuthorizedRequest({ expectedToken, authorizationHeader, queryToken }) {
  const expected = String(expectedToken || '').trim()
  if (!expected) {
    return false
  }

  const headerValue = String(authorizationHeader || '').trim()
  const bearerToken = headerValue.toLowerCase().startsWith('bearer ') ? headerValue.slice(7).trim() : ''
  return bearerToken === expected || String(queryToken || '').trim() === expected
}

export function normalizeRequestedStoragePath({ taskId, mimeType, requestedStoragePath }) {
  const normalizedRequestedPath = normalizeStoragePath(requestedStoragePath)
  if (isSafeAssetPath(normalizedRequestedPath)) {
    return normalizedRequestedPath
  }

  const safeTaskId = sanitizeTaskId(taskId)
  const extension = extensionFromMimeType(mimeType)
  const fileName = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${extension}`
  return `task-assets/${safeTaskId}/${fileName}`
}
