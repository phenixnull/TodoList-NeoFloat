import assert from 'node:assert/strict'
import test from 'node:test'
import { isAuthorizedRequest, normalizeRequestedStoragePath } from '../server/syncCore.js'

test('isAuthorizedRequest accepts matching bearer token', () => {
  assert.equal(
    isAuthorizedRequest({
      expectedToken: 'secret-token',
      authorizationHeader: 'Bearer secret-token',
      queryToken: null,
    }),
    true,
  )
})

test('isAuthorizedRequest falls back to token query param for asset urls', () => {
  assert.equal(
    isAuthorizedRequest({
      expectedToken: 'secret-token',
      authorizationHeader: null,
      queryToken: 'secret-token',
    }),
    true,
  )
})

test('normalizeRequestedStoragePath preserves safe relative asset paths', () => {
  assert.equal(
    normalizeRequestedStoragePath({
      taskId: 'task-1',
      mimeType: 'image/png',
      requestedStoragePath: 'task-assets/task-1/example.png',
    }),
    'task-assets/task-1/example.png',
  )
})

test('normalizeRequestedStoragePath rewrites unsafe paths back under task-assets', () => {
  const normalized = normalizeRequestedStoragePath({
    taskId: 'task-1',
    mimeType: 'image/webp',
    requestedStoragePath: '../outside.png',
  })

  assert.match(normalized, /^task-assets\/task-1\/[\w-]+\.webp$/)
})
