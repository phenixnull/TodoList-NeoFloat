import { AppData, CheckIn, DayRecord, Task } from '../domain/types';

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
        'Content-Type': 'application/json',
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
): Promise<Pick<AppData, 'tasks' | 'checkIns' | 'dayRecords'>> {
  const [tasks, checkIns, dayRecords] = await Promise.all([
    apiRequest<Task[]>(serverUrl, '/api/tasks'),
    apiRequest<CheckIn[]>(serverUrl, '/api/checkins'),
    apiRequest<DayRecord[]>(serverUrl, '/api/day-records'),
  ]);

  return { tasks, checkIns, dayRecords };
}

export async function requestError(response: Response): Promise<Error> {
  return new Error(`API ${response.status}`);
}
