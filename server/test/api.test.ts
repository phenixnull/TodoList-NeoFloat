import { describe, expect, it } from 'vitest';
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
