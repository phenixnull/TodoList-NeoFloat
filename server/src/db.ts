import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

export type DatabaseOptions = {
  database?: string;
};

export function createDatabase({ database = 'habitpulse.db' }: DatabaseOptions = {}) {
  if (database !== ':memory:') {
    fs.mkdirSync(path.dirname(path.resolve(database)), { recursive: true });
  }

  const db = new Database(database);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      icon TEXT NOT NULL,
      icon_image TEXT,
      color TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      sort_order INTEGER NOT NULL DEFAULT 0,
      custom_groups TEXT NOT NULL DEFAULT '[]',
      timer_segments TEXT NOT NULL DEFAULT '[]',
      removed_segment_ids TEXT NOT NULL DEFAULT '[]',
      manual_duration_ms INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      schedule_window TEXT,
      deleted_at TEXT
    );

    CREATE TABLE IF NOT EXISTS check_ins (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL,
      date TEXT NOT NULL,
      created_at TEXT NOT NULL,
      deleted_at TEXT,
      UNIQUE(task_id, date),
      FOREIGN KEY(task_id) REFERENCES tasks(id)
    );

    CREATE INDEX IF NOT EXISTS idx_check_ins_task_date ON check_ins(task_id, date);

    CREATE TABLE IF NOT EXISTS day_records (
      task_id TEXT NOT NULL,
      date TEXT NOT NULL,
      note TEXT NOT NULL DEFAULT '',
      images_json TEXT NOT NULL DEFAULT '[]',
      image_file_name TEXT,
      image_width INTEGER,
      image_height INTEGER,
      image_mime_type TEXT,
      image_storage_name TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY(task_id, date),
      FOREIGN KEY(task_id) REFERENCES tasks(id)
    );

    CREATE TABLE IF NOT EXISTS feedback (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      device_info TEXT NOT NULL DEFAULT '',
      app_version TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'open',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS feedback_images (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      feedback_id TEXT NOT NULL,
      file_name TEXT NOT NULL,
      width INTEGER NOT NULL DEFAULT 0,
      height INTEGER NOT NULL DEFAULT 0,
      mime_type TEXT NOT NULL DEFAULT 'image/jpeg',
      storage_name TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY(feedback_id) REFERENCES feedback(id)
    );

    CREATE INDEX IF NOT EXISTS idx_feedback_images_feedback ON feedback_images(feedback_id);

    CREATE TABLE IF NOT EXISTS sync_state (
      id INTEGER PRIMARY KEY CHECK(id = 1),
      instance_id TEXT NOT NULL,
      revision INTEGER NOT NULL
    );
  `);

  db.prepare('INSERT OR IGNORE INTO sync_state (id, instance_id, revision) VALUES (1, ?, 0)')
    .run(randomUUID());

  const taskColumns = db.prepare('PRAGMA table_info(tasks)').all() as Array<{ name: string }>;

  if (!taskColumns.some((column) => column.name === 'icon_image')) {
    db.prepare('ALTER TABLE tasks ADD COLUMN icon_image TEXT').run();
  }

  for (const migration of [
    { column: 'sort_order', sql: 'ALTER TABLE tasks ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0' },
    { column: 'custom_groups', sql: "ALTER TABLE tasks ADD COLUMN custom_groups TEXT NOT NULL DEFAULT '[]'" },
    { column: 'timer_segments', sql: "ALTER TABLE tasks ADD COLUMN timer_segments TEXT NOT NULL DEFAULT '[]'" },
    { column: 'removed_segment_ids', sql: "ALTER TABLE tasks ADD COLUMN removed_segment_ids TEXT NOT NULL DEFAULT '[]'" },
    { column: 'manual_duration_ms', sql: 'ALTER TABLE tasks ADD COLUMN manual_duration_ms INTEGER NOT NULL DEFAULT 0' },
  ]) {
    if (!taskColumns.some((column) => column.name === migration.column)) {
      db.prepare(migration.sql).run();
    }
  }

  if (!taskColumns.some((column) => column.name === 'schedule_window')) {
    db.prepare('ALTER TABLE tasks ADD COLUMN schedule_window TEXT').run();
  }

  const dayColumns = db.prepare('PRAGMA table_info(day_records)').all() as Array<{ name: string }>;

  if (!dayColumns.some((column) => column.name === 'images_json')) {
    db.prepare("ALTER TABLE day_records ADD COLUMN images_json TEXT NOT NULL DEFAULT '[]'").run();
  }

  const checkInColumns = db.prepare('PRAGMA table_info(check_ins)').all() as Array<{ name: string }>;

  if (!checkInColumns.some((column) => column.name === 'deleted_at')) {
    db.prepare('ALTER TABLE check_ins ADD COLUMN deleted_at TEXT').run();
  }

  if (!checkInColumns.some((column) => column.name === 'status')) {
    db.prepare("ALTER TABLE check_ins ADD COLUMN status TEXT NOT NULL DEFAULT 'success'").run();
  }

  db.prepare("UPDATE check_ins SET status = 'success' WHERE status IS NULL OR status = ''").run();

  return db;
}
