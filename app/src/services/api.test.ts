import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiRequest } from './api';

describe('apiRequest', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('does not send JSON content-type for bodyless DELETE requests', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ ok: true }),
    }));
    vi.stubGlobal('fetch', fetchMock);

    await apiRequest('http://server.test', '/api/checkins/t1/2026-10-04', { method: 'DELETE' });

    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers['Content-Type']).toBeUndefined();
  });

  it('sends JSON content-type when a body exists', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ ok: true }),
    }));
    vi.stubGlobal('fetch', fetchMock);

    await apiRequest('http://server.test', '/api/checkins/toggle', {
      method: 'POST',
      body: JSON.stringify({ taskId: 't1', date: '2026-10-04' }),
    });

    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers['Content-Type']).toBe('application/json');
  });
});
