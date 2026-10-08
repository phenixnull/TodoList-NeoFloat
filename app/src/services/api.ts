import { AppData, CheckIn, DayRecord, Task, VoiceRecord } from '../domain/types';

export function normalizeServerUrl(url: string): string {
  return url.trim().replace(/\/+$/, '');
}

export async function apiRequest<T>(serverUrl: string, path: string, init: RequestInit = {}): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  try {
    const response = await fetch(`${normalizeServerUrl(serverUrl)}${path}`, {
      ...init,
      signal: controller.signal,
      headers: {
        // Fastify rejects an empty request body when this header is JSON.
        // DELETE has no body, so the header must be conditional.
        ...(init.body != null ? { 'Content-Type': 'application/json' } : {}),
        ...(init.headers ?? {}),
      },
    });

    if (!response.ok) {
      throw new Error(`API ${response.status}`);
    }

    return (await response.json()) as T;
  } finally {
    clearTimeout(timeout);
  }
}

export async function fetchServerData(
  serverUrl: string,
): Promise<Pick<AppData, 'tasks' | 'checkIns' | 'dayRecords' | 'voiceRecords'> & {
  revision?: number;
  instanceId?: string;
}> {
  try {
    // Prefer one transactionally consistent snapshot. Separate GETs can span
    // a check-in write and create a mixed generation that flips local UI.
    const snapshot = await apiRequest<Pick<AppData, 'tasks' | 'checkIns' | 'dayRecords' | 'voiceRecords'> & {
      revision?: number;
      instanceId?: string;
    }>(serverUrl, '/api/snapshot');
    if (Array.isArray(snapshot?.tasks) && Array.isArray(snapshot?.checkIns) && Array.isArray(snapshot?.dayRecords)) {
      // voiceRecords is optional so a still-running older server keeps working.
      return { ...snapshot, voiceRecords: Array.isArray(snapshot.voiceRecords) ? snapshot.voiceRecords : [] };
    }
    throw new Error('Invalid snapshot');
  } catch {
    // Compatibility with an older server that has not been restarted yet.
    const [tasks, checkIns, dayRecords, voiceRecords] = await Promise.all([
      apiRequest<Task[]>(serverUrl, '/api/tasks'),
      apiRequest<CheckIn[]>(serverUrl, '/api/checkins'),
      apiRequest<DayRecord[]>(serverUrl, '/api/day-records'),
      apiRequest<VoiceRecord[]>(serverUrl, '/api/voice-records').catch(() => [] as VoiceRecord[]),
    ]);

    return { tasks, checkIns, dayRecords, voiceRecords: Array.isArray(voiceRecords) ? voiceRecords : [] };
  }
}

export async function requestError(response: Response): Promise<Error> {
  return new Error(`API ${response.status}`);
}
