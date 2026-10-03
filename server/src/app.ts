import Fastify, { FastifyInstance } from 'fastify';
import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { createDatabase } from './db.js';

const isoDateTime = z.string().min(1);
const dateKey = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date must use YYYY-MM-DD');
const timeSegmentSchema = z.object({
  id: z.string().min(1),
  startAt: isoDateTime,
  stopAt: isoDateTime.nullable().optional(),
});

const createTaskSchema = z.object({
  id: z.string().min(1).optional(),
  name: z.string().trim().min(1).max(80),
  icon: z.string().trim().min(1).max(80),
  iconImage: z.string().max(1_500_000).nullable().default(null),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  description: z.string().max(500).default(''),
  sortOrder: z.number().int().min(0).default(0),
  timerSegments: z.array(timeSegmentSchema).default([]),
  manualDurationMs: z.number().int().min(0).default(0),
  createdAt: isoDateTime.optional(),
  updatedAt: isoDateTime.optional(),
});

const updateTaskSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  icon: z.string().trim().min(1).max(80).optional(),
  iconImage: z.string().max(1_500_000).nullable().optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  description: z.string().max(500).optional(),
  sortOrder: z.number().int().min(0).optional(),
  timerSegments: z.array(timeSegmentSchema).optional(),
  manualDurationMs: z.number().int().min(0).optional(),
});

const toggleCheckInSchema = z.object({
  taskId: z.string().min(1),
  date: dateKey,
});

const upsertCheckInSchema = z.object({
  id: z.string().min(1).optional(),
  taskId: z.string().min(1),
  date: dateKey,
  createdAt: isoDateTime.optional(),
});

const dayRecordImageSchema = z.object({
  fileName: z.string().min(1).max(200),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  mimeType: z.enum(['image/jpeg', 'image/png', 'image/webp']),
  localUri: z.string().optional().nullable(),
});

const dayRecordSchema = z.object({
  taskId: z.string().min(1),
  date: dateKey,
  note: z.string().max(5000).default(''),
  images: z.array(dayRecordImageSchema).max(12).default([]),
  image: dayRecordImageSchema.nullable().optional(),
  imageUploads: z.array(z.object({
    index: z.number().int().min(0).max(11),
    base64: z.string().base64().max(24_000_000),
  })).max(12).optional(),
  imageBase64s: z.array(z.string().base64().max(24_000_000)).max(12).optional(),
  imageBase64: z.string().base64().max(24_000_000).optional(),
  createdAt: isoDateTime.optional(),
  updatedAt: isoDateTime.optional(),
});

export type AppConfig = {
  database?: string;
  imageRoot?: string;
  dashboardPath?: string;
  releaseDir?: string;
};

function parseStoredImages(value: string | null | undefined): any[] {
  try {
    const parsed = JSON.parse(value ?? '[]');

    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function parseTimerSegments(value: string): any[] {
  try {
    const parsed = JSON.parse(value);

    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function buildApp({
  database = 'habitpulse.db',
  imageRoot = 'data/day-record-images',
  dashboardPath,
  releaseDir,
}: AppConfig = {}) {
  const resolvedImageRoot = path.resolve(imageRoot);
  fs.mkdirSync(resolvedImageRoot, { recursive: true });
  const app = Fastify({ logger: false, bodyLimit: 24_000_000 });
  const db = createDatabase({ database });
  const changeEvents = new EventEmitter();
  changeEvents.setMaxListeners(100);

  function broadcast(event: string, data: Record<string, unknown>) {
    changeEvents.emit('change', { event, data, at: new Date().toISOString() });
  }

  // Server-Sent Events: every write is pushed to connected clients so all
  // devices update in real time without polling.
  app.get('/api/events', async (request: any, reply: any) => {
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    });
    reply.raw.write(`retry: 3000\n\n`);
    reply.raw.write(`event: hello\ndata: {"ok":true}\n\n`);

    const listener = (payload: unknown) => {
      reply.raw.write(`data: ${JSON.stringify(payload)}\n\n`);
    };
    changeEvents.on('change', listener);

    const heartbeat = setInterval(() => {
      try {
        reply.raw.write(`: ping\n\n`);
      } catch {
        // ignore
      }
    }, 25_000);

    request.raw.on('close', () => {
      clearInterval(heartbeat);
      changeEvents.off('change', listener);
    });
    reply.hijack();
  });

  const resolvedDashboardPath = dashboardPath
    ? path.resolve(dashboardPath)
    : path.resolve(process.cwd(), '..', 'dashboard', 'habitpulse-dashboard.html');
  const resolvedReleaseDir = releaseDir
    ? path.resolve(releaseDir)
    : path.resolve(process.cwd(), '..', 'releases');

  function readUpdateManifest(): any {
    return JSON.parse(
      fs.readFileSync(path.join(resolvedReleaseDir, 'update-manifest.json'), 'utf8'),
    );
  }

  app.get('/api/updates/manifest', (_request: any, reply: any) => {
    try {
      const manifest = readUpdateManifest();

      return reply
        .header('Content-Type', 'application/json; charset=utf-8')
        .header('Cache-Control', 'no-cache')
        .send(manifest);
    } catch {
      return reply.code(404).send({ error: 'Update manifest not found' });
    }
  });

  app.get('/api/updates/apk', (_request: any, reply: any) => {
    try {
      const manifest = readUpdateManifest();
      const apkPath = path.join(resolvedReleaseDir, manifest.fileName);

      if (!fs.existsSync(apkPath)) {
        return reply.code(404).send({ error: 'APK not found' });
      }

      return reply
        .header('Content-Type', 'application/vnd.android.package-archive')
        .header('Cache-Control', 'no-cache')
        .header(
          'Content-Disposition',
          `attachment; filename="${manifest.fileName}"`,
        )
        .send(fs.readFileSync(apkPath));
    } catch {
      return reply.code(404).send({ error: 'Update package not found' });
    }
  });

  function serveDashboard(_request: any, reply: any) {
    if (!fs.existsSync(resolvedDashboardPath)) {
      return reply.code(404).send({ error: 'Dashboard not found' });
    }

    return reply
      .header('Content-Type', 'text/html; charset=utf-8')
      .header('Cache-Control', 'no-cache')
      .send(fs.readFileSync(resolvedDashboardPath));
  }

  app.get('/', serveDashboard);
  app.get('/dashboard.html', serveDashboard);

  app.addHook('onRequest', async (request, reply) => {
    reply.header('Access-Control-Allow-Origin', '*');
    reply.header('Access-Control-Allow-Headers', 'Content-Type');
    reply.header('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');

    if (request.method === 'OPTIONS') {
      return reply.code(204).send();
    }
  });

  function extensionForMimeType(mimeType: string): string {
    if (mimeType === 'image/png') {
      return 'png';
    }

    return mimeType === 'image/webp' ? 'webp' : 'jpg';
  }

  function imageStoragePath(row: any): string | null {
    if (!row?.image_storage_name) {
      return null;
    }

    return path.join(resolvedImageRoot, path.basename(row.image_storage_name));
  }

  app.get('/api/health', async () => ({ ok: true }));

  app.get('/api/tasks', async () => {
    const rows = db.prepare('SELECT * FROM tasks WHERE deleted_at IS NULL ORDER BY created_at').all() as Array<any>;

    return rows.map(rowFromTask);
  });

  app.post('/api/tasks', async (request, reply) => {
    const parsed = createTaskSchema.safeParse(request.body);

    if (!parsed.success) {
      return reply.code(400).send({ error: 'Invalid task', details: parsed.error.flatten() });
    }

    const now = new Date().toISOString();
    const task = {
      id: parsed.data.id ?? randomUUID(),
      name: parsed.data.name,
      icon: parsed.data.icon,
      iconImage: parsed.data.iconImage,
      color: parsed.data.color,
      description: parsed.data.description,
      sortOrder: parsed.data.sortOrder,
      timerSegments: parsed.data.timerSegments,
      manualDurationMs: parsed.data.manualDurationMs,
      createdAt: parsed.data.createdAt ?? now,
      updatedAt: parsed.data.updatedAt ?? now,
      deletedAt: null,
    };

    db.prepare(`
      INSERT INTO tasks (
        id, name, icon, icon_image, color, description, sort_order, timer_segments,
        manual_duration_ms, created_at, updated_at, deleted_at
      )
      VALUES (
        @id, @name, @icon, @iconImage, @color, @description, @sortOrder, @timerSegmentsJson,
        @manualDurationMs, @createdAt, @updatedAt, @deletedAt
      )
  `).run({
    ...task,
    timerSegments: undefined,
    timerSegmentsJson: JSON.stringify(parsed.data.timerSegments),
  });

    broadcast('task.created', { id: task.id });
    return reply.code(201).send(task);
  });

  app.patch('/api/tasks/:id', async (request, reply) => {
    const parsed = updateTaskSchema.safeParse(request.body);

    if (!parsed.success) {
      return reply.code(400).send({ error: 'Invalid task update', details: parsed.error.flatten() });
    }

    const existing = db.prepare('SELECT * FROM tasks WHERE id = ? AND deleted_at IS NULL').get((request.params as any).id) as any;

    if (!existing) {
      return reply.code(404).send({ error: 'Task not found' });
    }

    const patch = parsed.data;
    // Timer segments are append-only operational state: union by id and never
    // drop segments known to the server, so concurrent timer use on two
    // devices cannot erase each other's running segments.
    const mergedSegments = (() => {
      if (!patch.timerSegments) {
        return parseTimerSegments(existing.timer_segments);
      }
      const byId = new Map<string, any>();
      for (const seg of parseTimerSegments(existing.timer_segments)) {
        byId.set(seg.id, seg);
      }
      for (const seg of patch.timerSegments) {
        const stored = byId.get(seg.id);
        if (!stored) {
          byId.set(seg.id, seg);
        } else {
          byId.set(seg.id, {
            id: seg.id,
            startAt: seg.startAt ?? stored.startAt,
            stopAt: seg.stopAt ?? stored.stopAt ?? null,
          });
        }
      }
      return [...byId.values()];
    })();

    const current = rowFromTask(existing);
    const updated = {
      ...current,
      ...patch,
      timerSegments: mergedSegments,
      updatedAt: new Date().toISOString(),
    };

    db.prepare(`
      UPDATE tasks SET
        name = @name,
        icon = @icon,
        icon_image = @iconImage,
        color = @color,
        description = @description,
        sort_order = @sortOrder,
        timer_segments = @timerSegmentsJson,
        manual_duration_ms = @manualDurationMs,
        updated_at = @updatedAt
      WHERE id = @id
    `).run({
      ...updated,
      iconImage: updated.iconImage ?? null,
      timerSegmentsJson: JSON.stringify(updated.timerSegments),
      deletedAt: undefined,
    });

    broadcast('task.updated', { id: updated.id });
    return updated;
  });

  app.delete('/api/tasks/:id', async (request, reply) => {
    const id = (request.params as any).id;
    const result = db.prepare('UPDATE tasks SET deleted_at = ? WHERE id = ? AND deleted_at IS NULL').run(new Date().toISOString(), id);

    if (result.changes === 0) {
      return reply.code(404).send({ error: 'Task not found' });
    }

    broadcast('task.deleted', { id });
    return { ok: true };
  });

  app.get('/api/checkins', async () => {
    const rows = db.prepare('SELECT * FROM check_ins WHERE deleted_at IS NULL ORDER BY date, created_at').all() as Array<any>;

    return rows.map(rowFromCheckIn);
  });

  app.post('/api/checkins', async (request, reply) => {
    const parsed = upsertCheckInSchema.safeParse(request.body);

    if (!parsed.success) {
      return reply.code(400).send({ error: 'Invalid check-in', details: parsed.error.flatten() });
    }

    const id = parsed.data.id ?? randomUUID();
    const createdAt = parsed.data.createdAt ?? new Date().toISOString();

    const existingRow = db.prepare('SELECT * FROM check_ins WHERE task_id = ? AND date = ?').get(parsed.data.taskId, parsed.data.date) as any;

    if (existingRow) {
      if (existingRow.deleted_at) {
        db.prepare('UPDATE check_ins SET deleted_at = NULL, created_at = ?, id = ? WHERE task_id = ? AND date = ?')
          .run(createdAt, id, parsed.data.taskId, parsed.data.date);
        broadcast('checkin.changed', { taskId: parsed.data.taskId, date: parsed.data.date });
        return reply.code(201).send({ id, taskId: parsed.data.taskId, date: parsed.data.date, createdAt });
      }

      return reply.code(200).send(rowFromCheckIn(existingRow));
    }

    db.prepare('INSERT INTO check_ins (id, task_id, date, created_at, deleted_at) VALUES (?, ?, ?, ?, NULL)')
      .run(id, parsed.data.taskId, parsed.data.date, createdAt);
    broadcast('checkin.changed', { taskId: parsed.data.taskId, date: parsed.data.date });
    return reply.code(201).send({ id, taskId: parsed.data.taskId, date: parsed.data.date, createdAt });
  });

  app.post('/api/checkins/toggle', async (request, reply) => {
    const parsed = toggleCheckInSchema.safeParse(request.body);

    if (!parsed.success) {
      return reply.code(400).send({ error: 'Invalid check-in toggle', details: parsed.error.flatten() });
    }

    const existing = db.prepare('SELECT * FROM check_ins WHERE task_id = ? AND date = ?').get(parsed.data.taskId, parsed.data.date) as any;

    if (existing && !existing.deleted_at) {
      return reply.code(409).send({ error: 'Already checked in for this date', checkIn: rowFromCheckIn(existing) });
    }

    const id = randomUUID();
    const createdAt = new Date().toISOString();
    if (existing) {
      db.prepare('UPDATE check_ins SET deleted_at = NULL, created_at = ?, id = ? WHERE task_id = ? AND date = ?')
        .run(createdAt, id, parsed.data.taskId, parsed.data.date);
    } else {
      db.prepare('INSERT INTO check_ins (id, task_id, date, created_at, deleted_at) VALUES (?, ?, ?, ?, NULL)')
        .run(id, parsed.data.taskId, parsed.data.date, createdAt);
    }

    broadcast('checkin.changed', { taskId: parsed.data.taskId, date: parsed.data.date });
    return reply.code(201).send({ checkedIn: true, checkIn: { id, taskId: parsed.data.taskId, date: parsed.data.date, createdAt } });
  });

  app.delete('/api/checkins/:taskId/:date', async (request, reply) => {
    const taskId = decodeURIComponent((request.params as any).taskId);
    const date = decodeURIComponent((request.params as any).date);

    if (!dateKey.safeParse(date).success) {
      return reply.code(400).send({ error: 'Invalid check-in date' });
    }

    const result = db.prepare('UPDATE check_ins SET deleted_at = ? WHERE task_id = ? AND date = ? AND deleted_at IS NULL')
      .run(new Date().toISOString(), taskId, date);

    broadcast('checkin.changed', { taskId, date });
    return { ok: true, deleted: result.changes > 0 };
  });

  app.get('/api/day-records', async () => {
    const rows = db.prepare('SELECT * FROM day_records ORDER BY date DESC, updated_at').all() as Array<any>;

    return rows.map(rowFromDayRecord);
  });

  app.post('/api/day-records', async (request, reply) => {
    const parsed = dayRecordSchema.safeParse(request.body);

    if (!parsed.success) {
      return reply.code(400).send({ error: 'Invalid day record', details: parsed.error.flatten() });
    }

    const task = db.prepare('SELECT id FROM tasks WHERE id = ? AND deleted_at IS NULL')
      .get(parsed.data.taskId) as any;

    if (!task) {
      return reply.code(404).send({ error: 'Task not found' });
    }

    const existing = db.prepare('SELECT * FROM day_records WHERE task_id = ? AND date = ?')
      .get(parsed.data.taskId, parsed.data.date) as any;
    const now = new Date().toISOString();
    const inputImages = parsed.data.images.length
      ? parsed.data.images
      : parsed.data.image
        ? [parsed.data.image]
        : [];
    const inputUploads = parsed.data.imageUploads ?? [
      ...(
        parsed.data.imageBase64s ?? (
          parsed.data.imageBase64 ? [parsed.data.imageBase64] : []
        )
      ).map((base64, index) => ({ index, base64 })),
    ];

    let savedImages: any[];

    try {
      savedImages = inputImages.map((inputImage, index) => {
        const existingImage = parseStoredImages(existing?.images_json).at(index);
        const sameMetadata = Boolean(
          existingImage
          && existingImage.fileName === inputImage.fileName
          && existingImage.width === inputImage.width
          && existingImage.height === inputImage.height
          && existingImage.mimeType === inputImage.mimeType,
        );
        const imageBase64 = inputUploads.find((upload) => upload.index === index)?.base64;

        if (!imageBase64) {
          if (sameMetadata && existingImage) {
            return existingImage;
          }

          throw new Error(`A new image ${index} requires an imageUpload payload`);
        }

        const storageName = `${randomUUID()}.${extensionForMimeType(inputImage.mimeType)}`;

        fs.writeFileSync(
          path.join(resolvedImageRoot, storageName),
          Buffer.from(imageBase64, 'base64'),
        );

        return {
          fileName: inputImage.fileName,
          width: inputImage.width,
          height: inputImage.height,
          mimeType: inputImage.mimeType,
          storageName,
        };
      });
    } catch (error) {
      return reply.code(400).send({ error: error instanceof Error ? error.message : 'Invalid images' });
    }

    const firstImage = savedImages.at(0);
    const savedStorageNames = new Set(savedImages.map((image) => image.storageName));

    for (const image of parseStoredImages(existing?.images_json)) {
      if (image.storageName && !savedStorageNames.has(image.storageName)) {
        fs.rmSync(path.join(resolvedImageRoot, path.basename(image.storageName)), { force: true });
      }
    }

    db.prepare(`
      INSERT INTO day_records (
        task_id, date, note, images_json, image_file_name, image_width, image_height,
        image_mime_type, image_storage_name, created_at, updated_at
      )
      VALUES (
        @taskId, @date, @note, @imagesJson, @fileName, @width, @height,
        @mimeType, @storageName, @createdAt, @updatedAt
      )
      ON CONFLICT(task_id, date) DO UPDATE SET
        note = excluded.note,
        images_json = excluded.images_json,
        image_file_name = excluded.image_file_name,
        image_width = excluded.image_width,
        image_height = excluded.image_height,
        image_mime_type = excluded.image_mime_type,
        image_storage_name = excluded.image_storage_name,
        updated_at = excluded.updated_at
    `).run({
      taskId: parsed.data.taskId,
      date: parsed.data.date,
      note: parsed.data.note,
      imagesJson: JSON.stringify(savedImages),
      fileName: firstImage?.fileName ?? null,
      width: firstImage?.width ?? null,
      height: firstImage?.height ?? null,
      mimeType: firstImage?.mimeType ?? null,
      storageName: firstImage?.storageName ?? null,
      createdAt: parsed.data.createdAt ?? now,
      updatedAt: parsed.data.updatedAt ?? now,
    });

    const saved = db.prepare('SELECT * FROM day_records WHERE task_id = ? AND date = ?')
      .get(parsed.data.taskId, parsed.data.date) as any;

    broadcast('dayrecord.changed', { taskId: parsed.data.taskId, date: parsed.data.date });
    return reply.code(existing ? 200 : 201).send(rowFromDayRecord(saved));
  });

  app.get('/api/day-records/:taskId/:date/image', async (request, reply) => {
    const taskId = decodeURIComponent((request.params as any).taskId);
    const date = decodeURIComponent((request.params as any).date);
    const row = db.prepare('SELECT * FROM day_records WHERE task_id = ? AND date = ?').get(taskId, date) as any;
    const filePath = imageStoragePath(row);

    if (!row || !filePath || !fs.existsSync(filePath)) {
      return reply.code(404).send({ error: 'Image not found' });
    }

    reply.header('Content-Type', row.image_mime_type);
    reply.header('Cache-Control', 'private, max-age=604800');

    return reply.send(fs.readFileSync(filePath));
  });

  app.get('/api/day-records/:taskId/:date/images/:index', async (request, reply) => {
    const taskId = decodeURIComponent((request.params as any).taskId);
    const date = decodeURIComponent((request.params as any).date);
    const index = Number((request.params as any).index);
    const row = db.prepare('SELECT * FROM day_records WHERE task_id = ? AND date = ?')
      .get(taskId, date) as any;
    const image = parseStoredImages(row?.images_json).at(index);
    const filePath = image?.storageName
      ? path.join(resolvedImageRoot, path.basename(image.storageName))
      : null;

    if (!image || !filePath || !fs.existsSync(filePath)) {
      return reply.code(404).send({ error: 'Image not found' });
    }

    reply.header('Content-Type', image.mimeType);
    reply.header('Cache-Control', 'private, max-age=604800');

    return reply.send(fs.readFileSync(filePath));
  });

  app.delete('/api/day-records/:taskId/:date/image', async (request, reply) => {
    const taskId = decodeURIComponent((request.params as any).taskId);
    const date = decodeURIComponent((request.params as any).date);
    const row = db.prepare('SELECT * FROM day_records WHERE task_id = ? AND date = ?').get(taskId, date) as any;
    const storedImages = parseStoredImages(row?.images_json);
    const filePath = imageStoragePath(row);

    if (!row) {
      return reply.code(404).send({ error: 'Day record not found' });
    }

    if (filePath) {
      fs.rmSync(filePath, { force: true });
    }

    for (const image of storedImages) {
      if (image.storageName) {
        fs.rmSync(path.join(resolvedImageRoot, path.basename(image.storageName)), { force: true });
      }
    }

    db.prepare(`
      UPDATE day_records SET
        images_json = '[]',
        image_file_name = NULL,
        image_width = NULL,
        image_height = NULL,
        image_mime_type = NULL,
        image_storage_name = NULL,
        updated_at = ?
      WHERE task_id = ? AND date = ?
    `).run(new Date().toISOString(), taskId, date);

    broadcast('dayrecord.changed', { taskId, date });
    return { ok: true };
  });

  return app;
}

function rowFromTask(row: any) {
  return {
    id: row.id,
    name: row.name,
    icon: row.icon,
    iconImage: row.icon_image ?? null,
    color: row.color,
    description: row.description,
    sortOrder: row.sort_order ?? 0,
    timerSegments: parseTimerSegments(row.timer_segments ?? '[]'),
    manualDurationMs: row.manual_duration_ms ?? 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at ?? null,
  };
}

function rowFromDayRecord(row: any) {
  return {
    taskId: row.task_id,
    date: row.date,
    note: row.note,
    images: parseStoredImages(row.images_json).map((image: any) => ({
      fileName: image.fileName,
      width: image.width,
      height: image.height,
      mimeType: image.mimeType,
      localUri: null,
    })),
    image: row.image_file_name
      ? {
        fileName: row.image_file_name,
        width: row.image_width,
        height: row.image_height,
        mimeType: row.image_mime_type,
        localUri: null,
      }
      : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowFromCheckIn(row: any) {
  return {
    id: row.id,
    taskId: row.task_id,
    date: row.date,
    createdAt: row.created_at,
  };
}
