import { describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildApp } from '../src/app.js';

describe('HabitPulse API', () => {
  it('reports health', async () => {
    const app = buildApp({ database: ':memory:' });
    const response = await app.inject({ method: 'GET', url: '/api/health' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ ok: true });
  });

  it('forwards voice recordings to the local STT service', async () => {
    const upstreamCalls: Array<{ url: string; init: RequestInit }> = [];
    vi.stubGlobal('fetch', async (url: string | URL | Request, init?: RequestInit) => {
      upstreamCalls.push({ url: String(url), init: init ?? {} });
      return {
        ok: true,
        status: 200,
        json: async () => ({ text: '每天阅读二十分钟', language: 'Chinese' }),
      } as Response;
    });

    try {
      const app = buildApp({ database: ':memory:' });
      const audioBase64 = Buffer.from('RIFF-test-audio-payload-16-bytes', 'ascii').toString('base64');
      const response = await app.inject({
        method: 'POST',
        url: '/api/stt/transcribe',
        payload: { audioBase64, audioFormat: 'm4a' },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ text: '每天阅读二十分钟', language: 'Chinese' });
      expect(upstreamCalls).toHaveLength(1);
      expect(upstreamCalls[0].url).toContain('/transcribe');
      const upstreamBody = JSON.parse(String(upstreamCalls[0].init.body));
      expect(upstreamBody.audio_base64).toBe(audioBase64);
      expect(upstreamBody.audio_format).toBe('m4a');
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('returns 502 when the local STT service is offline', async () => {
    vi.stubGlobal('fetch', async () => {
      throw new Error('connect ECONNREFUSED 127.0.0.1:8100');
    });

    try {
      const app = buildApp({ database: ':memory:' });
      const audioBase64 = Buffer.from('RIFF-test-audio-payload-16-bytes', 'ascii').toString('base64');
      const response = await app.inject({
        method: 'POST',
        url: '/api/stt/transcribe',
        payload: { audioBase64, audioFormat: 'wav' },
      });

      expect(response.statusCode).toBe(502);
      expect(response.json().error).toBe('STT_SERVICE_UNAVAILABLE');
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('rejects invalid STT payloads', async () => {
    const app = buildApp({ database: ':memory:' });
    const response = await app.inject({
      method: 'POST',
      url: '/api/stt/transcribe',
      payload: { audioBase64: 'not-valid-base64!!!', audioFormat: 'wav' },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error).toBe('INVALID_STT_REQUEST');
  });

  it('streams update APKs with byte ranges so interrupted downloads can resume', async () => {
    const releaseDir = fs.mkdtempSync(path.join(os.tmpdir(), 'habitpulse-updates-'));
    const apk = Buffer.from('ABCDEFGHIJ', 'ascii');
    fs.writeFileSync(path.join(releaseDir, 'test.apk'), apk);
    fs.writeFileSync(path.join(releaseDir, 'update-manifest.json'), JSON.stringify({
      versionName: '1.0.0',
      versionCode: 1,
      fileName: 'test.apk',
      apkPath: '/api/updates/apk',
      mandatory: false,
      releaseNotes: [],
      publishedAt: '2026-10-08T00:00:00.000Z',
    }));

    const app = buildApp({ database: ':memory:', releaseDir });
    const head = await app.inject({ method: 'HEAD', url: '/api/updates/apk' });
    expect(head.statusCode).toBe(200);
    expect(head.headers['content-length']).toBe('10');
    expect(head.headers['accept-ranges']).toBe('bytes');

    const range = await app.inject({
      method: 'GET',
      url: '/api/updates/apk',
      headers: { range: 'bytes=2-5' },
    });
    expect(range.statusCode).toBe(206);
    expect(range.headers['content-range']).toBe('bytes 2-5/10');
    expect(range.headers['content-length']).toBe('4');
    expect(range.headers['accept-ranges']).toBe('bytes');
    expect(range.rawPayload).toEqual(Buffer.from('CDEF', 'ascii'));

    const suffix = await app.inject({
      method: 'GET',
      url: '/api/updates/apk',
      headers: { range: 'bytes=-3' },
    });
    expect(suffix.statusCode).toBe(206);
    expect(suffix.headers['content-range']).toBe('bytes 7-9/10');
    expect(suffix.rawPayload).toEqual(Buffer.from('HIJ', 'ascii'));

    const invalid = await app.inject({
      method: 'GET',
      url: '/api/updates/apk',
      headers: { range: 'bytes=20-30' },
    });
    expect(invalid.statusCode).toBe(416);
    expect(invalid.headers['content-range']).toBe('bytes */10');

    fs.rmSync(releaseDir, { recursive: true, force: true });
  });

  it('creates, reads, updates, and soft-deletes tasks', async () => {
    const app = buildApp({ database: ':memory:' });
    await app.inject({
      method: 'POST',
      url: '/api/tasks',
      payload: {
        name: 'Read',
        icon: 'book-open-variant',
        color: '#22d3ee',
        description: 'Twenty pages',
        iconImage: 'data:image/jpeg;base64,custom-icon',
        sortOrder: 4,
        timerSegments: [
          { id: 'segment', startAt: '2026-10-02T08:00:00.000Z', stopAt: '2026-10-02T08:10:00.000Z' },
        ],
        manualDurationMs: 60_000,
      },
    });

    let tasks = (await app.inject({ url: '/api/tasks' })).json() as Array<any>;
    expect(tasks).toHaveLength(1);
    expect(tasks[0].name).toBe('Read');
    expect(tasks[0].iconImage).toBe('data:image/jpeg;base64,custom-icon');
    expect(tasks[0].sortOrder).toBe(4);
    expect(tasks[0].timerSegments).toHaveLength(1);
    expect(tasks[0].manualDurationMs).toBe(60_000);

    const updated = await app.inject({
      method: 'PATCH',
      url: `/api/tasks/${tasks[0].id}`,
      payload: {
        name: 'Read daily',
        sortOrder: 7,
        timerSegments: [
          { id: 'segment', startAt: '2026-10-02T08:00:00.000Z', stopAt: '2026-10-02T08:10:00.000Z' },
          { id: 'live', startAt: '2026-10-02T09:00:00.000Z', stopAt: null },
        ],
        manualDurationMs: 120_000,
      },
    });
    expect(updated.statusCode).toBe(200);
    expect(updated.json().name).toBe('Read daily');
    expect(updated.json().sortOrder).toBe(7);
    expect(updated.json().timerSegments).toHaveLength(2);
    expect(updated.json().manualDurationMs).toBe(120_000);

    await app.inject({ method: 'DELETE', url: `/api/tasks/${tasks[0].id}` });
    tasks = (await app.inject({ url: '/api/tasks' })).json() as Array<any>;
    expect(tasks).toHaveLength(0);
  });

  it('stores negative manual duration as a signed correction', async () => {
    const app = buildApp({ database: ':memory:' });
    const created = await app.inject({
      method: 'POST',
      url: '/api/tasks',
      payload: {
        name: 'Signed manual',
        icon: 'timer-outline',
        color: '#22d3ee',
        description: '',
        timerSegments: [
          { id: 'segment', startAt: '2026-10-02T08:00:00.000Z', stopAt: '2026-10-02T09:00:00.000Z' },
        ],
        manualDurationMs: -20 * 60_000,
      },
    });

    expect(created.statusCode).toBe(201);
    expect(created.json().manualDurationMs).toBe(-20 * 60_000);

    const updated = await app.inject({
      method: 'PATCH',
      url: `/api/tasks/${created.json().id}`,
      payload: { manualDurationMs: -45 * 60_000 },
    });

    expect(updated.statusCode).toBe(200);
    expect(updated.json().timerSegments).toHaveLength(1);
    expect(updated.json().manualDurationMs).toBe(-45 * 60_000);
  });

  it('syncs app usage bindings and foreground segments separately from manual timing', async () => {
    const app = buildApp({ database: ':memory:' });
    const created = await app.inject({
      method: 'POST',
      url: '/api/tasks',
      payload: {
        name: 'Bound usage',
        icon: 'android',
        color: '#22d3ee',
        description: '',
        appUsageBinding: { packageName: 'com.example.reader', appName: 'Reader' },
        appUsageSegments: [
          { id: 'app-com.example.reader-1', startAt: '2026-10-08T01:00:00.000Z', stopAt: '2026-10-08T01:20:00.000Z' },
        ],
      },
    });

    expect(created.statusCode).toBe(201);
    expect(created.json().appUsageBinding).toEqual({
      packageName: 'com.example.reader',
      appName: 'Reader',
    });
    expect(created.json().appUsageSegments).toHaveLength(1);

    const closed = await app.inject({
      method: 'PATCH',
      url: `/api/tasks/${created.json().id}`,
      payload: {
        appUsageSegments: [
          { id: 'app-com.example.reader-1', startAt: '2026-10-08T01:00:00.000Z', stopAt: '2026-10-08T01:20:00.000Z' },
        ],
      },
    });
    expect(closed.statusCode).toBe(200);
    expect(closed.json().appUsageBinding).toEqual({
      packageName: 'com.example.reader',
      appName: 'Reader',
    });

    const renamed = await app.inject({
      method: 'PATCH',
      url: `/api/tasks/${created.json().id}`,
      payload: { name: 'Renamed bound usage' },
    });
    expect(renamed.statusCode).toBe(200);
    expect(renamed.json().appUsageBinding).toEqual({
      packageName: 'com.example.reader',
      appName: 'Reader',
    });
    expect(renamed.json().appUsageSegments).toHaveLength(1);

    const rebound = await app.inject({
      method: 'PATCH',
      url: `/api/tasks/${created.json().id}`,
      payload: { appUsageBinding: null, appUsageSegments: [] },
    });
    expect(rebound.statusCode).toBe(200);
    expect(rebound.json().appUsageBinding).toBeNull();
    expect(rebound.json().appUsageSegments).toEqual([]);
  });

  it('accepts realtime foreground-service usage samples and rejects mismatched bindings', async () => {
    const app = buildApp({ database: ':memory:' });
    const created = await app.inject({
      method: 'POST',
      url: '/api/tasks',
      payload: {
        name: 'Foreground service usage',
        icon: 'android',
        color: '#22d3ee',
        description: '',
        appUsageBinding: { packageName: 'com.example.reader', appName: 'Reader' },
      },
    });
    const taskId = created.json().id;

    const first = await app.inject({
      method: 'POST',
      url: '/api/usage/samples',
      payload: {
        samples: [{
          taskId,
          packageName: 'com.example.reader',
          segments: [
            { id: 'app-com.example.reader-live', startAt: '2026-10-08T01:00:00.000Z', stopAt: null },
          ],
        }],
      },
    });
    expect(first.statusCode).toBe(200);
    expect(first.json().updatedIds).toEqual([taskId]);

    const closed = await app.inject({
      method: 'POST',
      url: '/api/usage/samples',
      payload: {
        samples: [{
          taskId,
          packageName: 'com.example.reader',
          segments: [
            { id: 'app-com.example.reader-live', startAt: '2026-10-08T01:00:00.000Z', stopAt: '2026-10-08T01:05:00.000Z' },
          ],
        }],
      },
    });
    expect(closed.statusCode).toBe(200);

    const snapshot = (await app.inject({ url: '/api/snapshot' })).json() as any;
    const task = snapshot.tasks.find((item: any) => item.id === taskId);
    expect(task.appUsageSegments[0].stopAt).toBe('2026-10-08T01:05:00.000Z');

    const mismatched = await app.inject({
      method: 'POST',
      url: '/api/usage/samples',
      payload: {
        samples: [{
          taskId,
          packageName: 'com.example.other',
          segments: [{ id: 'bad', startAt: '2026-10-08T02:00:00.000Z', stopAt: null }],
        }],
      },
    });
    expect(mismatched.statusCode).toBe(200);
    expect(mismatched.json().updatedIds).toEqual([]);
  });

  it('deletes timer segments with tombstones and prevents stale sync from reviving them', async () => {
    const app = buildApp({ database: ':memory:' });
    const created = await app.inject({
      method: 'POST',
      url: '/api/tasks',
      payload: {
        name: 'Timer sync',
        icon: 'timer-outline',
        color: '#22d3ee',
        description: '',
        timerSegments: [
          { id: 'old', startAt: '2026-10-02T08:00:00.000Z', stopAt: '2026-10-02T08:30:00.000Z' },
          { id: 'current', startAt: '2026-10-02T09:00:00.000Z', stopAt: '2026-10-02T10:00:00.000Z' },
        ],
        removedSegmentIds: [],
      },
    });
    const taskId = created.json().id;

    const deleted = await app.inject({
      method: 'PATCH',
      url: `/api/tasks/${taskId}`,
      payload: {
        timerSegments: [
          { id: 'current', startAt: '2026-10-02T09:00:00.000Z', stopAt: '2026-10-02T10:00:00.000Z' },
        ],
        removedSegmentIds: ['old'],
      },
    });
    expect(deleted.statusCode).toBe(200);
    expect(deleted.json().timerSegments.map((segment: any) => segment.id)).toEqual(['current']);
    expect(deleted.json().removedSegmentIds).toEqual(['old']);

    // A stale client may still send the full pre-deletion list after refresh.
    const staleSync = await app.inject({
      method: 'PATCH',
      url: `/api/tasks/${taskId}`,
      payload: {
        timerSegments: [
          { id: 'old', startAt: '2026-10-02T08:00:00.000Z', stopAt: '2026-10-02T08:30:00.000Z' },
          { id: 'current', startAt: '2026-10-02T09:00:00.000Z', stopAt: '2026-10-02T10:00:00.000Z' },
        ],
      },
    });
    expect(staleSync.json().timerSegments.map((segment: any) => segment.id)).toEqual(['current']);

    const editCurrent = await app.inject({
      method: 'PATCH',
      url: `/api/tasks/${taskId}`,
      payload: {
        timerSegments: [
          { id: 'current', startAt: '2026-10-02T09:00:00.000Z', stopAt: '2026-10-02T10:30:00.000Z' },
        ],
      },
    });
    expect(editCurrent.json().timerSegments[0].stopAt).toBe('2026-10-02T10:30:00.000Z');
  });

  it('toggles one check-in per task per day', async () => {
    const app = buildApp({ database: ':memory:' });
    const created = await app.inject({
      method: 'POST',
      url: '/api/tasks',
      payload: { name: 'Exercise', icon: 'run', color: '#f97316', description: '' },
    });
    const taskId = created.json().id;

    const first = await app.inject({
      method: 'POST',
      url: '/api/checkins/toggle',
      payload: { taskId, date: '2026-01-01' },
    });
    expect(first.json().checkedIn).toBe(true);

    const duplicate = await app.inject({
      method: 'POST',
      url: '/api/checkins/toggle',
      payload: { taskId, date: '2026-01-01' },
    });
    expect(duplicate.statusCode).toBe(200);
    expect(duplicate.json().checkedIn).toBe(true);

    const snapshot = (await app.inject({ url: '/api/snapshot' })).json() as any;
    expect(snapshot.revision).toBeGreaterThan(0);
    expect(snapshot.checkIns).toHaveLength(1);

    const all = await app.inject({ url: '/api/checkins' });
    expect(all.json()).toHaveLength(1);

    const deleted = await app.inject({
      method: 'DELETE',
      url: `/api/checkins/${taskId}/2026-01-01`,
    });
    expect(deleted.json()).toEqual({ ok: true, deleted: true });

    const afterDelete = await app.inject({ url: '/api/checkins' });
    expect(afterDelete.json()).toHaveLength(0);
  });

  it('stores and clears failed check-ins without counting them as success', async () => {
    const app = buildApp({ database: ':memory:' });
    const created = await app.inject({
      method: 'POST',
      url: '/api/tasks',
      payload: { name: 'Failure habit', icon: 'run', color: '#f87171', description: '' },
    });
    const taskId = created.json().id;

    await app.inject({
      method: 'POST',
      url: '/api/checkins/status',
      payload: { taskId, date: '2026-01-01', status: 'failed' },
    });

    const snapshot = (await app.inject({ url: '/api/snapshot' })).json() as any;
    expect(snapshot.checkIns[0].status).toBe('failed');

    const restored = await app.inject({
      method: 'POST',
      url: '/api/checkins/toggle',
      payload: { taskId, date: '2026-01-01' },
    });
    expect(restored.json().checkIn.status).toBe('success');
  });

  it('stores day-record metadata and serves its image', async () => {
    const imageRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'habitpulse-images-'));
    const app = buildApp({ database: ':memory:', imageRoot });
    const created = await app.inject({
      method: 'POST',
      url: '/api/tasks',
      payload: { name: 'Photo habit', icon: 'camera-outline', color: '#22d3ee', description: '' },
    });
    const taskId = created.json().id;
    const image = {
      fileName: '2026-10-02.jpg',
      width: 320,
      height: 240,
      mimeType: 'image/jpeg',
      localUri: 'file:///should-not-persist.jpg',
    };

    const saved = await app.inject({
      method: 'POST',
      url: '/api/day-records',
      payload: {
        taskId,
        date: '2026-10-02',
        note: 'Today finished',
        image,
        imageBase64: Buffer.from('day-image').toString('base64'),
        createdAt: '2026-10-02T01:00:00.000Z',
        updatedAt: '2026-10-02T01:00:00.000Z',
      },
    });
    expect(saved.statusCode).toBe(201);
    expect(saved.json().image.localUri).toBeNull();

    let records = (await app.inject({ url: '/api/day-records' })).json() as Array<any>;
    expect(records).toHaveLength(1);
    expect(records[0].note).toBe('Today finished');

    const imageResponse = await app.inject({
      url: `/api/day-records/${taskId}/2026-10-02/image`,
      method: 'GET',
    });
    expect(imageResponse.statusCode).toBe(200);
    expect(imageResponse.headers['content-type']).toBe('image/jpeg');
    expect(imageResponse.rawPayload.toString()).toBe('day-image');

    const updated = await app.inject({
      method: 'POST',
      url: '/api/day-records',
      payload: {
        taskId,
        date: '2026-10-02',
        note: 'Updated note',
        image,
        updatedAt: '2026-10-02T02:00:00.000Z',
      },
    });
    expect(updated.statusCode).toBe(200);
    expect(updated.json().note).toBe('Updated note');

    const imageAfterUpdate = await app.inject({
      url: `/api/day-records/${taskId}/2026-10-02/image`,
      method: 'GET',
    });
    expect(imageAfterUpdate.statusCode).toBe(200);

    const cleared = await app.inject({
      method: 'POST',
      url: '/api/day-records',
      payload: {
        taskId,
        date: '2026-10-02',
        note: 'Image removed',
        image: null,
        updatedAt: '2026-10-02T03:00:00.000Z',
      },
    });
    expect(cleared.statusCode).toBe(200);
    expect(cleared.json().image).toBeNull();

    records = (await app.inject({ url: '/api/day-records' })).json() as Array<any>;
    expect(records[0].note).toBe('Image removed');
    fs.rmSync(imageRoot, { recursive: true, force: true });
  });

  it('stores and serves multiple day-record images', async () => {
    const imageRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'habitpulse-multi-images-'));
    const app = buildApp({ database: ':memory:', imageRoot });
    const created = await app.inject({
      method: 'POST',
      url: '/api/tasks',
      payload: { name: 'Reading', icon: 'book-open-variant', color: '#22c55e', description: '' },
    });
    const taskId = created.json().id;
    const images = [
      { fileName: 'first.jpg', width: 10, height: 10, mimeType: 'image/jpeg' },
      { fileName: 'second.png', width: 20, height: 20, mimeType: 'image/png' },
    ];

    const saved = await app.inject({
      method: 'POST',
      url: '/api/day-records',
      payload: {
        taskId,
        date: '2026-10-01',
        note: 'Two photos',
        images,
        imageBase64s: [
          Buffer.from('first-image').toString('base64'),
          Buffer.from('second-image').toString('base64'),
        ],
        updatedAt: '2026-10-01T01:00:00.000Z',
      },
    });

    expect(saved.statusCode).toBe(201);
    expect(saved.json().images).toHaveLength(2);
    expect(saved.json().image.fileName).toBe('first.jpg');

    const first = await app.inject({ url: `/api/day-records/${taskId}/2026-10-01/images/0` });
    const second = await app.inject({ url: `/api/day-records/${taskId}/2026-10-01/images/1` });

    expect(first.rawPayload.toString()).toBe('first-image');
    expect(first.headers['content-type']).toBe('image/jpeg');
    expect(second.rawPayload.toString()).toBe('second-image');
    expect(second.headers['content-type']).toBe('image/png');

    const appended = await app.inject({
      method: 'POST',
      url: '/api/day-records',
      payload: {
        taskId,
        date: '2026-10-01',
        note: 'Three photos',
        images: [
          ...images,
          { fileName: 'third.webp', width: 30, height: 30, mimeType: 'image/webp' },
        ],
        imageUploads: [{
          index: 2,
          base64: Buffer.from('third-image').toString('base64'),
        }],
        updatedAt: '2026-10-01T02:00:00.000Z',
      },
    });

    expect(appended.statusCode).toBe(200);
    expect(appended.json().images).toHaveLength(3);

    const retainedFirst = await app.inject({ url: `/api/day-records/${taskId}/2026-10-01/images/0` });
    const third = await app.inject({ url: `/api/day-records/${taskId}/2026-10-01/images/2` });

    expect(retainedFirst.rawPayload.toString()).toBe('first-image');
    expect(third.rawPayload.toString()).toBe('third-image');

    const cleared = await app.inject({
      method: 'POST',
      url: '/api/day-records',
      payload: {
        taskId,
        date: '2026-10-01',
        note: 'Cleared',
        images: [],
        updatedAt: '2026-10-01T03:00:00.000Z',
      },
    });

    expect(cleared.statusCode).toBe(200);
    expect(cleared.json().images).toEqual([]);
    expect(fs.readdirSync(imageRoot)).toEqual([]);
    fs.rmSync(imageRoot, { recursive: true, force: true });
  });
});
