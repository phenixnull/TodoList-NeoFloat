import type { PersistedState, TaskImageAttachment } from '../types/domain.ts'
import type { SyncConfig } from '../types/sync.ts'
import { buildRemoteAssetUrl, normalizeSyncConfig } from '../lib/sync.ts'

type FetchLike = typeof fetch

type ApiErrorResponse = {
  ok?: boolean
  error?: string
}

type StateResponse = {
  ok?: boolean
  error?: string
  state?: PersistedState
}

type UploadResponse = {
  ok?: boolean
  error?: string
  image?: TaskImageAttachment
}

type UploadPayload = {
  taskId: string
  mimeType: string
  dataBase64: string
  requestedStoragePath?: string
}

function toApiUrl(serverUrl: string, pathname: string): string {
  const base = normalizeSyncConfig({ serverUrl }).serverUrl
  return `${base}${pathname}`
}

function createHeaders(token: string, withJsonBody = false): Headers {
  const headers = new Headers({
    Authorization: `Bearer ${token}`,
  })

  if (withJsonBody) {
    headers.set('Content-Type', 'application/json')
  }

  return headers
}

async function parseJsonResponse<T extends ApiErrorResponse>(response: Response): Promise<T> {
  const contentType = response.headers.get('Content-Type') || ''
  const payload =
    contentType.includes('application/json') || contentType.includes('+json')
      ? ((await response.json()) as T)
      : ({ ok: response.ok, error: await response.text() } as T)

  if (!response.ok || payload.ok === false) {
    throw new Error(payload.error || `Request failed with status ${response.status}`)
  }

  return payload
}

export async function fetchRemoteState(config: SyncConfig, fetchImpl: FetchLike = fetch): Promise<PersistedState> {
  const normalized = normalizeSyncConfig(config)
  const response = await fetchImpl(toApiUrl(normalized.serverUrl, '/api/state'), {
    method: 'GET',
    headers: createHeaders(normalized.token),
  })
  const payload = await parseJsonResponse<StateResponse>(response)

  if (!payload.state) {
    throw new Error('Remote state missing from response')
  }

  return payload.state
}

export async function saveRemoteState(
  config: SyncConfig,
  state: PersistedState,
  fetchImpl: FetchLike = fetch,
): Promise<PersistedState> {
  const normalized = normalizeSyncConfig(config)
  const response = await fetchImpl(toApiUrl(normalized.serverUrl, '/api/state'), {
    method: 'PUT',
    headers: createHeaders(normalized.token, true),
    body: JSON.stringify({ state }),
  })
  const payload = await parseJsonResponse<StateResponse>(response)

  if (!payload.state) {
    throw new Error('Saved state missing from response')
  }

  return payload.state
}

export async function uploadRemoteImage(
  config: SyncConfig,
  payload: UploadPayload,
  fetchImpl: FetchLike = fetch,
): Promise<TaskImageAttachment> {
  const normalized = normalizeSyncConfig(config)
  const response = await fetchImpl(toApiUrl(normalized.serverUrl, '/api/assets'), {
    method: 'POST',
    headers: createHeaders(normalized.token, true),
    body: JSON.stringify(payload),
  })
  const result = await parseJsonResponse<UploadResponse>(response)

  if (!result.image) {
    throw new Error('Uploaded image missing from response')
  }

  return result.image
}

export function buildMobileAssetUrl(config: SyncConfig, storagePath: string): string {
  const normalized = normalizeSyncConfig(config)
  return buildRemoteAssetUrl(normalized.serverUrl, storagePath, normalized.token)
}
